import type { PrinterConfig } from '../printerConfig';

export type TransportKind = 'web-serial' | 'web-bluetooth';

export interface TransportEvents {
  onDisconnect: () => void;
}

/**
 * A transport moves raw ESC/POS bytes to the printer. It knows nothing about
 * receipts, queues or retry policy. The PrinterManager owns those.
 */
export interface PrinterTransport {
  readonly kind: TransportKind;
  /** Human-readable label for test prints / UI ("Web Serial", "Web Bluetooth"). */
  readonly label: string;
  isConnected(): boolean;
  /**
   * Interactive connect (requires a user gesture). Implementations must throw
   * coded errors (see friendlyErrors.ts) instead of raw DOMExceptions.
   */
  connect(config: PrinterConfig): Promise<void>;
  /** Silent reconnect using previously granted permissions. Never shows a dialog. */
  tryReconnect(config: PrinterConfig): Promise<boolean>;
  disconnect(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  /** Short description of the connected port/device for diagnostics. */
  describe(): string;
}
