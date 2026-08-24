import { WebSerialPrinterError } from './errors';
import { errorCode } from './errors';
import { KNOWN_BLE_PRINTER_SERVICES, type PrinterConfig } from './printerConfig';

const FULL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHORT_UUID_RE = /^[0-9a-f]{4}$/;

function normalizeBleServiceUuid(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (FULL_UUID_RE.test(v)) return v;
  if (SHORT_UUID_RE.test(v)) return `0000${v}-0000-1000-8000-00805f9b34fb`;
  throw new WebSerialPrinterError(
    'BAD_BLE_SERVICE_UUID',
    `"${raw}" is not a valid BLE service UUID (use 4 hex digits or the full 128-bit form)`
  );
}

/**
 * BluetoothPrinter - ONE BLE/GATT connection to ONE thermal printer.
 *
 * The POS instantiates one of these per configured printer (KITCHEN, BILLING,
 * ...), so two KP-307 units stay connected simultaneously and never share a
 * transport.
 *
 * Connection lifecycle:
 *   pair()            - user gesture -> chooser -> remember device.id
 *   connectDevice()   - open GATT + discover writable characteristic
 *   connectRemembered - silent relaunch reconnect via getDevices()
 *   tryReconnect()    - re-open GATT after an unexpected drop (no dialogs)
 *
 * All writes are serialized through an internal promise queue so jobs on this
 * printer never interleave ESC/POS bytes.
 */
interface WriteMode {
  withResponse: boolean;
  size: number;
}

const CHUNK_LADDER = [512, 240, 120, 52, 20];

/**
 * Hard ceiling for GATT connect + service discovery. Without this, Chrome
 * silently retries a sleeping/unreachable peripheral for MINUTES before
 * surfacing an error - staff see an endless spinner instead of guidance.
 */
const CONNECT_TIMEOUT_MS = 15000;

function errCode(message: string): WebSerialPrinterError {
  return new WebSerialPrinterError('OPEN_FAILED', message);
}

