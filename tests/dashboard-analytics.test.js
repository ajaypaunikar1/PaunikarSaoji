import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Helper date utilities mirroring src/utils/date.ts
const getISTDateKey = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
};

const getISTHour = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false
  }).format(d);
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return 0;
  return hour === 24 ? 0 : hour;
};

// Mirroring the fixed isRecordToday from src/views/Dashboard.tsx
const isRecordToday = (record, testTodayKey = getISTDateKey()) => {
  if (!record) return false;
  const todayKey = testTodayKey;
  if (record.createdAt) return getISTDateKey(record.createdAt) === todayKey;
  if (typeof record.date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return record.date === todayKey;
    if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(record.date)) {
      const [d, m, y] = record.date.split(/[/-]/);
      return `${y}-${m}-${d}` === todayKey;
    }
  }
  if (record.timestamp && !isNaN(new Date(record.timestamp).getTime())) {
    return getISTDateKey(record.timestamp) === todayKey;
  }
  return false;
};

// Mirroring Dashboard metrics calculation
function computeDashboardMetrics({ orders, tables, attendance, bills, testTodayKey }) {
  const todayKey = testTodayKey || getISTDateKey();

  // Deduplicate paid bills by orderId
  const paidToday = bills.filter(b => b.paymentStatus === 'Paid' && isRecordToday(b, todayKey));
  const uniquePaidBills = new Map();
  paidToday.forEach(b => {
    if (!uniquePaidBills.has(b.orderId)) {
      uniquePaidBills.set(b.orderId, b);
    }
  });

  const totalRevenue = Array.from(uniquePaidBills.values())
    .reduce((sum, b) => sum + b.grandTotal, 0);

  const activeTables = tables.filter(t => t.status === 'Occupied' || t.status === 'Billing').length;
  const occupancyRate = tables.length > 0 ? Math.round((activeTables / tables.length) * 100) : 0;

  const paidOrderIds = new Set(bills.filter(b => b.paymentStatus === 'Paid').map(b => b.orderId));
  const activeLiveOrders = orders.filter(o => isRecordToday(o, todayKey) && o.status !== 'Served' && !paidOrderIds.has(o.id));
  const liveOrdersCount = activeLiveOrders.length;

  let avgWaitTime = 0;
  if (activeLiveOrders.length > 0) {
    const waitTimes = activeLiveOrders.map(o => {
      if (o.createdAt) {
        const elapsed = (Date.now() - new Date(o.createdAt).getTime()) / 60000;
        return Math.max(0, Math.round(elapsed));
      }
      const itemPreps = o.items?.map(i => i.prepTime || 10) || [10];
      return Math.max(...itemPreps);
    });
    avgWaitTime = Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length);
  }

  const presentStaff = attendance.filter(a =>
    a.date === todayKey &&
    (a.status === 'Present' || a.status === 'Late') &&
    !a.clockOut
  ).length;

  return { totalRevenue, occupancyRate, avgWaitTime, presentStaff, liveOrdersCount, uniquePaidBillsCount: uniquePaidBills.size };
}

// Mirroring Reports calculation
function computeReportsMetrics({ orders, bills, testTodayKey }) {
  const todayKey = testTodayKey || getISTDateKey();
  const filteredOrders = orders.filter(o => isRecordToday(o, todayKey));

  let totalRevenue = 0;
  let pendingAmount = 0;
  let totalDiscount = 0;
  let totalContainerCharge = 0;
  let parcelOrders = 0;
  let parcelRevenue = 0;
  let parcelContainerCharge = 0;

  filteredOrders.forEach(ord => {
    const bill = bills.find(b => b.orderId === ord.id);
    const isParcel = !!ord.isParcel || !!bill?.isParcel;
    if (isParcel) parcelOrders++;

    if (bill) {
      if (bill.paymentStatus === 'Paid') {
        totalRevenue += bill.grandTotal;
        totalDiscount += bill.discount || 0;
        totalContainerCharge += bill.containerCharge || 0;
        if (isParcel) {
          parcelRevenue += bill.grandTotal;
          parcelContainerCharge += bill.containerCharge || 0;
        }
      } else if (bill.paymentStatus === 'Pending') {
        pendingAmount += bill.grandTotal;
        totalDiscount += bill.discount || 0;
        totalContainerCharge += bill.containerCharge || 0;
      }
    } else {
      pendingAmount += ord.grandTotal || 0;
    }
  });

  return {
    totalRevenue,
    pendingAmount,
    grandTotal: totalRevenue + pendingAmount,
    totalDiscount,
    totalContainerCharge,
    totalOrders: filteredOrders.length,
    parcelOrders,
    parcelRevenue,
    parcelContainerCharge
  };
}

