import { detectCapabilities, capabilityWarnings } from './capabilities';
import type { BrowserCapabilities } from './capabilities';
import { WebSerialPrinterError } from './errors';
import { BluetoothPrinter } from './bluetoothPrinter';
import { PrintQueue } from './printQueue';
import type { PrintJob, PrintJobKind } from './printQueue';
import {
  DEFAULT_BILLING_PRINTER,
  loadPrinterConfigs, savePrinterConfigs,
  loadActivePrinterId, saveActivePrinterId
} from './printerConfig';
import type { PrinterConfig, PrinterRole } from './printerConfig';

export type PrinterConnState =
  | 'disconnected'
  | 'pairing'
  | 'connected'
  | 'reconnecting'
  | 'error';

/** Per-printer snapshot consumed by settings UI / context. */
export interface PrinterStatusInfo {
  id: string;
  name: string;
  role: PrinterRole;
  enabled: boolean;
  paired: boolean;
  state: PrinterConnState;
  deviceName: string;
  connection: string;
  lastError: string | null;
  jobs: PrintJob[];
  /** Full persisted configuration for this printer. */
  config: PrinterConfig;
}

type StatusListener = (statuses: PrinterStatusInfo[]) => void;

const RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 4000;

interface PrinterEntry {
  config: PrinterConfig;
  ble: BluetoothPrinter;
  queue: PrintQueue;
  state: PrinterConnState;
  lastError: string | null;
  /** true while a deliberate disconnect is in flight - suppresses auto-reconnect */
  intentionalDisconnect: boolean;
  reconnecting: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
}

/**
 * MultiPrinterManager - routes ESC/POS bytes to ROLE-ASSIGNED Bluetooth
 * printers (KITCHEN, BILLING, PARCEL, BAR).
 *
 *   View -> PrinterContext -> multiPrinterManager.route(role, bytes)
 *                                             |
 *                              per-printer PrintQueue (serialized per printer)
 *                                             |
 *                              per-printer BluetoothPrinter (own GATT link)
 *
 * Each physical printer owns an independent connection, queue, retry loop and
 * reconnect state machine. Different printers can print simultaneously.
 */
