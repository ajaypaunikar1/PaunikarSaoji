import type { Order, Bill } from '../types/types';
import { isPlainAscii, rasterizeTextLine, PRINTER_DOTS_80 } from './rasterImage';

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
  TEXT_DOUBLE_SIZE: '\x1d\x21\x11',
  TEXT_BOLD_ON: '\x1b\x45\x01',
  TEXT_BOLD_OFF: '\x1b\x45\x00',
  FEED_AND_CUT: '\x1d\x56\x41\x03'
} as const;

export interface ReceiptSettings {
  restaurantName?: string;
  address?: string;
  phone?: string;
  gstNumber?: string;
  upiId?: string;
}

const encoder = new TextEncoder();

const nowIST = () =>
  new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

type Align = 'left' | 'center' | 'right';

type Seg =
  | { kind: 'text'; text: string; align?: Align; bold?: boolean; double?: boolean }
  | { kind: 'raw'; raw: string };

/**
 * Convert the logical receipt segments into raw ESC/POS bytes.
 *
 * Plain-ASCII lines are sent as fast native text. Any line containing
 * non-ASCII characters (Marathi / Devanagari item names, ₹, etc.) is rendered
 * to a monochrome bitmap and printed as a raster image, because the printer's
 * font tables cannot decode those Unicode codepoints.
 */
