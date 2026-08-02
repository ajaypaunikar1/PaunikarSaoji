import net from 'net';
import prisma from '../config/db.js';

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

async function sendToPrinter(ip, dataBuffer) {
  if (!ip || ip === '127.0.0.1' || ip === 'localhost') {
    console.log(`[Printer Debug] Skipping physical TCP write for localhost/loopback printer IP: ${ip}`);
    return;
  }
  
  return new Promise((resolve) => {
    const client = new net.Socket();
    client.setTimeout(2500); // 2.5 seconds timeout
    
    client.connect(9100, ip, () => {
      client.write(dataBuffer);
      client.end();
      resolve(true);
    });

    client.on('error', (err) => {
      console.warn(`[Printer Warning] Failed to connect to printer at ${ip}:9100:`, err.message);
      client.destroy();
      resolve(false);
    });

    client.on('timeout', () => {
      console.warn(`[Printer Warning] Timeout connecting to printer at ${ip}:9100`);
      client.destroy();
      resolve(false);
    });
  });
}

export async function printKOT(order) {
  try {
    const settings = await prisma.settings.findFirst({});
    const ip = settings ? settings.kitchenPrinterIp : '127.0.0.1';
    const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

    let kot = '';
    kot += CHARS.INIT;
    kot += CHARS.ALIGN_CENTER;
    kot += CHARS.TEXT_DOUBLE_SIZE;
    kot += CHARS.TEXT_BOLD_ON;
    kot += 'KOT TICKET\n';
    kot += CHARS.TEXT_NORMAL;
    kot += `Table: T-${order.tableId}\n`;
    kot += `Order: #${order.id.substring(4, 10)}\n`;
    kot += `Time: ${nowIST}\n`;
    kot += CHARS.TEXT_BOLD_OFF;
    kot += '--------------------------------\n';
    kot += CHARS.ALIGN_LEFT;
    
    order.items.forEach(item => {
      kot += `${item.name}\n`;
      kot += `  Qty: ${item.quantity} (${item.portion})\n`;
      if (item.specialNotes) {
        kot += `  * Notes: ${item.specialNotes}\n`;
      }
    });
    kot += '--------------------------------\n';
    kot += CHARS.ALIGN_CENTER;
    kot += 'PAUNIKAR SAOJI KITCHEN\n\n\n\n';
    kot += CHARS.FEED_AND_CUT;

    await sendToPrinter(ip, Buffer.from(kot, 'utf-8'));
    console.log(`[Printer] KOT printed for Table ${order.tableId}`);
  } catch (error) {
    console.error('[Printer Error] printKOT failed:', error.message);
  }
}

export async function printBillReceipt(bill, order) {
  try {
    const settings = await prisma.settings.findFirst({});
    const ip = settings ? settings.billingPrinterIp : '127.0.0.1';
    const restName = settings ? settings.restaurantName : 'Paunikar Saoji Restaurant';
    const phone = settings?.phone || '+91 98765 43210';
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
    receipt += `Plot no.10 Near Purti Bazar,\n`;
    receipt += `Manewada Rd, Besa Pipla,\n`;
    receipt += `Maharashtra 440037\n`;
    receipt += `Ph: ${phone}\n`;
    receipt += 'TAX INVOICE (kar bijak)\n';
    receipt += '--------------------------------\n';
    receipt += CHARS.ALIGN_LEFT;
    receipt += `Invoice: #${bill.id ? bill.id.substring(5, 12) : 'PENDING'}\n`;
    receipt += `Table: T-${bill.tableId}\n`;
    receipt += `Date/Time: ${nowIST}\n`;
    receipt += `Payment: ${bill.paymentMethod || 'Cash'}\n`;
    receipt += '--------------------------------\n';
    
    // Items
    order.items.forEach(item => {
      const lineTotal = item.price * item.quantity;
      receipt += `${item.name}\n`;
      receipt += `  ${item.quantity} x Rs.${item.price} = Rs.${lineTotal}\n`;
    });
    receipt += '--------------------------------\n';
    
    // Totals
    receipt += CHARS.ALIGN_RIGHT;
    receipt += `Subtotal: Rs.${bill.subtotal}\n`;
    if (bill.gst > 0) {
      const halfAmt = Math.round(bill.gst / 2 * 100) / 100;
      receipt += `CGST (${halfPct}%): Rs.${halfAmt}\n`;
      receipt += `SGST (${halfPct}%): Rs.${halfAmt}\n`;
    }
    if (bill.discount > 0) {
      const discLabel = bill.discountPct ? `Discount (${bill.discountPct}%)` : 'Discount';
      receipt += `${discLabel}: -Rs.${bill.discount}\n`;
    }
    receipt += CHARS.TEXT_BOLD_ON;
    receipt += `GRAND TOTAL: Rs.${bill.grandTotal}\n`;
    receipt += CHARS.TEXT_BOLD_OFF;
    receipt += '--------------------------------\n';
    
    receipt += CHARS.ALIGN_CENTER;
    receipt += 'Thank you! Visit Again.\n';
    receipt += `${restName}\n\n\n\n`;
    receipt += CHARS.FEED_AND_CUT;

    await sendToPrinter(ip, Buffer.from(receipt, 'utf-8'));
    console.log(`[Printer] Bill Receipt printed for Table ${bill.tableId}`);
  } catch (error) {
    console.error('[Printer Error] printBillReceipt failed:', error.message);
  }
}
