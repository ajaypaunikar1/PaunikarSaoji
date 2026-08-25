/**
 * Persisted printer configuration. The physical KP-307 is NEVER hard-coded:
 * these records only describe *intent* (name, role, paper width, transport
 * preference). The actual browser port/device is always chosen and authorized
 * by the user through the browser's own permission dialogs.
 */

export type PrinterRole = 'KITCHEN' | 'BILLING' | 'PARCEL' | 'BAR';
export type ConnectionType = 'BLUETOOTH' | 'BLE';
export type EncodingMode = 'auto-raster' | 'utf8-codepage' | 'ascii-fold' | 'esc-star-raster';

/**
 * GATT services commonly exposed by ESC/POS thermal printers. Web Bluetooth
 * only permits access to services listed in requestDevice()'s optionalServices;
 * an empty list makes Chrome reject every service with
 * "Origin is not allowed to access any service".
 */
export const KNOWN_BLE_PRINTER_SERVICES: string[] = [
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
];

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
  /**
   * Browser-assigned Web Bluetooth device id, persisted after the operator
   * pairs the printer once. Enables silent relaunch reconnects via
   * navigator.bluetooth.getDevices().
   */
  deviceId?: string;
  /** Paper cut behaviour at receipt end (only where hardware supports it). */
  cutMode?: 'FULL' | 'PARTIAL';
}

const STORAGE_KEY = 'rms_printer_configs_v1';
const ACTIVE_KEY = 'rms_printer_active_v1';

export const DEFAULT_KITCHEN_PRINTER: PrinterConfig = {
  id: 'printer-kitchen',
  name: 'Kitchen KP-307',
  role: 'KITCHEN',
  connectionType: 'BLUETOOTH',
  paperWidth: 80,
  enabled: true,
  baudRate: 9600,
  encodingMode: 'auto-raster',
  cutMode: 'FULL'
};

export const DEFAULT_BILLING_PRINTER: PrinterConfig = {
  id: 'printer-billing',
  name: 'Billing KP-307',
  role: 'BILLING',
  connectionType: 'BLUETOOTH',
  paperWidth: 80,
  enabled: true,
  baudRate: 9600,
  encodingMode: 'auto-raster',
  cutMode: 'FULL'
};

/** Kept for backward compatibility with older imports. */
export const DEFAULT_PRINTER: PrinterConfig = DEFAULT_KITCHEN_PRINTER;

export function defaultPrinters(): PrinterConfig[] {
  return [DEFAULT_KITCHEN_PRINTER, DEFAULT_BILLING_PRINTER];
}

export function loadPrinterConfigs(): PrinterConfig[] {
  if (typeof localStorage === 'undefined') return defaultPrinters();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrinters();
    const parsed = JSON.parse(raw) as PrinterConfig[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultPrinters();
    return parsed.map(p => ({
      ...DEFAULT_KITCHEN_PRINTER,
      ...p
    }));
  } catch {
    return defaultPrinters();
  }
}

export function savePrinterConfigs(configs: PrinterConfig[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch { /* storage full/blocked - config stays in memory */ }
}

export function loadActivePrinterId(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_BILLING_PRINTER.id;
  return localStorage.getItem(ACTIVE_KEY) || DEFAULT_BILLING_PRINTER.id;
}

export function saveActivePrinterId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch { /* ignore */ }
}