async function renderSegments(segs: Seg[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const push = (str: string) => chunks.push(encoder.encode(str));

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

    if (isPlainAscii(seg.text)) {
      let s = alignCmd;
      if (seg.bold) s += ESCPOS.TEXT_BOLD_ON;
      if (seg.double) s += ESCPOS.TEXT_DOUBLE_SIZE;
      s += seg.text + '\n';
      if (seg.double) s += ESCPOS.TEXT_NORMAL;
      if (seg.bold) s += ESCPOS.TEXT_BOLD_OFF;
      push(s);
    } else {
      // Alignment is baked into the bitmap; print the image from the left margin.
      push(ESCPOS.ALIGN_LEFT);
      chunks.push(
        await rasterizeTextLine(seg.text, {
          widthDots: PRINTER_DOTS_80,
          align,
          bold: seg.bold,
          fontSize: seg.double ? 44 : undefined
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
export async function generateKOT(order: Order, settings?: ReceiptSettings): Promise<Uint8Array> {
  const restName = settings?.restaurantName || 'Paunikar Saoji Restaurant';

  const segs: Seg[] = [
    { kind: 'raw', raw: ESCPOS.INIT },
    { kind: 'text', text: 'KOT TICKET', align: 'center', bold: true, double: true },
    { kind: 'text', text: order.isParcel ? 'Order Type: PARCEL' : `Table: T-${order.tableId}`, align: 'center' },
    { kind: 'text', text: `Order: #${order.id.substring(4, 10)}`, align: 'center' },
    { kind: 'text', text: `Time: ${nowIST()}`, align: 'center' },
    ...(order.isParcel && order.customerName
      ? [{ kind: 'text' as const, text: `Customer: ${order.customerName}`, align: 'center' as Align }]
      : []),
    { kind: 'text', text: '--------------------------------', align: 'center' },
    ...order.items.flatMap<Seg>(item => [
      { kind: 'text' as const, text: item.name },
      { kind: 'text' as const, text: `  Qty: ${item.quantity} (${item.portion})` },
      ...(item.spiceLevel && item.spiceLevel !== 'normal'
        ? [{ kind: 'text' as const, text: `  Spice: ${item.spiceLevel}` }]
        : []),
      ...(item.specialNotes
        ? [{ kind: 'text' as const, text: `  * Notes: ${item.specialNotes}` }]
        : [])
    ]),
    { kind: 'text', text: '--------------------------------' },
    { kind: 'text', text: `${restName} KITCHEN`, align: 'center' },
    { kind: 'raw', raw: '\n\n\n\n' + ESCPOS.FEED_AND_CUT }
  ];

  return renderSegments(segs);
}

/**
 * Generate a Bill Receipt / Tax Invoice as raw ESC/POS bytes.
 * Pure function - no transport side effects. Lines containing Marathi
 * (Devanagari) text are rasterized so they print correctly.
 */
export async function generateBillReceipt(
  bill: Bill,
  order: Order,
  settings?: ReceiptSettings
): Promise<Uint8Array> {
  const restName = settings?.restaurantName || 'Paunikar Saoji Restaurant';
  const address = settings?.address || '';
  const phone = settings?.phone || '';
  const gstPct = bill.gstPct || 18;
  const halfPct = gstPct / 2;
  const halfAmt = Math.round((bill.gst / 2) * 100) / 100;

  const segs: Seg[] = [
    { kind: 'raw', raw: ESCPOS.INIT },
    { kind: 'text', text: restName, align: 'center', bold: true, double: true },
    ...(address
      ? [{ kind: 'text' as const, text: address, align: 'center' as Align }]
      : []),
    ...(phone
      ? [{ kind: 'text' as const, text: `Ph: ${phone}`, align: 'center' as Align }]
      : []),
    { kind: 'text', text: 'TAX INVOICE (kar bijak)', align: 'center', bold: true },
    { kind: 'text', text: '--------------------------------', align: 'center' },
    { kind: 'text', text: `Invoice: #${bill.id ? bill.id.substring(5, 12) : 'PENDING'}` },
    { kind: 'text', text: bill.isParcel ? 'Order Type: PARCEL' : `Table: T-${bill.tableId}` },
    ...(bill.isParcel && order.customerName
      ? [{ kind: 'text' as const, text: `Customer: ${order.customerName}` }]
      : []),
    { kind: 'text', text: `Date/Time: ${nowIST()}` },
    { kind: 'text', text: `Payment: ${bill.paymentMethod || 'Cash'}` },
    { kind: 'text', text: '--------------------------------' },
    ...order.items.flatMap<Seg>(item => [
      { kind: 'text' as const, text: item.name },
      { kind: 'text' as const, text: `  ${item.quantity} x Rs.${item.price} = Rs.${item.price * item.quantity}` },
      ...(item.spiceLevel && item.spiceLevel !== 'normal'
        ? [{ kind: 'text' as const, text: `  Spice: ${item.spiceLevel}` }]
        : [])
    ]),
    { kind: 'text', text: '--------------------------------' },
    { kind: 'text', text: `Subtotal: Rs.${bill.subtotal}`, align: 'right' },
    ...(bill.gst > 0
      ? [
          { kind: 'text' as const, text: `CGST (${halfPct}%): Rs.${halfAmt}`, align: 'right' as Align },
          { kind: 'text' as const, text: `SGST (${halfPct}%): Rs.${halfAmt}`, align: 'right' as Align }
        ]
      : []),
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
    { kind: 'text', text: 'Thank you! Visit Again.', align: 'center' },
    { kind: 'text', text: restName, align: 'center' },
    { kind: 'raw', raw: '\n\n\n\n' + ESCPOS.FEED_AND_CUT }
  ];

  return renderSegments(segs);
}

/**
 * Generate a self-test receipt to verify the Web Serial thermal printer
 * connection is working end-to-end. Includes a Marathi line so the Devanagari
 * raster rendering can be verified on paper.
 */
export async function generateTestPrint(settings?: ReceiptSettings): Promise<Uint8Array> {
  const restName = settings?.restaurantName || 'Paunikar Saoji Restaurant';

  const segs: Seg[] = [
    { kind: 'raw', raw: ESCPOS.INIT },
    { kind: 'text', text: 'PRINTER TEST', align: 'center', bold: true, double: true },
    { kind: 'text', text: '================================', align: 'center' },
    { kind: 'text', text: 'Printer:' },
    { kind: 'text', text: 'KPC307-UEWB-6178' },
    { kind: 'text', text: '' },
    { kind: 'text', text: 'Connection:' },
    { kind: 'text', text: 'Web Serial' },
    { kind: 'text', text: '' },
    { kind: 'text', text: 'Protocol:' },
    { kind: 'text', text: 'ESC/POS' },
    { kind: 'text', text: '' },
    { kind: 'text', text: 'Baud Rate:' },
    { kind: 'text', text: '9600' },
    { kind: 'text', text: '--------------------------------' },
    { kind: 'text', text: 'Marathi: \u092e\u0930\u093e\u0920\u0940 \u092a\u094d\u0930\u093f\u0902\u091f \u091a\u093e\u091a\u0923\u0940', align: 'center' },
    { kind: 'text', text: 'TEST PRINT SUCCESSFUL', align: 'center', bold: true },
    { kind: 'text', text: '--------------------------------' },
    { kind: 'text', text: `${restName} RMS`, align: 'center' },
    { kind: 'text', text: '================================', align: 'center' },
    { kind: 'raw', raw: '\n\n\n\n' + ESCPOS.FEED_AND_CUT }
  ];

  return renderSegments(segs);
}