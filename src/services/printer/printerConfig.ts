/**
 * Persisted printer configuration. The physical KP-307 is NEVER hard-coded:
 * these records only describe *intent* (name, role, paper width, transport
 * preference). The actual browser port/device is always chosen and authorized
 * by the user through the browser's own permission dialogs.
 */

export type PrinterRole = 'KITCHEN' | 'BILLING' | 'PARCEL' | 'BAR';
export type ConnectionType = 'BLUETOOTH' | 'BLE';
export type EncodingMode = 'auto-raster' | 'utf8-codepage' | 'ascii-fold';

export interface PrinterConfig {
  id: string;
  name: string;
  role: PrinterRole;
  connectionType: ConnectionType;
  paperWidth: 58 | 80;
  enabled: boolean;
  /** Serial baud rate (KP-307 default 9600). */
  baudRate?: number;
  /** How non-ASCII text (Marathi) is encoded - see escpos.ts. */
  encodingMode?: EncodingMode;
  /** ESC/POS code page number for utf8-codepage mode (ESC t n). */
  codePage?: number;
  /** Optional buzzer support (vendor-specific; off by default). */
  beepEnabled?: boolean;
  /** Advanced BLE: operator-entered service UUID for genuine BLE units. */
  bleServiceUuid?: string;
}

const STORAGE_KEY = 'rms_printer_configs_v1';
const ACTIVE_KEY = 'rms_printer_active_v1';

export const DEFAULT_PRINTER: PrinterConfig = {
  id: 'printer-kitchen',
  name: 'Kitchen KP-307',
  role: 'KITCHEN',
  connectionType: 'BLUETOOTH',
  paperWidth: 80,
  enabled: true,
  baudRate: 9600,
  encodingMode: 'auto-raster'
};

export function loadPrinterConfigs(): PrinterConfig[] {
  if (typeof localStorage === 'undefined') return [DEFAULT_PRINTER];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [DEFAULT_PRINTER];
    const parsed = JSON.parse(raw) as PrinterConfig[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [DEFAULT_PRINTER];
    return parsed.map(p => ({ ...DEFAULT_PRINTER, ...p }));
  } catch {
    return [DEFAULT_PRINTER];
  }
}

export function savePrinterConfigs(configs: PrinterConfig[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch { /* storage full/blocked - config stays in memory */ }
}

export function loadActivePrinterId(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_PRINTER.id;
  return localStorage.getItem(ACTIVE_KEY) || DEFAULT_PRINTER.id;
}

export function saveActivePrinterId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch { /* ignore */ }
}