// Mirroring Hourly chart calculation
function computeHourlySales({ bills, testTodayKey }) {
  const todayKey = testTodayKey || getISTDateKey();
  const slots = [
    { hour: '11:00 AM', sales: 0 },
    { hour: '12:00 PM', sales: 0 },
    { hour: '01:00 PM', sales: 0 },
    { hour: '02:00 PM', sales: 0 },
    { hour: '03:00 PM', sales: 0 },
    { hour: '04:00 PM', sales: 0 },
    { hour: '05:00 PM', sales: 0 },
    { hour: '06:00 PM', sales: 0 },
    { hour: '07:00 PM', sales: 0 },
    { hour: '08:00 PM', sales: 0 },
    { hour: '09:00 PM', sales: 0 },
    { hour: '10:00 PM', sales: 0 },
  ];

  const paidToday = bills.filter(b => b.paymentStatus === 'Paid' && isRecordToday(b, todayKey));
  const uniquePaidBills = new Map();
  paidToday.forEach(b => {
    if (!uniquePaidBills.has(b.orderId)) {
      uniquePaidBills.set(b.orderId, b);
    }
  });

  Array.from(uniquePaidBills.values()).forEach(bill => {
    let hourNum = null;
    if (bill.createdAt) {
      hourNum = getISTHour(bill.createdAt);
    }
    if (hourNum === null) return;
    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    let displayHour = hourNum % 12;
    displayHour = displayHour === 0 ? 12 : displayHour;
    const formattedHour = `${String(displayHour).padStart(2, '0')}:00 ${ampm}`;

    const found = slots.find(s => s.hour === formattedHour);
    if (found) {
      found.sales += bill.grandTotal;
    }
  });

  return slots;
}

// Mirroring Product performance calculation
function computeProductMetrics({ orders, testTodayKey }) {
  const todayKey = testTodayKey || getISTDateKey();
  const filteredOrders = orders.filter(o => isRecordToday(o, todayKey));
  const counts = {};

  filteredOrders.forEach(ord => {
    (ord.items || []).forEach(item => {
      const key = `${item.menuId || item.name}-${item.portion || 'Single'}`;
      if (!counts[key]) {
        counts[key] = { name: `${item.name}${item.portion ? ` (${item.portion})` : ''}`, quantity: 0, revenue: 0 };
      }
      counts[key].quantity += (Number(item.quantity) || 1);
      counts[key].revenue += ((Number(item.quantity) || 1) * (Number(item.price) || 0));
    });
  });

  return Object.values(counts).sort((a, b) => b.quantity - a.quantity);
}

