import type { PrinterConfig } from '../printerConfig';
import type { PrinterTransport } from './types';
import { WebSerialPrinterError } from '../errors';

/**
 * Web Serial transport - the primary path for a KP-307 that exposes itself as
 * a Bluetooth Classic SPP device (Android/Chrome surfaces those as serial
 * ports with a bluetoothServiceClassId).
 *
 * Guarantees:
 *  - requestPort() is only ever called from an explicit user gesture.
 *  - Previously granted ports (navigator.serial.getPorts()) are reused so the
 *    chooser does not appear on every connect / page load.
 *  - Writer locks are always released and the readable stream cancelled on
 *    close, so the port never stays locked after an error.
 *  - All failures surface as coded WebSerialPrinterError values.
 */
class WebSerialTransport implements PrinterTransport {
  readonly kind = 'web-serial' as const;
  readonly label = 'Web Serial';

  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private lastPort: SerialPort | null = null;

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  isConnected(): boolean {
    return !!(this.port && this.writer);
  }

  async getGrantedPorts(): Promise<SerialPort[]> {
    if (!this.isSupported()) return [];
    try {
      return await (navigator.serial as Serial).getPorts();
    } catch {
      return [];
    }
  }

  describe(): string {
    if (!this.port) return 'Not connected';
    const info = this.port.getInfo?.();
    if (info?.bluetoothServiceClassId) return `Bluetooth SPP (${info.bluetoothServiceClassId})`;
    if (info?.usbVendorId != null) {
      const vid = info.usbVendorId.toString(16).padStart(4, '0');
      const pid = (info.usbProductId ?? 0).toString(16).padStart(4, '0');
      return `USB ${vid}:${pid}`;
    }
    return 'Serial port';
  }

  /** Pick the most likely KP-307 port: last used > Bluetooth SPP > any. */
  private async pickGrantedPort(): Promise<SerialPort | null> {
    const ports = await this.getGrantedPorts();
    if (ports.length === 0) return null;
    if (this.lastPort && ports.includes(this.lastPort)) return this.lastPort;
    const btPort = ports.find(p => p.getInfo?.().bluetoothServiceClassId);
    return btPort || ports[0];
  }

  private async openPort(port: SerialPort, config: PrinterConfig): Promise<void> {
    try {
      await port.open({
        baudRate: config.baudRate || 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 4096,
        flowControl: 'none'
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'InvalidStateError') throw new WebSerialPrinterError('ALREADY_OPEN', 'Port already open');
      if (name === 'SecurityError') throw new WebSerialPrinterError('SECURITY_ERROR', 'Insecure context');
      if (name === 'NotAllowedError') throw new WebSerialPrinterError('PERMISSION_REQUIRED', 'Permission denied');
      throw new WebSerialPrinterError('OPEN_FAILED', (err as Error)?.message || 'Failed to open serial port');
    }
    this.port = port;
    this.lastPort = port;
    this.writer = port.writable ? port.writable.getWriter() : null;
    if (!this.writer) {
      await this.cleanup();
      throw new WebSerialPrinterError('OPEN_FAILED', 'Serial port has no writable stream');
    }
  }

  /** Release stream locks and close the port without throwing. */
  private async cleanup(): Promise<void> {
    const port = this.port;
    this.port = null;
    if (this.writer) {
      try { this.writer.releaseLock(); } catch { /* already released */ }
      this.writer = null;
    }
    if (port) {
      try {
        if (port.readable) await port.readable.cancel();
      } catch { /* ignore */ }
      try { await port.close(); } catch { /* ignore */ }
    }
  }

  /** Interactive connect: reuse a granted port when possible, else show chooser once. */
  async connect(config: PrinterConfig): Promise<void> {
    if (!this.isSupported()) {
      throw new WebSerialPrinterError('NOT_SUPPORTED', 'Web Serial unavailable');
    }
    if (this.isConnected()) return;

    // Prefer an already-authorized port so requestPort() is not called needlessly.
    const granted = await this.pickGrantedPort();
    if (granted) {
      await this.openPort(granted, config);
      return;
    }

    let port: SerialPort;
    try {
      port = await (navigator.serial as Serial).requestPort();
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotFoundError' || name === 'AbortError') {
        throw new WebSerialPrinterError('USER_CANCELLED', 'No printer selected');
      }
      if (name === 'SecurityError') throw new WebSerialPrinterError('SECURITY_ERROR', 'Insecure context');
      if (name === 'TypeError') throw new WebSerialPrinterError('SECURITY_ERROR', 'Requires secure context');
      throw new WebSerialPrinterError('OPEN_FAILED', (err as Error)?.message || 'Device chooser failed');
    }
    await this.openPort(port, config);
  }

  /** Silent reconnect via previously granted ports. Never opens the chooser. */
  async tryReconnect(config: PrinterConfig): Promise<boolean> {
    if (!this.isSupported() || this.isConnected()) return this.isConnected();
    try {
      const port = await this.pickGrantedPort();
      if (!port) return false;
      await this.openPort(port, config);
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.cleanup();
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.port || !this.writer) {
      throw new WebSerialPrinterError('NOT_CONNECTED', 'Serial printer not connected');
    }
    try {
      await this.writer.write(data);
      await this.writer.ready;
    } catch (err) {
      const name = (err as DOMException)?.name;
      // Force state reset; manager will mark disconnected + schedule reconnect.
      await this.cleanup();
      if (name === 'NetworkError' || name === 'InvalidStateError') {
        throw new WebSerialPrinterError('DISCONNECTED', 'Printer dropped during write');
      }
      throw new WebSerialPrinterError('WRITE_FAILED', (err as Error)?.message || 'Write failed');
    }
  }
}

export const webSerialTransport = new WebSerialTransport();
