import { detectCapabilities, capabilityWarnings } from './capabilities';
import type { BrowserCapabilities } from './capabilities';
import { WebSerialPrinterError } from './errors';
import { printQueue } from './printQueue';
import type { PrintJobKind } from './printQueue';
import {
  DEFAULT_PRINTER, loadPrinterConfigs, savePrinterConfigs,
  loadActivePrinterId, saveActivePrinterId
} from './printerConfig';
import type { PrinterConfig, PrinterRole } from './printerConfig';
import { webSerialTransport } from './transports/webSerialTransport';
import { webBluetoothTransport } from './transports/webBluetoothTransport';
import type { PrinterTransport } from './transports/types';

export type PrinterManagerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unsupported'
  | 'permission-required'
  | 'error';

export interface PrinterDiagnostics {
  browserName: string;
  platform: string;
  androidDetected: boolean;
  https: boolean;
  webSerial: boolean;
  webBluetooth: boolean;
  webView: boolean;
  chromium: boolean;
  grantedSerialPorts: number;
  bluetoothPermission: 'AVAILABLE' | 'UNKNOWN';
  printerConnected: boolean;
  connectionType: string;
  warnings: string[];
}

type StatusListener = (status: PrinterManagerStatus) => void;

const RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 3000;

/**
 * PrinterManager - the single facade between the POS and the physical KP-307.
 *
 *   POS views -> PrinterContext -> PrinterManager -> transport -> ESC/POS bytes
 *
 * Transport selection:
 *   - connectionType BLUETOOTH  : Web Serial first (KP-307 SPP). If this
 *     browser has no Web Serial at all, it probes BLE once and fails honestly
 *     if the printer is not a BLE device.
 *   - connectionType BLE        : Web Bluetooth explicitly (genuine BLE units).
 */
