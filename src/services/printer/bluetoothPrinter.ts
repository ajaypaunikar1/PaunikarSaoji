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
export class BluetoothPrinter {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private printing = false;
  private queue: Promise<void> = Promise.resolve();

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
      await gatt.connect();
    } catch (err) {
      throw new WebSerialPrinterError(
        'OPEN_FAILED',
        (err as Error)?.message || 'GATT connect failed'
      );
    }

    const characteristic = await this.findWritable(gatt, config);
    if (!characteristic) {
      try { gatt.disconnect(); } catch { /* ignore */ }
      throw new WebSerialPrinterError(
        'NO_BLE_CHARACTERISTIC',
        'Printer has no writable BLE characteristic'
      );
    }

    this.device = device;
    this.characteristic = characteristic;

    device.addEventListener('gattserverdisconnected', this.handleGattDisconnected);
  }

  private handleGattDisconnected = (): void => {
    this.characteristic = null;
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleGattDisconnected);
    }
    this.onDisconnect?.();
  };

  private async findWritable(
    gatt: NonNullable<BluetoothDevice['gatt']>,
    config: PrinterConfig
  ): Promise<BluetoothRemoteGATTCharacteristic | null> {
    let services;
    let wanted: string | null = null;
    if (config.bleServiceUuid) {
      try {
        wanted = normalizeBleServiceUuid(config.bleServiceUuid);
      } catch { /* malformed stored value - fall back to full discovery */ }
    }
    try {
      services = wanted
        ? [await gatt.getPrimaryService(wanted)]
        : await gatt.getPrimaryServices();
    } catch (err) {
      const code = errorCode(err);
      if (code === 'NotFoundError') {
        throw new WebSerialPrinterError(
          'NO_BLE_SERVICE',
          wanted
            ? 'Printer does not expose the configured BLE service UUID'
            : 'No accessible BLE service on printer'
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
      for (const ch of chars) {
        if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
      }
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

  /** Send raw ESC/POS bytes over GATT, MTU-safe chunked, strictly serialized. */
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
        const useWithoutResponse = !!ch.properties.writeWithoutResponse;
        const chunkSize = useWithoutResponse ? 20 : 512;
        for (let offset = 0; offset < data.length; offset += chunkSize) {
          const chunk = data.subarray(offset, Math.min(offset + chunkSize, data.length)) as unknown as BufferSource;
          if (useWithoutResponse) {
            await ch.writeValueWithoutResponse(chunk);
          } else {
            await ch.writeValueWithResponse(chunk);
          }
        }
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
