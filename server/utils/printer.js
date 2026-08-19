import prisma from '../config/db.js';

/**
 * DEPRECATED TCP/IP thermal printing module.
 *
 * Thermal printing has migrated to the browser's Web Serial API
 * (src/services/webSerialPrinter.ts + src/utils/escpos.ts on the client).
 * The Express server can no longer physically reach the printer.
 *
 * This module now only exposes pure ESC/POS byte generation (for any server
 * side reuse / testing) plus deprecated no-op stubs kept so legacy callers
 * do not crash. No TCP sockets (port 9100) are created here anymore.
 */

// ESC/POS Command Constants
const CHARS = {
  INIT: '\x1b\x40',
  ALIGN_LEFT: '\x1b\x61\x00',
  ALIGN_CENTER: '\x1b\x61\x01',
  ALIGN_RIGHT: '\x1b\x61\x02',
  TEXT_NORMAL: '\x1d\x21\x00',
  TEXT_DOUBLE_SIZE: '\x1d\x21\x11',
  TEXT_BOLD_ON: '\x1b\x45\x01',
  TEXT_BOLD_OFF: '\x1b\x45\x00',
  FEED_AND_CUT: '\x1d\x56\x41\x03'
};

/**
 * Generate a Kitchen Order Ticket (KOT) as an ESC/POS Buffer.
 * Pure generation - no transport side effects.
 */
export async function buildKOT(order) {
  const settings = await prisma.settings.findFirst({});
  const restName = settings?.restaurantName || 'Paunikar Saoji Restaurant';
  const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

  let kot = '';
  kot += CHARS.INIT;
  kot += CHARS.ALIGN_CENTER;
  kot += CHARS.TEXT_DOUBLE_SIZE;
  kot += CHARS.TEXT_BOLD_ON;
  kot += 'KOT TICKET\n';
  kot += CHARS.TEXT_NORMAL;
  kot += order.isParcel ? `Order Type: PARCEL\n` : `Table: T-${order.tableId}\n`;
  kot += `Order: #${order.id.substring(4, 10)}\n`;
  kot += `Time: ${nowIST}\n`;
  if (order.isParcel && order.customerName) {
    kot += `Customer: ${order.customerName}\n`;
  }
  kot += CHARS.TEXT_BOLD_OFF;
  kot += '--------------------------------\n';
  kot += CHARS.ALIGN_LEFT;

  order.items.forEach(item => {
    kot += `${item.name}\n`;
    kot += `  Qty: ${item.quantity} (${item.portion})\n`;
    if (item.spiceLevel && item.spiceLevel !== 'normal') {
      kot += `  Spice: ${item.spiceLevel}\n`;
    }
    if (item.specialNotes) {
      kot += `  * Notes: ${item.specialNotes}\n`;
    }
  });
  kot += '--------------------------------\n';
  kot += CHARS.ALIGN_CENTER;
  kot += `${restName} KITCHEN\n\n\n\n`;
  kot += CHARS.FEED_AND_CUT;

  return Buffer.from(kot, 'utf-8');
}

/**
 * Generate a Bill Receipt / Tax Invoice as an ESC/POS Buffer.
 * Pure generation - no transport side effects.
 */
export async function buildBillReceipt(bill, order) {
  const settings = await prisma.settings.findFirst({});
  const restName = settings?.restaurantName || 'Paunikar Saoji Restaurant';
  const address = settings?.address || '';
  const phone = settings?.phone || '';
  const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  const gstPct = bill.gstPct || 18;
  const halfPct = gstPct / 2;

  let receipt = '';
  receipt += CHARS.INIT;
  receipt += CHARS.ALIGN_CENTER;
  receipt += CHARS.TEXT_BOLD_ON;
  receipt += CHARS.TEXT_DOUBLE_SIZE;
  receipt += `${restName}\n`;
  receipt += CHARS.TEXT_NORMAL;
  if (address) receipt += `${address}\n`;
  if (phone) receipt += `Ph: ${phone}\n`;
  receipt += 'TAX INVOICE (kar bijak)\n';
  receipt += '--------------------------------\n';
  receipt += CHARS.ALIGN_LEFT;
  receipt += `Invoice: #${bill.id ? bill.id.substring(5, 12) : 'PENDING'}\n`;
  receipt += bill.isParcel ? `Order Type: PARCEL\n` : `Table: T-${bill.tableId}\n`;
  if (bill.isParcel && order.customerName) {
    receipt += `Customer: ${order.customerName}\n`;
  }
  receipt += `Date/Time: ${nowIST}\n`;
  receipt += `Payment: ${bill.paymentMethod || 'Cash'}\n`;
  receipt += '--------------------------------\n';

  order.items.forEach(item => {
    const lineTotal = item.price * item.quantity;
    receipt += `${item.name}\n`;
    receipt += `  ${item.quantity} x Rs.${item.price} = Rs.${lineTotal}\n`;
    if (item.spiceLevel && item.spiceLevel !== 'normal') {
      receipt += `  Spice: ${item.spiceLevel}\n`;
    }
  });
  receipt += '--------------------------------\n';

  receipt += CHARS.ALIGN_RIGHT;
  receipt += `Subtotal: Rs.${bill.subtotal}\n`;
  if (bill.gst > 0) {
    const halfAmt = Math.round((bill.gst / 2) * 100) / 100;
    receipt += `CGST (${halfPct}%): Rs.${halfAmt}\n`;
    receipt += `SGST (${halfPct}%): Rs.${halfAmt}\n`;
  }
  if (bill.discount > 0) {
    const discLabel = bill.discountPct ? `Discount (${bill.discountPct}%)` : 'Discount';
    receipt += `${discLabel}: -Rs.${bill.discount}\n`;
  }
  if (bill.containerCharge > 0) {
    receipt += `Container Charge: Rs.${bill.containerCharge}\n`;
  }
  receipt += CHARS.TEXT_BOLD_ON;
  receipt += `GRAND TOTAL: Rs.${bill.grandTotal}\n`;
  receipt += CHARS.TEXT_BOLD_OFF;
  receipt += '--------------------------------\n';

  receipt += CHARS.ALIGN_CENTER;
  receipt += 'Thank you! Visit Again.\n';
  receipt += `${restName}\n\n\n\n`;
  receipt += CHARS.FEED_AND_CUT;

  return Buffer.from(receipt, 'utf-8');
}

/**
 * @deprecated TCP/IP thermal printing has been replaced by the browser
 * Web Serial API. Kept as a no-op so legacy callers do not crash.
 */
export async function printKOT() {
  console.warn('[Printer] printKOT is deprecated. Thermal printing now uses Web Serial in the browser.');
}

/**
 * @deprecated TCP/IP thermal printing has been replaced by the browser
 * Web Serial API. Kept as a no-op so legacy callers do not crash.
 */
export async function printBillReceipt() {
  console.warn('[Printer] printBillReceipt is deprecated. Thermal printing now uses Web Serial in the browser.');
}