/**
 * WebSerialPrinter - client-side thermal printer service.
 *
 * Replaces the old server-side TCP/IP (port 9100) transport with the
 * browser's native Web Serial API (navigator.serial).
 *
 * Architecture:
 *   Receipt Data -> ESC/POS Generator -> Uint8Array -> Web Serial -> Printer
 *
 * All writes are serialized through an internal print queue so that
 * simultaneous KOT / bill jobs never race against each other.
 */

const BAUD_RATE = 9600;

export interface PrinterErrorInfo {
  code: string;
  message: string;
}

export class WebSerialPrinterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'WebSerialPrinterError';
    this.code = code;
  }
}

class WebSerialPrinter {
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private connected = false;
  private printing = false;
  private queue: Promise<void> = Promise.resolve();

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isPrinting(): boolean {
    return this.printing;
  }

  async getAuthorizedPorts(): Promise<SerialPort[]> {
    if (!this.isSupported()) return [];
    return (navigator.serial as Serial).getPorts();
  }

  /** Connect to an already-authorized port (no device chooser). Used for auto-reconnect. */
  async connectToPort(port: SerialPort): Promise<SerialPort> {
    if (this.connected && this.port) {
      return this.port;
    }
    try {
      await port.open({ baudRate: BAUD_RATE });
    } catch (err) {
      const name = (err as DOMException)?.name || '';
      if (name === 'InvalidStateError') {
        throw new WebSerialPrinterError(
          'ALREADY_OPEN',
          'The printer is already open in this tab. Disconnect first, then reconnect.'
        );
      }
      throw new WebSerialPrinterError('OPEN_FAILED', (err as Error)?.message || 'Failed to open serial port.');
    }
    this.port = port;
    this.writer = port.writable ? port.writable.getWriter() : null;
    this.connected = true;
    return port;
  }

  /** Open the browser's serial device chooser and connect to the printer. */
  async connect(): Promise<SerialPort> {
    if (!this.isSupported()) {
      throw new WebSerialPrinterError(
        'NOT_SUPPORTED',
        'Web Serial is not supported. Please use a compatible Chromium-based browser (e.g. Chrome on Android).'
      );
    }
    if (this.connected && this.port) {
      return this.port;
    }

    let port: SerialPort;
    try {
      port = await (navigator.serial as Serial).requestPort();
    } catch (err) {
      const name = (err as DOMException)?.name || '';
      if (name === 'NotFoundError' || name === 'AbortError') {
        throw new WebSerialPrinterError(
          'NOT_FOUND',
          'No printer selected. Tap "Connect Printer" and select the thermal printer.'
        );
      }
      throw new WebSerialPrinterError('CONNECT_FAILED', (err as Error)?.message || 'Failed to open device chooser.');
    }

    try {
      await port.open({ baudRate: BAUD_RATE });
    } catch (err) {
      const name = (err as DOMException)?.name || '';
      if (name === 'InvalidStateError') {
        throw new WebSerialPrinterError(
          'ALREADY_OPEN',
          'The printer is already open in this tab. Disconnect first, then reconnect.'
        );
      }
      throw new WebSerialPrinterError('OPEN_FAILED', (err as Error)?.message || 'Failed to open serial port.');
    }

    this.port = port;
    this.writer = port.writable ? port.writable.getWriter() : null;
    this.connected = true;
    return port;
  }

  /** Close the serial connection. Safe to call when already disconnected. */
  async disconnect(): Promise<void> {
    try {
      if (this.writer) {
        try {
          await this.writer.releaseLock();
        } catch {
          /* ignore */
        }
        this.writer = null;
      }
      if (this.port) {
        const port = this.port;
        this.port = null;
        try {
          if (port.readable) {
            try {
              await port.readable.cancel();
            } catch {
              /* ignore */
            }
          }
          await port.close();
        } catch {
          /* ignore */
        }
      }
    } finally {
      this.connected = false;
      this.printing = false;
    }
  }

  /**
   * Serialize a print job onto the internal queue.
   * Jobs are executed strictly one at a time.
   */
  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.queue.then(job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Send raw ESC/POS bytes to the printer via Web Serial. */
  async print(data: Uint8Array): Promise<void> {
    if (!this.connected || !this.port || !this.writer) {
      throw new WebSerialPrinterError(
        'NOT_CONNECTED',
        'Printer is not connected. Tap "Connect Printer" and select the thermal printer.'
      );
    }

    return this.enqueue(async () => {
      this.printing = true;
      try {
        await this.writer!.write(data);
        await this.writer!.ready;
      } catch (err) {
        const name = (err as DOMException)?.name || '';
        if (name === 'NetworkError' || name === 'InvalidStateError') {
          this.connected = false;
          throw new WebSerialPrinterError(
            'DISCONNECTED',
            'Printer disconnected. Reconnect the printer and try again.'
          );
        }
        throw new WebSerialPrinterError('WRITE_FAILED', (err as Error)?.message || 'Failed to write to printer.');
      } finally {
        this.printing = false;
      }
    });
  }
}

/** Application-wide singleton so every screen shares one serial connection. */
export const webSerialPrinter = new WebSerialPrinter();