describe('Paunikar Saoji RMS Dashboard Analytics Tests', () => {

  const fixtures = {
    testDate: '2026-10-10',
    orders: [
      { id: 'ord-1', tableId: 0, isParcel: true, status: 'Served', grandTotal: 360, createdAt: '2026-10-10T09:35:14.845Z', items: [{ menuId: 'm1', name: 'Patvadi', portion: 'Single', price: 250, quantity: 1 }, { menuId: 'm2', name: 'Roti', portion: 'Single', price: 15, quantity: 4 }, { menuId: 'm3', name: 'Steam Rice', portion: 'Single', price: 50, quantity: 1 }] },
      { id: 'ord-2', tableId: 5, isParcel: false, status: 'Served', grandTotal: 315, createdAt: '2026-10-10T10:26:56.049Z', items: [{ menuId: 'm4', name: 'Egg Curry', portion: 'Single', price: 200, quantity: 1 }, { menuId: 'm2', name: 'Roti', portion: 'Single', price: 15, quantity: 3 }, { menuId: 'm5', name: 'Jeera Rice', portion: 'Single', price: 60, quantity: 1 }, { menuId: 'm6', name: 'Water Bottle', portion: 'Single', price: 10, quantity: 1 }] },
      { id: 'ord-3', tableId: 4, isParcel: false, status: 'Served', grandTotal: 875, createdAt: '2026-10-10T10:45:19.789Z', items: [{ menuId: 'm7', name: 'Mutton Curry', portion: 'Full', price: 280, quantity: 2 }, { menuId: 'm8', name: 'Kadak Roti', portion: 'Single', price: 20, quantity: 12 }, { menuId: 'm3', name: 'Steam Rice', portion: 'Single', price: 50, quantity: 1 }, { menuId: 'm6', name: 'Water Bottle', portion: 'Single', price: 25, quantity: 1 }] },
      { id: 'ord-4', tableId: 2, isParcel: false, status: 'Served', grandTotal: 1785, createdAt: '2026-10-10T10:47:28.234Z', items: [{ menuId: 'm9', name: 'Sundari Curry', portion: 'Full', price: 320, quantity: 1 }, { menuId: 'm10', name: 'Zinga Curry', portion: 'Full', price: 380, quantity: 2 }, { menuId: 'm11', name: 'Kheema Kaleji Curry', portion: 'Single', price: 390, quantity: 1 }, { menuId: 'm2', name: 'Roti', portion: 'Single', price: 15, quantity: 16 }, { menuId: 'm3', name: 'Steam Rice', portion: 'Single', price: 50, quantity: 1 }, { menuId: 'm6', name: 'Water Bottle', portion: 'Single', price: 25, quantity: 1 }] },
      { id: 'ord-5', tableId: 0, isParcel: true, status: 'Served', grandTotal: 1400, createdAt: '2026-10-10T13:19:52.994Z', items: [{ menuId: 'm11', name: 'Kheema Kaleji Curry', portion: 'Single', price: 390, quantity: 1 }, { menuId: 'm12', name: 'Khur Curry', portion: 'Full', price: 400, quantity: 1 }, { menuId: 'm7', name: 'Mutton Curry', portion: 'Full', price: 380, quantity: 1 }, { menuId: 'm2', name: 'Roti', portion: 'Single', price: 15, quantity: 10 }, { menuId: 'm3', name: 'Steam Rice', portion: 'Single', price: 80, quantity: 1 }] },
      { id: 'ord-6', tableId: 0, isParcel: true, status: 'Served', grandTotal: 490, createdAt: '2026-10-10T13:58:51.230Z', items: [{ menuId: 'm7', name: 'Mutton Curry', portion: 'Full', price: 380, quantity: 1 }, { menuId: 'm2', name: 'Roti', portion: 'Single', price: 15, quantity: 4 }, { menuId: 'm3', name: 'Steam Rice', portion: 'Single', price: 50, quantity: 1 }] },
      { id: 'ord-7', tableId: 0, isParcel: true, status: 'Served', grandTotal: 380, createdAt: '2026-10-10T14:01:25.570Z', items: [{ menuId: 'm13', name: 'Chicken Curry', portion: 'Full', price: 380, quantity: 1 }] },
      { id: 'ord-8', tableId: 4, isParcel: false, status: 'Served', grandTotal: 1030, createdAt: '2026-10-10T15:07:07.125Z', items: [{ menuId: 'm12', name: 'Khur Curry', portion: 'Full', price: 400, quantity: 1 }, { menuId: 'm7', name: 'Mutton Curry', portion: 'Full', price: 380, quantity: 1 }, { menuId: 'm2', name: 'Roti', portion: 'Single', price: 15, quantity: 3 }, { menuId: 'm14', name: 'Bhakar', portion: 'Single', price: 35, quantity: 2 }, { menuId: 'm5', name: 'Jeera Rice', portion: 'Single', price: 60, quantity: 1 }, { menuId: 'm6', name: 'Water Bottle', portion: 'Single', price: 25, quantity: 1 }, { menuId: 'm15', name: 'Egg', portion: 'Single', price: 25, quantity: 2 }] },
      { id: 'ord-9', tableId: 0, isParcel: true, status: 'Served', grandTotal: 510, createdAt: '2026-10-10T15:15:21.172Z', items: [{ menuId: 'm9', name: 'Sundari Curry', portion: 'Half', price: 220, quantity: 1 }, { menuId: 'm12', name: 'Khur Curry', portion: 'Half', price: 290, quantity: 1 }] }
    ],
    // 11 bills on 2026-10-10 (including 3 duplicate bills for ord-3)
    bills: [
      { id: 'bill-1', orderId: 'ord-1', tableId: 0, isParcel: true, grandTotal: 370, containerCharge: 10, discount: 0, paymentStatus: 'Paid', createdAt: '2026-10-10T09:35:16.376Z' },
      { id: 'bill-2', orderId: 'ord-2', tableId: 5, isParcel: false, grandTotal: 315, containerCharge: 0, discount: 0, paymentStatus: 'Paid', createdAt: '2026-10-10T10:27:11.512Z' },
      { id: 'bill-3a', orderId: 'ord-3', tableId: 4, isParcel: false, grandTotal: 875, containerCharge: 0, discount: 0, paymentStatus: 'Paid', createdAt: '2026-10-10T16:01:51.057Z' },
      { id: 'bill-3b', orderId: 'ord-3', tableId: 4, isParcel: false, grandTotal: 875, containerCharge: 0, discount: 0, paymentStatus: 'Paid', createdAt: '2026-10-10T16:01:53.332Z' },
      { id: 'bill-3c', orderId: 'ord-3', tableId: 4, isParcel: false, grandTotal: 875, containerCharge: 0, discount: 0, paymentStatus: 'Paid', createdAt: '2026-10-10T16:01:55.511Z' },
      { id: 'bill-4', orderId: 'ord-4', tableId: 2, isParcel: false, grandTotal: 1785, containerCharge: 0, discount: 0, paymentStatus: 'Paid', createdAt: '2026-10-10T10:47:40.547Z' },
      { id: 'bill-5', orderId: 'ord-5', tableId: 0, isParcel: true, grandTotal: 1430, containerCharge: 30, discount: 0, paymentStatus: 'Paid', createdAt: '2026-10-10T13:19:54.391Z' },
      { id: 'bill-6', orderId: 'ord-6', tableId: 0, isParcel: true, grandTotal: 530, containerCharge: 40, discount: 0, paymentStatus: 'Paid', createdAt: '2026-10-10T13:58:52.820Z' },
      { id: 'bill-7', orderId: 'ord-7', tableId: 0, isParcel: true, grandTotal: 390, containerCharge: 10, discount: 0, paymentStatus: 'Paid', createdAt: '2026-10-10T14:01:27.015Z' },
      { id: 'bill-8', orderId: 'ord-8', tableId: 4, isParcel: false, grandTotal: 1030, containerCharge: 0, discount: 0, paymentStatus: 'Paid', createdAt: '2026-10-10T15:07:38.889Z' },
      { id: 'bill-9', orderId: 'ord-9', tableId: 0, isParcel: true, grandTotal: 530, containerCharge: 20, discount: 0, paymentStatus: 'Paid', createdAt: '2026-10-10T15:15:22.646Z' }
    ],
    tables: Array.from({ length: 18 }, (_, i) => ({ id: i + 1, status: 'Available' })),
    attendance: []
  };

  it('1. Revenue Deduplication & Reconciliation with Reports', () => {
    const rawSum = fixtures.bills.reduce((sum, b) => sum + b.grandTotal, 0);
    assert.equal(rawSum, 9005, 'Raw bills with duplicates equal the un-deduplicated 9005');

    const dashboard = computeDashboardMetrics({
      orders: fixtures.orders,
      tables: fixtures.tables,
      attendance: fixtures.attendance,
      bills: fixtures.bills,
      testTodayKey: fixtures.testDate
    });

    const reports = computeReportsMetrics({
      orders: fixtures.orders,
      bills: fixtures.bills,
      testTodayKey: fixtures.testDate
    });

    assert.equal(dashboard.totalRevenue, 7255, 'Dashboard totalRevenue correctly deduplicates and equals 7255');
    assert.equal(reports.grandTotal, 7255, 'Reports grandTotal equals 7255');
    assert.equal(dashboard.totalRevenue, reports.totalRevenue, 'Dashboard and Reports reconcile when all bills are paid');
    assert.equal(rawSum - dashboard.totalRevenue, 1750, 'The 1750 discrepancy is exactly explained by the two duplicate bills (2 * 875)');
  });

  it('2. Parcel orders breakdown & container charge consistency', () => {
    const reports = computeReportsMetrics({
      orders: fixtures.orders,
      bills: fixtures.bills,
      testTodayKey: fixtures.testDate
    });

    assert.equal(reports.parcelOrders, 5, 'Exactly 5 parcel orders');
    assert.equal(reports.parcelRevenue, 3250, 'Parcel paid revenue equals 3250');
    assert.equal(reports.parcelContainerCharge, 110, 'Container charge across parcels is 110 (10+30+40+10+20)');
  });

  it('3. Table Occupancy calculation handles available, occupied, and billing', () => {
    // All available
    const m1 = computeDashboardMetrics({
      orders: fixtures.orders,
      tables: fixtures.tables,
      attendance: fixtures.attendance,
      bills: fixtures.bills,
      testTodayKey: fixtures.testDate
    });
    assert.equal(m1.occupancyRate, 0, '0% when all tables available');

    // 3 occupied, 1 billing, 2 cleaning out of 18
    const mockTables = [
      { id: 1, status: 'Occupied' },
      { id: 2, status: 'Occupied' },
      { id: 3, status: 'Occupied' },
      { id: 4, status: 'Billing' },
      { id: 5, status: 'Cleaning' },
      ...Array.from({ length: 13 }, (_, i) => ({ id: i + 6, status: 'Available' }))
    ];
    const m2 = computeDashboardMetrics({
      orders: fixtures.orders,
      tables: mockTables,
      attendance: fixtures.attendance,
      bills: fixtures.bills,
      testTodayKey: fixtures.testDate
    });
    // 4 active tables out of 18 -> 22%
    assert.equal(m2.occupancyRate, 22, 'Occupancy is 22% (4 / 18)');
  });

  it('4. Operational metrics: zero values when underlying data is empty/served', () => {
    const dashboard = computeDashboardMetrics({
      orders: fixtures.orders,
      tables: fixtures.tables,
      attendance: fixtures.attendance,
      bills: fixtures.bills,
      testTodayKey: fixtures.testDate
    });

    assert.equal(dashboard.occupancyRate, 0, 'Table occupancy is confirmed 0% (no active tables)');
    assert.equal(dashboard.liveOrdersCount, 0, 'Live orders is confirmed 0 (all 9 orders served and paid)');
    assert.equal(dashboard.avgWaitTime, 0, 'Average wait time is confirmed 0 mins (no orders currently waiting)');
    assert.equal(dashboard.presentStaff, 0, 'Present staff is confirmed 0 (no clock-ins for today)');
  });

  it('5. Hourly sales chart deduplicates paid bills and matches IST hours', () => {
    const slots = computeHourlySales({ bills: fixtures.bills, testTodayKey: fixtures.testDate });
    const totalChartSales = slots.reduce((sum, s) => sum + s.sales, 0);

    assert.equal(totalChartSales, 7255, 'Chart sales total matches reconciled revenue 7255');
    // At 9:00 PM (16:01 UTC = 21:31 IST), ord-3 (875) is recorded ONCE, not three times
    const ninePm = slots.find(s => s.hour === '09:00 PM');
    assert.equal(ninePm.sales, 875, '9:00 PM slot contains 875 once (not 2625)');
  });

  it('6. Product quantities derived properly from order items', () => {
    const products = computeProductMetrics({ orders: fixtures.orders, testTodayKey: fixtures.testDate });
    
    // Check top products
    const roti = products.find(p => p.name.includes('Roti'));
    assert.ok(roti, 'Roti exists in product performance');
    // Sum all Roti lines
    const totalRoti = products
      .filter(p => p.name === 'Roti (Single)')
      .reduce((sum, p) => sum + p.quantity, 0);
    assert.equal(totalRoti, 40, 'Total Roti quantity is 40');

    const kadakRoti = products.find(p => p.name === 'Kadak Roti (Single)');
    assert.equal(kadakRoti?.quantity, 12, 'Kadak Roti quantity is 12');
  });

  it('7. Date parsing consistency for ISO, YYYY-MM-DD, and DD/MM/YYYY', () => {
    const isoRecord = { createdAt: '2026-10-10T14:00:00.000Z' };
    const ymdRecord = { date: '2026-10-10' };
    const dmySlashRecord = { date: '10/10/2026' };
    const dmyDashRecord = { date: '10-10-2026' };
    const yesterdayRecord = { date: '2026-10-09' };

    assert.equal(isRecordToday(isoRecord, '2026-10-10'), true, 'ISO string matched');
    assert.equal(isRecordToday(ymdRecord, '2026-10-10'), true, 'YYYY-MM-DD matched');
    assert.equal(isRecordToday(dmySlashRecord, '2026-10-10'), true, 'DD/MM/YYYY matched');
    assert.equal(isRecordToday(dmyDashRecord, '2026-10-10'), true, 'DD-MM-YYYY matched');
    assert.equal(isRecordToday(yesterdayRecord, '2026-10-10'), false, 'Yesterday rejected');
  });
});
