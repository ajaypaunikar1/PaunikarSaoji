import type { PrinterConfig } from '../printerConfig';
import type { PrinterTransport } from './types';
import { WebSerialPrinterError, errorCode } from '../errors';

/**
 * Web Bluetooth (BLE/GATT) transport - FALLBACK ONLY.
 *
 * A KP-307 is usually Bluetooth Classic SPP and must be reached through the
 * Web Serial transport. This transport is used only when the user explicitly
 * selects BLE mode AND the printer genuinely exposes a writable GATT
 * characteristic.
 *
 * No service/characteristic UUIDs are invented here:
 *  - If the printer config carries a bleServiceUuid (entered by the operator
 *    under Advanced), that service is requested explicitly.
 *  - Otherwise we connect with acceptAllDevices and attempt generic discovery;
 *    if Chrome blocks discovery or no writable characteristic exists, we fail
 *    with NO_BLE_SERVICE / NO_BLE_CHARACTERISTIC and point the user back to
 *    Web Serial.
 */
class WebBluetoothTransport implements PrinterTransport {
  readonly kind = 'web-bluetooth' as const;
  readonly label = 'Web Bluetooth';

  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'bluetooth' in navigator &&
      typeof window !== 'undefined' &&
      window.isSecureContext
    );
  }

  isConnected(): boolean {
    return !!(this.device?.gatt?.connected && this.characteristic);
  }

  describe(): string {
    if (!this.device) return 'Not connected';
    const name = this.device.name || this.device.id.slice(0, 8);
    const svc = this.characteristic ? 'GATT writable' : 'GATT';
    return `BLE ${name} (${svc})`;
  }

  async connect(config: PrinterConfig): Promise<void> {
    if (!this.isSupported()) {
      throw new WebSerialPrinterError('NOT_SUPPORTED', 'Web Bluetooth unavailable');
    }
    if (this.isConnected()) return;

    const optionalServices: Array<string | number> = [];
    if (config.bleServiceUuid) optionalServices.push(config.bleServiceUuid);

    let device: BluetoothDevice;
    try {
      device = await (navigator.bluetooth as Bluetooth).requestDevice({
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
      throw new WebSerialPrinterError('OPEN_FAILED', (err as Error)?.message || 'Bluetooth chooser failed');
    }

    device.addEventListener('gattserverdisconnected', () => {
      this.characteristic = null;
      this.device = null;
      this.onDisconnect?.();
    });

    await this.openGatt(device, config);
    this.device = device;
  }

  private async openGatt(device: BluetoothDevice, config: PrinterConfig): Promise<void> {
    const gatt = device.gatt;
    if (!gatt) throw new WebSerialPrinterError('NO_BLE_SERVICE', 'No GATT server');

    try {
      await gatt.connect();
    } catch (err) {
      throw new WebSerialPrinterError('OPEN_FAILED', (err as Error)?.message || 'GATT connect failed');
    }

    // Locate a writable characteristic without hard-coding vendor UUIDs.
    const findWritable = async (): Promise<BluetoothRemoteGATTCharacteristic | null> => {
      const services = config.bleServiceUuid
        ? [await gatt.getPrimaryService(config.bleServiceUuid)]
        : await gatt.getPrimaryServices();
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
    };

    let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
    try {
      characteristic = await findWritable();
    } catch (err) {
      const code = errorCode(err);
      if (code === 'NotFoundError') {
        throw new WebSerialPrinterError('NO_BLE_SERVICE', 'No accessible BLE service');
      }
      throw new WebSerialPrinterError('OPEN_FAILED', (err as Error)?.message || 'GATT discovery failed');
    }

    if (!characteristic) {
      try { gatt.disconnect(); } catch { /* ignore */ }
      throw new WebSerialPrinterError('NO_BLE_CHARACTERISTIC', 'No writable BLE characteristic');
    }

    this.characteristic = characteristic;
  }

  async tryReconnect(config: PrinterConfig): Promise<boolean> {
    // Web Bluetooth has no silent re-grant: requestDevice() always needs a
    // user gesture, so automatic reconnect is impossible by design. We only
    // re-open GATT if the device object is still around.
    if (!this.device || !this.isSupported() || this.isConnected()) return this.isConnected();
    try {
      await this.openGatt(this.device, config);
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.device?.gatt?.disconnect();
    } catch { /* ignore */ }
    this.characteristic = null;
    this.device = null;
  }

  async write(data: Uint8Array): Promise<void> {
    const ch = this.characteristic;
    if (!this.device?.gatt?.connected || !ch) {
      throw new WebSerialPrinterError('NOT_CONNECTED', 'BLE printer not connected');
    }
    try {
      // MTU-safe chunking: 20 bytes fits every BLE peripheral when writing
      // without response; larger chunks go through writeWithResponse.
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
      if (!this.device?.gatt?.connected) {
        this.characteristic = null;
        throw new WebSerialPrinterError('DISCONNECTED', 'BLE printer dropped during write');
      }
      throw new WebSerialPrinterError('WRITE_FAILED', (err as Error)?.message || 'BLE write failed');
    }
  }

  onDisconnect?: () => void;
}

export const webBluetoothTransport = new WebBluetoothTransport();