class MultiPrinterManager {
  private entries = new Map<string, PrinterEntry>();
  private activeId = '';
  private statusListeners = new Set<StatusListener>();
  private initialized = false;

  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;
    const configs = loadPrinterConfigs();
    this.activeId = loadActivePrinterId();
    for (const config of configs) this.ensureEntry(config);
    if (!this.entries.has(this.activeId)) {
      this.activeId = configs[0]?.id || DEFAULT_BILLING_PRINTER.id;
    }
  }

  private ensureEntry(config: PrinterConfig): PrinterEntry {
    let entry = this.entries.get(config.id);
    if (!entry) {
      const ble = new BluetoothPrinter();
      const queue = new PrintQueue();
      queue.setWriter(async (data: Uint8Array) => {
        await this.writeTo(entry!, data);
      });
      ble.onDisconnect = () => this.handleUnexpectedDrop(config.id);
      entry = {
        config,
        ble,
        queue,
        state: 'disconnected',
        lastError: null,
        intentionalDisconnect: false,
        reconnecting: false,
        reconnectTimer: null,
        reconnectAttempts: 0
      };
      this.entries.set(config.id, entry);
    }
    entry.config = config;
    return entry;
  }

  // ---------- configuration ----------

  getConfigs(): PrinterConfig[] {
    this.init();
    return [...this.entries.values()].map(e => e.config);
  }

  getActiveConfig(): PrinterConfig {
    this.init();
    return (
      this.entries.get(this.activeId)?.config ||
      this.getConfigs()[0] ||
      DEFAULT_BILLING_PRINTER
    );
  }

  setActivePrinter(id: string): void {
    this.init();
    if (!this.entries.has(id)) return;
    this.activeId = id;
    saveActivePrinterId(id);
  }

  upsertConfig(config: PrinterConfig): void {
    this.init();
    this.ensureEntry(config);
    savePrinterConfigs(this.getConfigs());
    if (config.id === this.activeId) saveActivePrinterId(this.activeId);
    this.emit();
  }

  removeConfig(id: string): void {
    this.init();
    const entry = this.entries.get(id);
    if (entry) {
      entry.intentionalDisconnect = true;
      void entry.ble.disconnect();
      if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
      this.entries.delete(id);
    }
    if (this.activeId === id) {
      this.activeId = this.getConfigs()[0]?.id || '';
      saveActivePrinterId(this.activeId);
    }
    savePrinterConfigs(this.getConfigs());
    this.emit();
  }

  /**
   * Config that should handle a role. Preference order:
   *   1. enabled config whose role matches exactly AND is connected
   *   2. enabled connected config of a compatible fallback role
   *      (PARCEL falls back to BILLING; others fall back to none)
   *   3. enabled config whose role matches exactly (will surface a clear
   *      "not connected" error at write time)
   *   4. active config, then any enabled config
   */
  resolveForRole(role: PrinterRole): PrinterConfig | null {
    this.init();
    const all = [...this.entries.values()].map(e => e.config);
    const enabled = all.filter(c => c.enabled);

    const byRole = (r: PrinterRole) => enabled.filter(c => c.role === r);
    const connectedIds = new Set(
      [...this.entries.values()].filter(e => e.ble.isConnected()).map(e => e.config.id)
    );

    const pickConnected = (list: PrinterConfig[]) =>
      list.find(c => connectedIds.has(c.id));

    const exact = byRole(role);
    const exactConnected = pickConnected(exact);
    if (exactConnected) return exactConnected;

    if (role === 'PARCEL') {
      const billingConnected = pickConnected(byRole('BILLING'));
      if (billingConnected) return billingConnected;
    }

    if (exact.length > 0) return exact[0];

    const active = enabled.find(c => c.id === this.getActiveConfig().id);
    if (active) return active;
    return enabled[0] ?? null;
  }

  // ---------- status ----------

  getStatuses(): PrinterStatusInfo[] {
    this.init();
    return [...this.entries.values()].map(e => ({
      id: e.config.id,
      name: e.config.name,
      role: e.config.role,
      enabled: e.config.enabled,
      paired: !!e.config.deviceId || e.ble.deviceId() !== null,
      state: e.state,
      deviceName: e.ble.deviceName(),
      connection: e.ble.describe(),
      lastError: e.lastError,
      jobs: e.queue.snapshot(),
      config: { ...e.config }
    }));
  }

  isConnected(id?: string): boolean {
    this.init();
    if (id) return !!this.entries.get(id)?.ble.isConnected();
    for (const e of this.entries.values()) {
      if (e.config.enabled && e.ble.isConnected()) return true;
    }
    return false;
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatuses());
    return () => this.statusListeners.delete(listener);
  }

  capabilities(): BrowserCapabilities {
    return detectCapabilities();
  }

  diagnostics(): Record<string, unknown> {
    this.init();
    const caps = this.capabilities();
    return {
      browserName: caps.browserName,
      platform: caps.platform,
      https: caps.secureContext,
      webBluetooth: caps.webBluetooth,
      webView: caps.isWebView,
      chromium: caps.isChromium,
      printers: this.getStatuses(),
      warnings: capabilityWarnings(caps)
    };
  }

  // ---------- connection lifecycle ----------

  /**
   * Pair + connect a printer via the chooser. MUST run inside a user gesture.
   * Persists the granted device id so future launches reconnect silently.
   */
  async connectPrinter(printerId: string): Promise<void> {
    this.init();
    const entry = this.entries.get(printerId);
    if (!entry) throw new WebSerialPrinterError('NOT_FOUND', 'Unknown printer');
    if (!BluetoothPrinter.isSupported()) {
      entry.state = 'error';
      entry.lastError = 'Web Bluetooth unavailable in this browser';
      this.emit();
      throw new WebSerialPrinterError(
        'NOT_SUPPORTED',
        'Web Bluetooth is not available. Use Chrome/Edge over https.'
      );
    }
    if (entry.ble.isConnected()) return;

    entry.state = 'pairing';
    entry.lastError = null;
    this.emit();
    try {
      const device = await entry.ble.pair(entry.config);
      const duplicate = [...this.entries.entries()].find(
        ([id, e]) => id !== printerId && !!e.config.deviceId && e.config.deviceId === device.id
      );
      if (duplicate) {
        const [, other] = duplicate;
        throw new WebSerialPrinterError(
          'DUPLICATE_DEVICE',
          `That unit is already bound to ${other.config.name}. Choose your OTHER KP-307 in the browser list (both may share the same name).`
        );
      }
      await entry.ble.connectDevice(device, entry.config);
      entry.config = { ...entry.config, deviceId: device.id };
      this.upsertConfig(entry.config);
      entry.state = 'connected';
      entry.reconnectAttempts = 0;
    } catch (err) {
      entry.state = 'error';
      entry.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      this.emit();
    }
  }

  async disconnectPrinter(printerId: string, forget = false): Promise<void> {
    this.init();
    const entry = this.entries.get(printerId);
    if (!entry) return;
    entry.intentionalDisconnect = true;
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }
    entry.reconnecting = false;
    await entry.ble.disconnect(forget);
    entry.state = 'disconnected';
    entry.lastError = null;
    if (forget) {
      entry.config = { ...entry.config, deviceId: undefined };
      savePrinterConfigs(this.getConfigs());
    }
    entry.intentionalDisconnect = false;
    this.emit();
  }

  /**
   * Launch-time silent reconnect for every configured printer using devices
   * already granted to this browser (no choosers).
   */
  async autoReconnectOnLaunch(): Promise<void> {
    this.init();
    if (!BluetoothPrinter.isSupported()) return;
    let granted: BluetoothDevice[] = [];
    try {
      granted = await navigator.bluetooth!.getDevices();
    } catch {
      return;
    }
    for (const entry of this.entries.values()) {
      const { deviceId } = entry.config;
      if (!deviceId || !entry.config.enabled || entry.ble.isConnected()) continue;
      const device = granted.find(d => d.id === deviceId);
      if (!device) continue;
      try {
        await entry.ble.connectDevice(device, entry.config);
        entry.state = 'connected';
        entry.lastError = null;
      } catch (err) {
        entry.state = 'error';
        entry.lastError = err instanceof Error ? err.message : String(err);
      }
    }
    this.emit();
  }

  private handleUnexpectedDrop(printerId: string): void {
    const entry = this.entries.get(printerId);
    if (!entry || entry.intentionalDisconnect) return;
    entry.state = 'reconnecting';
    entry.lastError = 'Connection lost - attempting to reconnect';
    this.emit();
    this.scheduleReconnect(entry);
  }

  /**
   * Re-open GATT on an unexpected drop. Uses the still-granted device only -
   * never opens a chooser. If the grant was revoked, the user must tap Connect.
   */
  private scheduleReconnect(entry: PrinterEntry, attempt = 0): void {
    if (entry.intentionalDisconnect || entry.reconnectTimer) return;
    entry.reconnecting = true;
    const run = async () => {
      const ok = await entry.ble.tryReconnect(entry.config);
      if (ok) {
        entry.reconnecting = false;
        entry.state = 'connected';
        entry.lastError = null;
        entry.reconnectAttempts = 0;
        this.emit();
        return;
      }
      if (attempt + 1 < RECONNECT_ATTEMPTS) {
        entry.reconnectTimer = setTimeout(() => {
          entry.reconnectTimer = null;
          this.scheduleReconnect(entry, attempt + 1);
        }, RECONNECT_DELAY_MS);
      } else {
        entry.reconnecting = false;
        entry.state = entry.config.deviceId ? 'disconnected' : 'error';
        entry.lastError =
          'Printer unreachable. Move it in range or tap Connect to re-pair.';
        this.emit();
      }
    };
    void run();
  }

  // ---------- write path ----------

  /** One silent reconnect attempt, then write through the GATT link. */
  private async writeTo(entry: PrinterEntry, data: Uint8Array): Promise<void> {
    if (!entry.ble.isConnected()) {
      const ok = await entry.ble.tryReconnect(entry.config);
      if (!ok) {
        throw new WebSerialPrinterError(
          'NOT_CONNECTED',
          `${entry.config.name} is not connected`
        );
      }
      entry.state = 'connected';
      this.emit();
    }
    try {
      await entry.ble.print(data);
    } catch (err: unknown) {
      if (err instanceof WebSerialPrinterError && err.code === 'DISCONNECTED') {
        entry.state = 'reconnecting';
        this.emit();
        this.handleUnexpectedDrop(entry.config.id);
      }
      throw err;
    }
  }

  /**
   * Enqueue directly on ONE specific printer (used by Test Print in settings,
   * bypassing role routing).
   */
  async printOn(printerId: string, opts: {
    kind: PrintJobKind;
    label: string;
    data: Uint8Array;
    maxAttempts?: number;
  }): Promise<boolean> {
    this.init();
    const entry = this.entries.get(printerId);
    if (!entry) {
      throw new WebSerialPrinterError('NOT_FOUND', 'Unknown printer');
    }
    return entry.queue.enqueue({
      kind: opts.kind,
      role: String(entry.config.role),
      label: opts.label,
      data: opts.data,
      maxAttempts: opts.maxAttempts
    });
  }

  /**
   * Route raw ESC/POS bytes to the printer assigned to `role`.
   * Resolves true only when the job actually printed.
   */
  async route(opts: {
    kind: PrintJobKind;
    role: PrinterRole;
    label: string;
    data: Uint8Array;
    maxAttempts?: number;
  }): Promise<boolean> {
    this.init();
    const config = this.resolveForRole(opts.role);
    if (!config) {
      throw new WebSerialPrinterError(
        'NOT_FOUND',
        `No printer is configured for ${opts.role}`
      );
    }
    const entry = this.ensureEntry(config);
    return entry.queue.enqueue({
      kind: opts.kind,
      role: String(opts.role),
      label: opts.label,
      data: opts.data,
      maxAttempts: opts.maxAttempts
    });
  }

  queueOf(printerId: string): PrintQueue | null {
    return this.entries.get(printerId)?.queue ?? null;
  }

  retryJob(printerId: string, jobId: string): void {
    this.queueOf(printerId)?.retry(jobId);
  }

  cancelJob(printerId: string, jobId: string): void {
    this.queueOf(printerId)?.cancel(jobId);
  }

  clearFinishedJobs(): void {
    for (const e of this.entries.values()) e.queue.clearFinished();
  }

  private emit(): void {
    const statuses = this.getStatuses();
    this.statusListeners.forEach(l => l(statuses));
  }
}

export const printerHub = new MultiPrinterManager();
