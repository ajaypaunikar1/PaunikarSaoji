import type { Order, Bill } from '../types/types';
import { isPlainAscii, rasterizeTextLine, PRINTER_DOTS_80, PRINTER_DOTS_58 } from './rasterImage';

/**
 * ESC/POS command constants for thermal receipt printers (KPC307-UEWB-6178).
 * These mirror the commands previously used in server/utils/printer.js.
 */
export const ESCPOS = {
  INIT: '\x1b\x40',
  ALIGN_LEFT: '\x1b\x61\x00',
  ALIGN_CENTER: '\x1b\x61\x01',
  ALIGN_RIGHT: '\x1b\x61\x02',
  TEXT_NORMAL: '\x1d\x21\x00',
  /** Double height only (GS ! 0x01) - keeps item lines readable without wasting width. */
  TEXT_TALL: '\x1d\x21\x01',
  TEXT_DOUBLE_SIZE: '\x1d\x21\x11',
  TEXT_BOLD_ON: '\x1b\x45\x01',
  TEXT_BOLD_OFF: '\x1b\x45\x00'
} as const;

/**
 * Paper cut commands (GS V). FULL = GS V A n, PARTIAL = GS V B n.
 * NOTE: these are printer PAPER cuts - completely unrelated to food
 * Half/Full portion variants.
 */
export function cutCommand(mode: 'FULL' | 'PARTIAL'): string {
  return mode === 'PARTIAL' ? '\x1d\x56\x42\x03' : '\x1d\x56\x41\x03';
}

/** Per-receipt print options supplied from the target printer's config. */
export interface ReceiptOptions {
  /** Paper cut behaviour at receipt end. Default FULL. */
  cutMode?: 'FULL' | 'PARTIAL';
  /** Paper width - selects printable width AND raster glyph calibration. */
  paperWidth?: 58 | 80;
  /** Waiter name for the bill receipt. */
  waiterName?: string;
  /** How non-ASCII text (Marathi) is encoded. */
  encodingMode?: 'auto-raster' | 'utf8-codepage' | 'ascii-fold' | 'esc-star-raster';
  /** ESC/POS code page number for utf8-codepage mode. */
  codePage?: number;
}

/**
 * Raster glyph calibration (canvas px ~= printer dots @ 203 dpi).
 *
 * Native ESC/POS Font A glyphs are 24 dots tall ("normal"), 48 dots when
 * doubled ("tall"/"double"). These values were chosen so rasterized
 * Devanagari ink height approximately matches the neighbouring native text
 * instead of printing noticeably larger. They may need on-site fine-tuning
 * against a physical KP-307.
 */
const RASTER_PX: Record<'normal' | 'tall' | 'double', Record<58 | 80, number>> = {
  normal: { 80: 26, 58: 21 },
  tall: { 80: 40, 58: 34 },
  double: { 80: 52, 58: 44 }
};

export interface ReceiptSettings {
  restaurantName?: string;
  address?: string;
  phone?: string;
  upiId?: string;
}

const encoder = new TextEncoder();

const nowIST = () =>
  new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

const dateIST = () =>
  new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });

const timeIST = () =>
  new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

type Align = 'left' | 'center' | 'right';

/** Text magnification: normal, double-height (tall) or double width+height. */
type TextSize = 'normal' | 'tall' | 'double';

type Seg =
  | { kind: 'text'; text: string; align?: Align; bold?: boolean; size?: TextSize }
  | { kind: 'raw'; raw: string };

/**
 * Convert the logical receipt segments into raw ESC/POS bytes.
 *
 * Plain-ASCII lines are sent as fast native text. Any line containing
 * non-ASCII characters (Marathi / Devanagari item names, ₹, etc.) is rendered
 * to a monochrome bitmap and printed as a raster image, because the printer's
 * font tables cannot decode those Unicode codepoints.
 */