async function withTimeout<T>(task: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(errCode(`Printer did not respond within ${Math.round(ms / 1000)} s - power-cycle it (hold FEED ~5 s) and try again`)),
          ms
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class BluetoothPrinter {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private printing = false;
  private queue: Promise<void> = Promise.resolve();
  /** Largest acknowledged payload proven to work on the current connection. */
  private workingMode: WriteMode | null = null;

  /** Fired when the peripheral drops the GATT link on its own. */
  onDisconnect: (() => void) | null = null;

  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.bluetooth &&
      typeof window !== 'undefined' &&
      window.isSecureContext === true
    );
  }

  isConnected(): boolean {
    return !!(this.device?.gatt?.connected && this.characteristic);
  }

  isPrinting(): boolean {
    return this.printing;
  }

  /** Stable browser-assigned id of the paired device (for config persistence). */
  deviceId(): string | null {
    return this.device?.id ?? null;
  }

  deviceName(): string {
    if (!this.device) return '';
    return this.device.name || this.device.id.slice(0, 8);
  }

  describe(): string {
    if (!this.device) return 'Not connected';
    const state = this.isConnected() ? 'GATT writable' : 'GATT';
    return `BLE ${this.deviceName()} (${state})`;
  }

  /**
   * Pair a NEW printer via the browser chooser. MUST be called from a user
   * gesture handler. Returns the chosen device so the caller can persist
   * its id in the printer config.
   */
  async pair(config: PrinterConfig): Promise<BluetoothDevice> {
    if (!BluetoothPrinter.isSupported()) {
      throw new WebSerialPrinterError(
        'NOT_SUPPORTED',
        'Web Bluetooth is not available. Use Chrome/Edge on a secure (https) page.'
      );
    }

    const requested = config.bleServiceUuid
      ? normalizeBleServiceUuid(config.bleServiceUuid)
      : null;
    const optionalServices: Array<string | number> = Array.from(
      new Set([...KNOWN_BLE_PRINTER_SERVICES, ...(requested ? [requested] : [])])
    );

    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth!.requestDevice({
        acceptAllDevices: true,
        optionalServices
      });
    } catch (err) {
      const code = errorCode(err);
      if (code === 'NotFoundError' || code === 'AbortError') {
        throw new WebSerialPrinterError('USER_CANCELLED', 'No printer selected');
      }
      if (code === 'SecurityError' || code === 'TypeError') {
        throw new WebSerialPrinterError('SECURITY_ERROR', 'Insecure context');
      }
      throw new WebSerialPrinterError(
        'CONNECT_FAILED',
        (err as Error)?.message || 'Bluetooth chooser failed'
      );
    }
    return device;
  }

  /**
   * Silent launch-time reconnect to a previously granted device. Web Bluetooth
   * keeps grants per-browser; getDevices() returns them without a chooser.
   */
  async connectRemembered(deviceId: string, config: PrinterConfig): Promise<boolean> {
    if (!BluetoothPrinter.isSupported()) return false;
    if (this.isConnected()) return true;
    try {
      const granted = await navigator.bluetooth!.getDevices();
      const match = granted.find(d => d.id === deviceId);
      if (!match) return false;
      await this.connectDevice(match, config);
      return true;
    } catch {
      return false;
    }
  }

  /** Open GATT + discover writable characteristic on the given device. */
  async connectDevice(device: BluetoothDevice, config: PrinterConfig): Promise<void> {
    if (this.device === device && this.isConnected()) return;

    const gatt = device.gatt;
    if (!gatt) {
      throw new WebSerialPrinterError('NO_BLE_SERVICE', 'Printer exposes no GATT server');
    }

    try {
      await withTimeout(() => gatt.connect(), CONNECT_TIMEOUT_MS);
    } catch (err) {
      // Abandon the stalled link immediately so Chrome stops retrying silently
      try { gatt.disconnect(); } catch { /* ignore */ }
      if (err instanceof WebSerialPrinterError) throw err;
      throw new WebSerialPrinterError(
        'OPEN_FAILED',
        (err as Error)?.message || 'GATT connect failed'
      );
    }

    let characteristic: BluetoothRemoteGATTCharacteristic | null;
    try {
      characteristic = await withTimeout(
        () => this.findWritable(gatt, config),
        CONNECT_TIMEOUT_MS
      );
    } catch (err) {
      // Clean up the half-open link so the printer returns to advertising mode
      try { gatt.disconnect(); } catch { /* ignore */ }
      throw err;
    }
    if (!characteristic) {
      try { gatt.disconnect(); } catch { /* ignore */ }
      throw new WebSerialPrinterError(
        'NO_BLE_CHARACTERISTIC',
        'Printer has no writable BLE characteristic'
      );
    }

    this.device = device;
    this.characteristic = characteristic;
    this.workingMode = null;

    device.addEventListener('gattserverdisconnected', this.handleGattDisconnected);
  }

  private handleGattDisconnected = (): void => {
    this.characteristic = null;
    this.workingMode = null;
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleGattDisconnected);
    }
    this.onDisconnect?.();
  };

  private async findWritable(
    gatt: NonNullable<BluetoothDevice['gatt']>,
    config: PrinterConfig
  ): Promise<BluetoothRemoteGATTCharacteristic | null> {
    let wanted: string | null = null;
    if (config.bleServiceUuid) {
      try {
        wanted = normalizeBleServiceUuid(config.bleServiceUuid);
      } catch { /* malformed stored value - fall back to known list */ }
    }

    const pickWritable = (
      chars: BluetoothRemoteGATTCharacteristic[]
    ): BluetoothRemoteGATTCharacteristic | null =>
      chars.find(ch => ch.properties.write || ch.properties.writeWithoutResponse) ?? null;

    /**
     * Fast path: probe only the well-known thermal-printer services (or the
     * operator-configured one). Each miss fails instantly with NotFoundError,
     * so this finishes in milliseconds instead of walking every service and
     * characteristic on slow firmware.
     */
    const candidates = wanted ? [wanted] : KNOWN_BLE_PRINTER_SERVICES;
    for (const uuid of candidates) {
      try {
        const service = await gatt.getPrimaryService(uuid);
        const chars = await service.getCharacteristics();
        const found = pickWritable(chars);
        if (found) return found;
      } catch { /* not this one - try next */ }
    }
    if (wanted) {
      throw new WebSerialPrinterError(
        'NO_BLE_SERVICE',
        'Printer does not expose the configured BLE service UUID'
      );
    }

    // Slow path fallback: exhaustive discovery of everything we may access.
    let services;
    try {
      services = await gatt.getPrimaryServices();
    } catch (err) {
      const code = errorCode(err);
      if (code === 'NotFoundError') {
        throw new WebSerialPrinterError(
          'NO_BLE_SERVICE',
          'No accessible BLE service on printer'
        );
      }
      throw new WebSerialPrinterError(
        'OPEN_FAILED',
        (err as Error)?.message || 'GATT discovery failed'
      );
    }

    for (const service of services) {
      let chars: BluetoothRemoteGATTCharacteristic[] = [];
      try {
        chars = await service.getCharacteristics();
      } catch { /* blocked service - skip */ }
      const found = pickWritable(chars);
      if (found) return found;
    }
    return null;
  }

  /**
   * Re-open GATT after an unexpected drop using the still-held device object.
   * Never opens a chooser; returns false when re-granting would be required.
   */
  async tryReconnect(config: PrinterConfig): Promise<boolean> {
    if (this.isConnected()) return true;
    if (!this.device || !BluetoothPrinter.isSupported()) return false;
    try {
      await this.connectDevice(this.device, config);
      return true;
    } catch {
      return false;
    }
  }

  /** Deliberate user-initiated disconnect. Safe when already disconnected. */
  async disconnect(forget = false): Promise<void> {
    const device = this.device;
    this.characteristic = null;
    this.workingMode = null;
    this.device = null;
    if (device) {
      device.removeEventListener('gattserverdisconnected', this.handleGattDisconnected);
      try { device.gatt?.disconnect(); } catch { /* ignore */ }
      if (forget) {
        try { await device.forget(); } catch { /* ignore */ }
      }
    }
    this.printing = false;
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.queue.then(job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Candidate write modes, ordered most-reliable-and-fastest first.
   *
   * writeWithResponse is preferred: ATT long writes guarantee up to 512-byte
   * payloads regardless of negotiated MTU, and every block is ACKed by the
   * printer (real flow control - critical for multi-KB raster bitmaps).
   * writeWithoutResponse has no flow control and its payload must fit a single
   * MTU packet, so it only appears with conservative sizes as a last resort.
   */
  private writeModes(ch: BluetoothRemoteGATTCharacteristic): WriteMode[] {
    const modes: WriteMode[] = [];
    if (ch.properties.write) {
      for (const size of CHUNK_LADDER) modes.push({ withResponse: true, size });
    }
    if (ch.properties.writeWithoutResponse) {
      for (const size of CHUNK_LADDER) {
        if (size <= 240) modes.push({ withResponse: false, size });
      }
    }
    return modes;
  }

  /**
   * Send the full payload, starting at the largest payload this connection has
   * already accepted. If a size is rejected mid-transfer (firmware/MTU limits),
   * downgrade and restart from the beginning of the payload rather than
   * splicing mismatched chunk sizes into one stream. The winning size is
   * remembered so subsequent jobs skip probing entirely.
   */
  private async writeAll(
    ch: BluetoothRemoteGATTCharacteristic,
    device: BluetoothDevice,
    data: Uint8Array
  ): Promise<void> {
    let modes = this.writeModes(ch);
    if (this.workingMode) {
      modes = [this.workingMode, ...modes.filter(m => m !== this.workingMode)];
    }

    let lastError: unknown = null;
    for (const mode of modes) {
      try {
        for (let offset = 0; offset < data.length; offset += mode.size) {
          const end = Math.min(offset + mode.size, data.length);
          const chunk = data.subarray(offset, end) as unknown as BufferSource;
          if (mode.withResponse) {
            await ch.writeValueWithResponse(chunk);
          } else {
            await ch.writeValueWithoutResponse(chunk);
          }
        }
        this.workingMode = mode;
        return;
      } catch (err) {
        lastError = err;
        if (!device.gatt?.connected) break;
      }
    }
    throw lastError ?? new Error('No writable BLE mode available');
  }

  /** Send raw ESC/POS bytes over GATT, adaptively chunked, strictly serialized. */
  print(data: Uint8Array): Promise<void> {
    if (!this.isConnected()) {
      throw new WebSerialPrinterError('NOT_CONNECTED', 'BLE printer is not connected');
    }
    return this.enqueue(async () => {
      const ch = this.characteristic;
      const device = this.device;
      if (!ch || !device?.gatt?.connected) {
        throw new WebSerialPrinterError('NOT_CONNECTED', 'BLE printer is not connected');
      }
      this.printing = true;
      try {
        await this.writeAll(ch, device, data);
      } catch (err) {
        if (!device.gatt?.connected) {
          this.handleGattDisconnected();
          throw new WebSerialPrinterError('DISCONNECTED', 'BLE printer dropped during write');
        }
        throw new WebSerialPrinterError(
          'WRITE_FAILED',
          (err as Error)?.message || 'BLE write failed'
        );
      } finally {
        this.printing = false;
      }
    });
  }
}
