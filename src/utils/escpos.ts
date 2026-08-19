import type { Order, Bill } from '../types/types';

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

/**
 * Generate a Kitchen Order Ticket (KOT) as raw ESC/POS bytes.
 * Pure function - no transport side effects.
 */
export function generateKOT(order: Order, settings?: ReceiptSettings): Uint8Array {
  const restName = settings?.restaurantName || 'Paunikar Saoji Restaurant';

  let kot = '';
  kot += ESCPOS.INIT;
  kot += ESCPOS.ALIGN_CENTER;
  kot += ESCPOS.TEXT_DOUBLE_SIZE;
  kot += ESCPOS.TEXT_BOLD_ON;
  kot += 'KOT TICKET\n';
  kot += ESCPOS.TEXT_NORMAL;
  kot += order.isParcel ? 'Order Type: PARCEL\n' : `Table: T-${order.tableId}\n`;
  kot += `Order: #${order.id.substring(4, 10)}\n`;
  kot += `Time: ${nowIST()}\n`;
  if (order.isParcel && order.customerName) {
    kot += `Customer: ${order.customerName}\n`;
  }
  kot += ESCPOS.TEXT_BOLD_OFF;
  kot += '--------------------------------\n';
  kot += ESCPOS.ALIGN_LEFT;

  order.items.forEach(item => {
    kot += `${item.name}\n`;
    kot += `  Qty: ${item.quantity} (${item.portion})\n`;
    if (item.specialNotes) {
      kot += `  * Notes: ${item.specialNotes}\n`;
    }
  });
  kot += '--------------------------------\n';
  kot += ESCPOS.ALIGN_CENTER;
  kot += `${restName} KITCHEN\n\n\n\n`;
  kot += ESCPOS.FEED_AND_CUT;

  return encoder.encode(kot);
}

/**
 * Generate a Bill Receipt / Tax Invoice as raw ESC/POS bytes.
 * Pure function - no transport side effects.
 */
export function generateBillReceipt(
  bill: Bill,
  order: Order,
  settings?: ReceiptSettings
): Uint8Array {
  const restName = settings?.restaurantName || 'Paunikar Saoji Restaurant';
  const address = settings?.address || '';
  const phone = settings?.phone || '';
  const gstPct = bill.gstPct || 18;
  const halfPct = gstPct / 2;

  let receipt = '';
  receipt += ESCPOS.INIT;
  receipt += ESCPOS.ALIGN_CENTER;
  receipt += ESCPOS.TEXT_BOLD_ON;
  receipt += ESCPOS.TEXT_DOUBLE_SIZE;
  receipt += `${restName}\n`;
  receipt += ESCPOS.TEXT_NORMAL;
  if (address) receipt += `${address}\n`;
  if (phone) receipt += `Ph: ${phone}\n`;
  receipt += 'TAX INVOICE (kar bijak)\n';
  receipt += '--------------------------------\n';
  receipt += ESCPOS.ALIGN_LEFT;
  receipt += `Invoice: #${bill.id ? bill.id.substring(5, 12) : 'PENDING'}\n`;
  receipt += bill.isParcel ? 'Order Type: PARCEL\n' : `Table: T-${bill.tableId}\n`;
  if (bill.isParcel && order.customerName) {
    receipt += `Customer: ${order.customerName}\n`;
  }
  receipt += `Date/Time: ${nowIST()}\n`;
  receipt += `Payment: ${bill.paymentMethod || 'Cash'}\n`;
  receipt += '--------------------------------\n';

  order.items.forEach(item => {
    const lineTotal = item.price * item.quantity;
    receipt += `${item.name}\n`;
    receipt += `  ${item.quantity} x Rs.${item.price} = Rs.${lineTotal}\n`;
  });
  receipt += '--------------------------------\n';

  receipt += ESCPOS.ALIGN_RIGHT;
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
  if (bill.containerCharge && bill.containerCharge > 0) {
    receipt += `Container Charge: Rs.${bill.containerCharge}\n`;
  }
  receipt += ESCPOS.TEXT_BOLD_ON;
  receipt += `GRAND TOTAL: Rs.${bill.grandTotal}\n`;
  receipt += ESCPOS.TEXT_BOLD_OFF;
  receipt += '--------------------------------\n';

  receipt += ESCPOS.ALIGN_CENTER;
  receipt += 'Thank you! Visit Again.\n';
  receipt += `${restName}\n\n\n\n`;
  receipt += ESCPOS.FEED_AND_CUT;

  return encoder.encode(receipt);
}

/**
 * Generate a self-test receipt to verify the Web Serial thermal printer
 * connection is working end-to-end.
 */
export function generateTestPrint(settings?: ReceiptSettings): Uint8Array {
  const restName = settings?.restaurantName || 'Paunikar Saoji Restaurant';

  let test = '';
  test += ESCPOS.INIT;
  test += ESCPOS.ALIGN_CENTER;
  test += ESCPOS.TEXT_DOUBLE_SIZE;
  test += ESCPOS.TEXT_BOLD_ON;
  test += 'PRINTER TEST\n';
  test += ESCPOS.TEXT_NORMAL;
  test += '================================\n';
  test += 'Printer:\n';
  test += 'KPC307-UEWB-6178\n';
  test += '\n';
  test += 'Connection:\n';
  test += 'Web Serial\n';
  test += '\n';
  test += 'Protocol:\n';
  test += 'ESC/POS\n';
  test += '\n';
  test += 'Baud Rate:\n';
  test += '9600\n';
  test += '--------------------------------\n';
  test += 'TEST PRINT SUCCESSFUL\n';
  test += '--------------------------------\n';
  test += ESCPOS.ALIGN_CENTER;
  test += restName + ' RMS\n';
  test += '================================\n';
  test += '\n\n\n\n';
  test += ESCPOS.FEED_AND_CUT;

  return encoder.encode(test);
}