class PrinterManager {
  private configs: PrinterConfig[] = [];
  private activeId = '';
  private transport: PrinterTransport | null = null;
  private statusValue: PrinterManagerStatus = 'disconnected';
  private lastError: unknown = null;
  private statusListeners = new Set<StatusListener>();
  private reconnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;
    this.configs = loadPrinterConfigs();
    this.activeId = loadActivePrinterId();
    if (!this.configs.some(c => c.id === this.activeId)) {
      this.activeId = this.configs[0]?.id || DEFAULT_PRINTER.id;
    }
    // Watch for unexpected drops (BT out of range, printer off) and run the
    // CONNECTED -> DISCONNECTED -> RECONNECTING -> CONNECTED state machine.
    this.observeDisconnects();
  }

  /**
   * Both transports expose disconnects differently; poll cheaply instead of
   * patching EventTargets so behaviour stays identical across browsers.
   */
  private observeDisconnects(): void {
    setInterval(() => {
      if (
        this.statusValue === 'connected' &&
        this.transport &&
        !this.transport.isConnected()
      ) {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      }
    }, 2000);
  }

  getConfigs(): PrinterConfig[] {
    return this.configs;
  }

  getActiveConfig(): PrinterConfig {
    return this.configs.find(c => c.id === this.activeId) || this.configs[0] || DEFAULT_PRINTER;
  }

  setActivePrinter(id: string): void {
    if (!this.configs.some(c => c.id === id)) return;
    this.activeId = id;
    saveActivePrinterId(id);
  }

  upsertConfig(config: PrinterConfig): void {
    const idx = this.configs.findIndex(c => c.id === config.id);
    if (idx >= 0) this.configs[idx] = config;
    else this.configs.push(config);
    savePrinterConfigs(this.configs);
    if (config.id === this.activeId || this.configs.length === 1) {
      this.activeId = config.id;
      saveActivePrinterId(this.activeId);
    }
  }

  removeConfig(id: string): void {
    this.configs = this.configs.filter(c => c.id !== id);
    if (this.configs.length === 0) this.configs = [DEFAULT_PRINTER];
    if (!this.configs.some(c => c.id === this.activeId)) {
      this.activeId = this.configs[0].id;
    }
    savePrinterConfigs(this.configs);
    saveActivePrinterId(this.activeId);
  }

  /** Config that should handle a given role (kitchen items, bills, parcels...). */
  resolveForRole(role: PrinterRole): PrinterConfig {
    const byRole = this.configs.find(c => c.enabled && c.role === role);
    if (byRole) return byRole;
    const active = this.getActiveConfig();
    if (active.enabled) return active;
    const anyEnabled = this.configs.find(c => c.enabled);
    return anyEnabled || active;
  }

  getStatus(): PrinterManagerStatus {
    return this.statusValue;
  }

  isConnected(): boolean {
    return !!this.transport?.isConnected();
  }

  connectionLabel(): string {
    return this.transport ? this.transport.label : '';
  }

  describeConnection(): string {
    return this.transport ? this.transport.describe() : 'Not connected';
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.statusValue);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: PrinterManagerStatus, err?: unknown): void {
    this.statusValue = status;
    if (err !== undefined) this.lastError = err;
    this.statusListeners.forEach(l => l(status));
  }

  lastErrorInfo(): unknown {
    return this.lastError;
  }

  /** Interactive connect - MUST be called from a user gesture handler. */
  async connect(printerId?: string): Promise<void> {
    this.init();
    if (printerId) this.setActivePrinter(printerId);
    const config = this.getActiveConfig();

    const caps = this.capabilities();
    if (!caps.webSerial && !caps.webBluetooth) {
      this.setStatus('unsupported');
      throw new WebSerialPrinterError('NOT_SUPPORTED', 'No browser printer access');
    }
    if (!caps.secureContext) {
      this.setStatus('error');
      throw new WebSerialPrinterError('SECURITY_ERROR', 'Insecure context');
    }

    this.setStatus('connecting');
    try {
      await this.openWithTransport(config);
      this.setStatus('connected');
    } catch (err: any) {
      if (err?.code === 'PERMISSION_REQUIRED') this.setStatus('permission-required', err);
      else this.setStatus('error', err);
      throw err;
    }
  }

  private async openWithTransport(config: PrinterConfig): Promise<void> {
    if (config.connectionType === 'BLE') {
      this.transport = webBluetoothTransport;
      webBluetoothTransport.onDisconnect = () => {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };
      await webBluetoothTransport.connect(config);
      return;
    }

    // BLUETOOTH: serial-first. Fall back to a single honest BLE probe only
    // when this browser has no Web Serial whatsoever.
    if (webSerialTransport.isSupported()) {
      this.transport = webSerialTransport;
      await webSerialTransport.connect(config);
      return;
    }
    if (webBluetoothTransport.isSupported()) {
      this.transport = webBluetoothTransport;
      webBluetoothTransport.onDisconnect = () => {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };
      try {
        await webBluetoothTransport.connect(config);
      } catch (err: any) {
        if (err?.code === 'NO_BLE_SERVICE' || err?.code === 'NO_BLE_CHARACTERISTIC') {
          throw new WebSerialPrinterError(
            'NOT_SUPPORTED',
            'Browser has no Web Serial and the KP-307 does not expose BLE printing'
          );
        }
        throw err;
      }
      return;
    }
    throw new WebSerialPrinterError('NOT_SUPPORTED', 'No browser printer access');
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnecting = false;
    if (this.transport) {
      await this.transport.disconnect();
    }
    this.setStatus('disconnected');
  }

  /** Silent auto-reconnect on app start using previously granted ports. */
  async autoReconnectOnLaunch(): Promise<void> {
    this.init();
    const config = this.getActiveConfig();
    if (!config.enabled) return;
    if (webSerialTransport.isSupported()) {
      const ok = await webSerialTransport.tryReconnect(config);
      if (ok) {
        this.transport = webSerialTransport;
        this.setStatus('connected');
      }
    }
  }

  /**
   * Reconnect after an unexpected drop. Only uses already-granted ports -
   * never spams permission dialogs. If permission was lost, the user must tap
   * Connect again (explicit gesture), which browsers require anyway.
   */
  private scheduleReconnect(attempt = 0): void {
    if (this.reconnecting) return;
    const config = this.getActiveConfig();
    if (!config.enabled) return;
    this.reconnecting = true;
    const run = async () => {
      try {
        let ok = false;
        if (this.transport === webBluetoothTransport) {
          ok = await webBluetoothTransport.tryReconnect(config);
        } else if (webSerialTransport.isSupported()) {
          this.transport = webSerialTransport;
          ok = await webSerialTransport.tryReconnect(config);
        }
        if (ok) {
          this.reconnecting = false;
          this.setStatus('connected');
          return;
        }
      } catch { /* keep retrying below */ }
      if (attempt + 1 < RECONNECT_ATTEMPTS) {
        this.setStatus('reconnecting');
        this.reconnectTimer = setTimeout(() => {
          this.reconnecting = false;
          this.scheduleReconnect(attempt + 1);
        }, RECONNECT_DELAY_MS);
      } else {
        this.reconnecting = false;
        this.setStatus('disconnected');
      }
    };
    void run();
  }

  /** Write path used by the print queue. One silent reconnect, no dialogs. */
  private async writeToPrinter(data: Uint8Array): Promise<void> {
    if (!this.isConnected()) {
      const config = this.getActiveConfig();
      if (this.transport && (await this.transport.tryReconnect(config))) {
        this.setStatus('connected');
      } else {
        throw new WebSerialPrinterError('NOT_CONNECTED', 'Printer not connected');
      }
    }
    const transport = this.transport!;
    try {
      await transport.write(data);
    } catch (err: any) {
      if (err?.code === 'DISCONNECTED') {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      }
      throw err;
    }
  }

  /** Enqueue a job; resolves true only when the paper is actually printed. */
  async print(opts: {
    kind: PrintJobKind;
    role: PrinterRole | string;
    label: string;
    data: Uint8Array;
  }): Promise<boolean> {
    this.init();
    printQueue.setWriter(d => this.writeToPrinter(d));
    return printQueue.enqueue({
      kind: opts.kind,
      role: String(opts.role),
      label: opts.label,
      data: opts.data
    });
  }

  capabilities(): BrowserCapabilities {
    return detectCapabilities();
  }

  async diagnostics(): Promise<PrinterDiagnostics> {
    this.init();
    const caps = this.capabilities();
    let grantedSerialPorts = 0;
    if (caps.webSerial) {
      grantedSerialPorts = (await webSerialTransport.getGrantedPorts()).length;
    }
    let bluetoothPermission: 'AVAILABLE' | 'UNKNOWN' = 'UNKNOWN';
    try {
      await (navigator.permissions as any).query({ name: 'bluetooth' });
      bluetoothPermission = 'AVAILABLE';
    } catch { /* not queryable on this platform */ }

    return {
      browserName: caps.browserName,
      platform: caps.platform,
      androidDetected: caps.isAndroid,
      https: caps.secureContext,
      webSerial: caps.webSerial,
      webBluetooth: caps.webBluetooth,
      webView: caps.isWebView,
      chromium: caps.isChromium,
      grantedSerialPorts,
      bluetoothPermission,
      printerConnected: this.isConnected(),
      connectionType: this.transport ? this.transport.label : '',
      warnings: capabilityWarnings(caps)
    };
  }
}

export const printerManager = new PrinterManager();
