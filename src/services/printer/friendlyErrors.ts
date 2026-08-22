/**
 * Maps low-level browser errors (DOMException names, transport codes) into
 * short, staff-friendly messages. Restaurant staff should never see
 * "DOMException: Failed to execute 'open' on 'SerialPort'".
 */

export interface StaffError {
  title: string;
  detail?: string;
  steps?: string[];
}

const CONNECT_HELP: string[] = [
  'Make sure Bluetooth is ON.',
  'Make sure the KP-307 is powered ON.',
  'Pair the KP-307 with this device in Android Bluetooth settings.',
  'Allow Chrome to access the printer when asked.'
];

type Handler = (err: any) => StaffError;

const HANDLERS: Record<string, Handler> = {
  USER_CANCELLED: () => ({
    title: 'No printer selected.',
    detail: 'The printer was not chosen, so nothing was connected.'
  }),
  NOT_SUPPORTED: () => ({
    title: 'This browser cannot reach the printer.',
    detail: 'This browser does not provide access to Bluetooth serial printers.',
    steps: [
      'Open the POS in Chrome on this device.',
      'If Chrome still cannot see the KP-307, this Android/browser combination does not expose Bluetooth serial printers to web apps.'
    ]
  }),
  ALREADY_OPEN: () => ({
    title: 'Printer is already in use.',
    detail: 'The printer port is already open in this tab.',
    steps: ['Tap Disconnect first, then Connect again.', 'If it stays busy, close other POS tabs and reopen.']
  }),
  PERMISSION_REQUIRED: () => ({
    title: 'Permission required.',
    detail: 'The browser blocked access to the printer.',
    steps: [
      'Tap Connect again while touching the screen (the browser requires a direct tap).',
      'Check site permissions: tap the lock icon next to the address bar.',
      ...CONNECT_HELP
    ]
  }),
  SECURITY_ERROR: () => ({
    title: 'Connection blocked by the browser.',
    detail: 'Web Serial / Web Bluetooth only work on secure (HTTPS) pages.',
    steps: ['Open the POS using the https:// address or localhost.']
  }),
  OPEN_FAILED: () => ({
    title: 'Could not connect to the KP-307.',
    detail: 'The printer was found but the connection could not be opened.',
    steps: CONNECT_HELP
  }),
  NOT_CONNECTED: () => ({
    title: 'Printer is not connected.',
    detail: 'Connect the printer first, then try printing again.',
    steps: ['Open Printer Settings and tap Connect.']
  }),
  DISCONNECTED: () => ({
    title: 'Printer disconnected.',
    detail: 'The connection to the KP-307 was lost during printing.',
    steps: [...CONNECT_HELP, 'Then reprint from the printer queue.']
  }),
  WRITE_FAILED: () => ({
    title: 'Printing failed.',
    detail: 'Data could not be sent to the printer.',
    steps: [...CONNECT_HELP, 'Check the printer for a paper jam or error light.']
  }),
  NO_BLE_SERVICE: () => ({
    title: 'This KP-307 is not a BLE printer.',
    detail: 'The printer does not expose a printable Bluetooth LE service to the browser.',
    steps: [
      'Use the Web Serial connection instead - most KP-307 units are Bluetooth Classic (SPP).',
      'If your unit is genuinely BLE, enter its Service UUID under Advanced in Printer Settings.'
    ]
  }),
  NO_BLE_CHARACTERISTIC: () => ({
    title: 'This KP-307 is not a BLE printer.',
    detail: 'No writable Bluetooth LE characteristic was found on the printer.',
    steps: [
      'Use the Web Serial connection instead - most KP-307 units are Bluetooth Classic (SPP).',
      'If your unit is genuinely BLE, enter its Service UUID under Advanced in Printer Settings.'
    ]
  })
};

/** Convert any thrown value into a staff-friendly error object. */
export function toStaffError(err: any): StaffError {
  const code = typeof err === 'object' && err !== null ? err.code || err.name : undefined;

  if (code && HANDLERS[code]) return HANDLERS[code](err);

  // DOMException names from requestPort()/requestDevice()
  if (code === 'NotFoundError' || code === 'AbortError') {
    return HANDLERS.USER_CANCELLED(err);
  }
  if (code === 'InvalidStateError') {
    return HANDLERS.ALREADY_OPEN(err);
  }
  if (code === 'NotAllowedError') {
    return HANDLERS.PERMISSION_REQUIRED(err);
  }
  if (code === 'SecurityError' || code === 'TypeError') {
    return HANDLERS.SECURITY_ERROR(err);
  }
  if (code === 'NetworkError') {
    return HANDLERS.DISCONNECTED(err);
  }

  return {
    title: 'Printer problem.',
    detail: 'Something went wrong while talking to the printer.',
    steps: CONNECT_HELP
  };
}

export function staffErrorMessage(err: any): string {
  const e = toStaffError(err);
  return e.steps ? `${e.title} ${e.steps[0]}` : e.title;
}