async function renderSegments(segs: Seg[], opts: ReceiptOptions = {}): Promise<Uint8Array> {
  const widthDots = opts.paperWidth === 58 ? PRINTER_DOTS_58 : PRINTER_DOTS_80;
  const encodingMode = opts.encodingMode ?? 'auto-raster';
  const chunks: Uint8Array[] = [];
  const push = (str: string) => chunks.push(encoder.encode(str));

  if (encodingMode === 'utf8-codepage' && opts.codePage !== undefined) {
    chunks.push(new Uint8Array([0x1b, 0x74, opts.codePage]));
  }

  for (const seg of segs) {
    if (seg.kind === 'raw') {
      push(seg.raw);
      continue;
    }

    const align: Align = seg.align ?? 'left';
    const alignCmd =
      align === 'center'
        ? ESCPOS.ALIGN_CENTER
        : align === 'right'
          ? ESCPOS.ALIGN_RIGHT
          : ESCPOS.ALIGN_LEFT;

    if (isPlainAscii(seg.text) || (encodingMode !== 'auto-raster' && encodingMode !== 'esc-star-raster')) {
      let textToPrint = seg.text;
      if (encodingMode === 'ascii-fold') {
        textToPrint = textToPrint.replace(/[^\x20-\x7E]+/g, ' ').replace(/\s+/g, ' ').trim();
      }
      const size: TextSize = seg.size ?? 'normal';
      let s = alignCmd;
      if (seg.bold) s += ESCPOS.TEXT_BOLD_ON;
      if (size === 'tall') s += ESCPOS.TEXT_TALL;
      if (size === 'double') s += ESCPOS.TEXT_DOUBLE_SIZE;
      s += textToPrint + '\n';
      if (size !== 'normal') s += ESCPOS.TEXT_NORMAL;
      if (seg.bold) s += ESCPOS.TEXT_BOLD_OFF;
      push(s);
    } else {
      // Alignment is baked into the bitmap; print the image from the left margin.
      push(ESCPOS.ALIGN_LEFT);
      chunks.push(
        await rasterizeTextLine(seg.text, {
          widthDots,
          align,
          bold: seg.bold,
          fontSize: RASTER_PX[seg.size ?? 'normal'][widthDots === PRINTER_DOTS_58 ? 58 : 80],
          rasterMode: encodingMode === 'esc-star-raster' ? 'esc-star' : 'gs-v-0'
        })
      );
    }
  }

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Generate a Kitchen Order Ticket (KOT) as raw ESC/POS bytes.
 * Pure function - no transport side effects. Lines containing Marathi
 * (Devanagari) text are rasterized so they print correctly.
 */
export async function generateKOT(
  order: Order,
  settings?: ReceiptSettings,
  opts?: ReceiptOptions
): Promise<Uint8Array> {
  const restName = settings?.restaurantName || 'Paunikar Saoji Restaurant';
  const cut = cutCommand(opts?.cutMode ?? 'FULL');

  const segs: Seg[] = [
    { kind: 'raw', raw: ESCPOS.INIT },
    { kind: 'text', text: 'KOT TICKET', align: 'center', bold: true, size: 'double' },
    { kind: 'text', text: order.isParcel ? 'Order Type: PARCEL' : `Table: T-${order.tableId}`, align: 'center' },
    { kind: 'text', text: `Order: #${order.id.substring(4, 10)}`, align: 'center' },
    { kind: 'text', text: `Time: ${nowIST()}`, align: 'center' },
    ...(order.isParcel && order.customerName
      ? [{ kind: 'text' as const, text: `Customer: ${order.customerName}`, align: 'center' as Align }]
      : []),
    { kind: 'text', text: '--------------------------------', align: 'center' },
    ...order.items.flatMap<Seg>(item => [
      { kind: 'text' as const, text: `${item.quantity} x ${item.name}`, bold: true as const, size: 'tall' as const },
      ...(item.portion && item.portion !== 'Single'
        ? [{ kind: 'text' as const, text: `  Portion: ${item.portion.toUpperCase()}`, bold: true as const, size: 'tall' as const }]
        : []),
      ...(item.spiceLevel && item.spiceLevel !== 'normal'
        ? [{ kind: 'text' as const, text: `  Spice: ${item.spiceLevel}`, size: 'tall' as const }]
        : []),
      ...(item.specialNotes
        ? [{ kind: 'text' as const, text: `  * Notes: ${item.specialNotes}`, size: 'tall' as const }]
        : [])
    ]),
    { kind: 'text', text: '--------------------------------' },
    { kind: 'text', text: `${restName} KITCHEN`, align: 'center' },
    { kind: 'raw', raw: '\n\n\n\n' + cut }
  ];

  return renderSegments(segs, opts);
}

/**
 * Generate a Bill Receipt / Tax Invoice as raw ESC/POS bytes.
 * Pure function - no transport side effects. Lines containing Marathi
 * (Devanagari) text are rasterized so they print correctly.
 */
export async function generateBillReceipt(
  bill: Bill,
  order: Order,
  settings?: ReceiptSettings,
  opts?: ReceiptOptions
): Promise<Uint8Array> {
  const restName = settings?.restaurantName || 'Paunikar Saoji Restaurant';
  const address = settings?.address || '';
  const phone = settings?.phone || '';
  const cut = cutCommand(opts?.cutMode ?? 'FULL');

  const segs: Seg[] = [
    { kind: 'raw', raw: ESCPOS.INIT },
    { kind: 'text', text: restName, align: 'center', bold: true, size: 'double' },
    ...(address
      ? [{ kind: 'text' as const, text: address, align: 'center' as Align }]
      : []),
    ...(phone
      ? [{ kind: 'text' as const, text: `Ph: ${phone}`, align: 'center' as Align }]
      : []),
    { kind: 'text', text: 'BILL / INVOICE', align: 'center', bold: true },
    { kind: 'text', text: '--------------------------------', align: 'center' },
    { kind: 'text', text: `Bill No: ${bill.id ? bill.id.substring(5, 12) : 'PENDING'}` },
    { kind: 'text', text: bill.isParcel ? 'Order Type: PARCEL' : `Table: Table ${bill.tableId}` },
    ...(bill.isParcel && order.customerName
      ? [{ kind: 'text' as const, text: `Customer: ${order.customerName}` }]
      : []),
    ...(opts?.waiterName
      ? [{ kind: 'text' as const, text: `Waiter: ${opts.waiterName}` }]
      : []),
    { kind: 'text', text: `Invoice Date: ${dateIST()}` },
    { kind: 'text', text: `Invoice Time: ${timeIST()}` },
    { kind: 'text', text: `Payment: ${bill.paymentMethod || 'Cash'}` },
    { kind: 'text', text: '--------------------------------' },
    ...order.items.flatMap<Seg>(item => [
      {
        kind: 'text' as const,
        text:
          item.name +
          (item.portion && item.portion !== 'Single' ? ` (${item.portion})` : ''),
        bold: true as const
      },
      { kind: 'text' as const, text: `  ${item.quantity} x Rs.${item.price} = Rs.${item.price * item.quantity}` },
      ...(item.spiceLevel && item.spiceLevel !== 'normal'
        ? [{ kind: 'text' as const, text: `  Spice: ${item.spiceLevel}` }]
        : [])
    ]),
    { kind: 'text', text: '--------------------------------' },
    { kind: 'text', text: `Subtotal: Rs.${bill.subtotal}`, align: 'right' },
    ...(bill.discount > 0
      ? [{
          kind: 'text' as const,
          text: `${bill.discountPct ? `Discount (${bill.discountPct}%)` : 'Discount'}: -Rs.${bill.discount}`,
          align: 'right' as Align
        }]
      : []),
    ...(bill.containerCharge && bill.containerCharge > 0
      ? [{ kind: 'text' as const, text: `Container Charge: Rs.${bill.containerCharge}`, align: 'right' as Align }]
      : []),
    { kind: 'text', text: `GRAND TOTAL: Rs.${bill.grandTotal}`, align: 'right', bold: true },
    { kind: 'text', text: '--------------------------------', align: 'right' },
    { kind: 'text', text: `Payment: ${bill.paymentMethod === 'UPI' ? 'Paid via UPI' : bill.paymentMethod === 'Card' ? 'Paid via Card' : 'Paid in Cash'}`, align: 'center', bold: true },
    { kind: 'text', text: 'Thank you! Visit Again.', align: 'center' },
    ...(phone
      ? [{ kind: 'text' as const, text: `${restName} • ${phone}`, align: 'center' as Align }]
      : [{ kind: 'text' as const, text: restName, align: 'center' as Align }]),
    { kind: 'raw', raw: '\n\n\n\n' + cut }
  ];

  return renderSegments(segs, opts);
}

/**
 * Generate a self-test receipt to verify a Bluetooth thermal printer
 * connection is working end-to-end. Includes a Marathi line so the Devanagari
 * raster rendering can be verified on paper.
 */
export async function generateTestPrint(
  settings?: ReceiptSettings,
  opts?: ReceiptOptions,
  identity?: { name: string; role: string }
): Promise<Uint8Array> {
  const restName = settings?.restaurantName || 'Paunikar Saoji Restaurant';
  const cut = cutCommand(opts?.cutMode ?? 'FULL');

  const segs: Seg[] = [
    { kind: 'raw', raw: ESCPOS.INIT },
    { kind: 'text', text: 'PRINTER TEST', align: 'center', bold: true, size: 'double' },
    ...(identity
      ? [
          { kind: 'text', text: '================================', align: 'center' },
          { kind: 'text', text: identity.name.toUpperCase(), align: 'center', bold: true },
          { kind: 'text', text: `ROLE: ${identity.role}`, align: 'center', bold: true }
        ]
      : []),
    { kind: 'text', text: '================================', align: 'center' },
    { kind: 'text', text: 'Connection:' },
    { kind: 'text', text: 'Bluetooth LE (Web Bluetooth)' },
    { kind: 'text', text: '' },
    { kind: 'text', text: 'Protocol:' },
    { kind: 'text', text: 'ESC/POS' },
    { kind: 'text', text: '' },
    { kind: 'text', text: `Paper: ${opts?.paperWidth === 58 ? '58 mm' : '80 mm'}` },
    { kind: 'text', text: '--------------------------------' },
    { kind: 'text', text: 'English: Test Print 123' },
    { kind: 'text', text: '\u0930\u0902\u0915: \u0967\u0968\u0969 \u0964 \u092e\u093e\u0925\u093e \u0938\u0924' },
    { kind: 'text', text: 'Marathi: \u091d\u093f\u0902\u0917\u093e \u0915\u0930\u0940 - \u20b9520', align: 'center' },
    { kind: 'text', text: '\u0916\u093f\u092e\u093e \u092e\u091f\u0923 \u0915\u0930\u0940 (\u0905\u0930\u094d\u0927\u0940)', align: 'center' },
    { kind: 'text', text: 'TEST PRINT SUCCESSFUL', align: 'center', bold: true },
    { kind: 'text', text: '--------------------------------' },
    { kind: 'text', text: `${restName} RMS`, align: 'center' },
    { kind: 'text', text: '================================', align: 'center' },
    { kind: 'raw', raw: '\n\n\n\n' + cut }
  ];

  return renderSegments(segs, opts);
}