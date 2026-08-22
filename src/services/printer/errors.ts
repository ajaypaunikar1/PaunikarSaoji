/**
 * Shared coded-error class for the printer stack. `code` is one of the keys
 * handled by services/printer/friendlyErrors.ts, so UI layers never render
 * raw DOMException text to restaurant staff.
 */
export class WebSerialPrinterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'WebSerialPrinterError';
    this.code = code;
  }
}

export function errorCode(err: any): string | undefined {
  if (err && typeof err === 'object') return err.code || err.name;
  return undefined;
}
