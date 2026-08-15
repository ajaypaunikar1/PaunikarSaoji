import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/staff
// @desc    Get all staff members (Admin/Manager)
router.get('/', protect, async (req, res) => {
  try {
    const staff = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        status: true,
        zone: true,
        salary: true,
        performance: true,
        overtimeHours: true,
        shiftStart: true,
        shiftEnd: true,
        createdAt: true,
        updatedAt: true
      }
    });
    res.json({ success: true, data: staff });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/staff
// @desc    Add new staff member (Admin/Manager)
router.post('/', protect, authorize('SuperAdmin', 'Manager'), async (req, res) => {
  const { name, username, password, role, zone, salary, shiftStart, shiftEnd } = req.body;

  try {
    const exist = await prisma.user.findUnique({
      where: { username: username.toLowerCase() }
    });
    if (exist) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        name,
        username: username.toLowerCase(),
        password: hashedPassword,
        role,
        zone,
        salary: Number(salary) || 0,
        performance: 5,
        overtimeHours: 0,
        shiftStart: shiftStart || '09:00:00',
        shiftEnd: shiftEnd || '17:00:00'
      }
    });

    res.status(201).json({ success: true, data: newUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/staff/:id
// @desc    Update staff details (Admin/Manager)
router.put('/:id', protect, async (req, res) => {
  try {
    const staff = await prisma.user.findUnique({
      where: { id: req.params.id }
    });
    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff member not found' });
    }

    const { name, role, zone, salary, status, performance, overtimeHours, shiftStart, shiftEnd } = req.body;

    const data = {};
    if (name) data.name = name;
    if (role) data.role = role;
    if (zone) data.zone = zone;
    if (salary !== undefined) data.salary = Number(salary);
    if (status) data.status = status;
    if (performance !== undefined) data.performance = Number(performance);
    if (overtimeHours !== undefined) data.overtimeHours = Number(overtimeHours);
    if (shiftStart !== undefined) data.shiftStart = shiftStart;
    if (shiftEnd !== undefined) data.shiftEnd = shiftEnd;

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data
    });

    // Broadcast Socket Event
    const io = req.app.get('io');
    console.log('Emitted staff_updated event:', updated.id, updated.status);
    io.emit('staff_updated', { id: updated.id, status: updated.status, user: updated });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/staff/attendance/clock-in
// @desc    Clock in attendance
router.post('/attendance/clock-in', protect, async (req, res) => {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  try {
    const exist = await prisma.attendance.findFirst({
      where: { employeeId: req.user.id, date: todayStr }
    });
    if (exist) {
      return res.status(400).json({ success: false, message: 'Already clocked in today' });
    }

    const clockInTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true });
    
    // Determine status (Late if after 09:15 AM in Kolkata)
    const nowKolkata = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    let attStatus = 'Present';
    if (nowKolkata.getHours() > 9 || (nowKolkata.getHours() === 9 && nowKolkata.getMinutes() > 15)) {
      attStatus = 'Late';
    }

    const newAtt = await prisma.attendance.create({
      data: {
        id: `att-${Date.now()}`,
        employeeId: req.user.id,
        date: todayStr,
        clockIn: clockInTime,
        status: attStatus
      }
    });

    res.status(201).json({ success: true, data: newAtt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/staff/attendance/clock-out
// @desc    Clock out attendance
router.post('/attendance/clock-out', protect, async (req, res) => {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  try {
    const attendance = await prisma.attendance.findFirst({
      where: { employeeId: req.user.id, date: todayStr }
    });
    if (!attendance) {
      return res.status(400).json({ success: false, message: 'No clock-in record found for today' });
    }

    if (attendance.clockOut) {
      return res.status(400).json({ success: false, message: 'Already clocked out today' });
    }

    const clockOutTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true });
    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { clockOut: clockOutTime }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/staff/attendance
// @desc    Get attendance history
router.get('/attendance', protect, async (req, res) => {
  try {
    const list = await prisma.attendance.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/staff/leaves
// @desc    Request leave (Waiter/Chef/Cashier)
router.post('/leaves', protect, async (req, res) => {
  const { startDate, endDate, reason } = req.body;

  try {
    const newLeave = await prisma.leaveRequest.create({
      data: {
        id: `leave-${Date.now()}`,
        employeeId: req.user.id,
        startDate,
        endDate,
        reason,
        status: 'Pending'
      }
    });

    // Create Notification
    const notif = await prisma.notification.create({
      data: {
        title: `Leave Request - ${req.user.name}`,
        message: `Requested leave: ${startDate} to ${endDate}. Reason: ${reason}`,
        type: 'Leave',
        timestamp: new Date().toLocaleTimeString(),
        read: false
      }
    });

    const io = req.app.get('io');
    io.emit('leave_requested', newLeave);
    io.emit('notification_received', notif);

    res.status(201).json({ success: true, data: newLeave });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/staff/leaves
// @desc    Get leave requests
router.get('/leaves', protect, async (req, res) => {
  try {
    const list = await prisma.leaveRequest.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/staff/leaves/:id
// @desc    Approve/Reject leave requests (Admin/Manager)
router.put('/leaves/:id', protect, authorize('SuperAdmin', 'Manager'), async (req, res) => {
  const { status } = req.body;

  try {
    const leave = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id }
    });
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status }
    });

    const io = req.app.get('io');
    io.emit('leave_status_updated', updated);

    res.json({ success: true, message: `Leave status set to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/staff/payroll
// @desc    Get payroll history
router.get('/payroll', protect, async (req, res) => {
  try {
    const list = await prisma.payroll.findMany({});
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/staff/audit-logs
// @desc    Get operational audit logs
router.get('/audit-logs', protect, async (req, res) => {
  try {
    const list = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/staff/audit-logs
// @desc    Create audit log entry
router.post('/audit-logs', protect, async (req, res) => {
  const { action } = req.body;

  try {
    const log = await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        userName: req.user.name,
        action,
        timestamp: new Date().toLocaleTimeString()
      }
    });

    res.status(201).json({ success: true, data: log });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/staff/:id
// @desc    Delete staff member (Admin/Manager)
router.delete('/:id', protect, authorize('SuperAdmin', 'Manager'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    const username = user.username;
    await prisma.user.delete({
      where: { id: req.params.id }
    });

    // Broadcast Socket Event
    const io = req.app.get('io');
    console.log('Emitted staff_deleted event:', req.params.id, username);
    io.emit('staff_deleted', { id: req.params.id, username });

    res.json({ success: true, message: 'Employee removed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/staff/attendance/manual
// @desc    Manually record/override attendance (Admin/Manager)
router.post('/attendance/manual', protect, authorize('SuperAdmin', 'Manager'), async (req, res) => {
  const { employeeId, date, status, clockIn, clockOut } = req.body;

  try {
    const existing = await prisma.attendance.findFirst({
      where: { employeeId, date }
    });

    let result;
    if (existing) {
      result = await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          status,
          clockIn: status === 'Absent' ? '' : (clockIn !== undefined ? clockIn : undefined),
          clockOut: status === 'Absent' ? '' : (clockOut !== undefined ? clockOut : undefined)
        }
      });
    } else {
      result = await prisma.attendance.create({
        data: {
          id: `att-${Date.now()}`,
          employeeId,
          date,
          clockIn: status === 'Absent' ? '' : (clockIn || '09:00:00'),
          clockOut: status === 'Absent' ? '' : (clockOut || ''),
          status
        }
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
