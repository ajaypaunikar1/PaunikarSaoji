import express from 'express';
import bcrypt from 'bcryptjs';
import {
  User,
  Attendance,
  LeaveRequest,
  Payroll,
  AuditLog,
  Notification
} from '../models/index.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/staff
// @desc    Get all staff members (Admin/Manager)
router.get('/', protect, async (req, res) => {
  try {
    const staff = await User.find().select('-password');
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
    const exist = await User.findOne({
      username: username.toLowerCase()
    });
    if (exist) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
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
    });

    const safeUser = newUser.toObject();
    delete safeUser.password;

    res.status(201).json({ success: true, data: safeUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/staff/:id
// @desc    Update staff details (Admin/Manager)
router.put('/:id', protect, authorize('SuperAdmin', 'Manager'), async (req, res) => {
  try {
    const staff = await User.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff member not found' });
    }

    // Prevent privilege escalation: a user must never be able to change their own
    // role/status/salary so they can't self-promote or attempt to lock themselves out.
    const isSelf = staff.id === req.user.id;
    if (isSelf) {
      const { role, status, salary } = req.body;
      if (role !== undefined || status !== undefined || salary !== undefined) {
        return res.status(403).json({
          success: false,
          message: 'You cannot change your own role, status, or salary'
        });
      }
    }

    const { name, role, zone, salary, status, performance, overtimeHours, shiftStart, shiftEnd } = req.body;

    if (name) staff.name = name;
    if (role) staff.role = role;
    if (zone) staff.zone = zone;
    if (salary !== undefined) staff.salary = Number(salary);
    if (status) staff.status = status;
    if (performance !== undefined) staff.performance = Number(performance);
    if (overtimeHours !== undefined) staff.overtimeHours = Number(overtimeHours);
    if (shiftStart !== undefined) staff.shiftStart = shiftStart;
    if (shiftEnd !== undefined) staff.shiftEnd = shiftEnd;
    await staff.save();

    // Broadcast Socket Event
    const io = req.app.get('io');
    console.log('Emitted staff_updated event:', staff.id, staff.status);
    io.emit('staff_updated', { id: staff.id, status: staff.status, user: staff.toObject() });

    res.json({ success: true, data: staff });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/staff/attendance/clock-in
// @desc    Clock in attendance
router.post('/attendance/clock-in', protect, async (req, res) => {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  try {
    const exist = await Attendance.findOne({
      employeeId: req.user.id,
      date: todayStr
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

    const newAtt = await Attendance.create({
      employeeId: req.user.id,
      date: todayStr,
      clockIn: clockInTime,
      status: attStatus
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
    const attendance = await Attendance.findOne({
      employeeId: req.user.id,
      date: todayStr
    });
    if (!attendance) {
      return res.status(400).json({ success: false, message: 'No clock-in record found for today' });
    }

    if (attendance.clockOut) {
      return res.status(400).json({ success: false, message: 'Already clocked out today' });
    }

    const clockOutTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true });
    attendance.clockOut = clockOutTime;
    const updated = await attendance.save();

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/staff/attendance
// @desc    Get attendance history
router.get('/attendance', protect, async (req, res) => {
  try {
    const list = await Attendance.find().sort({ createdAt: -1 });
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
    const newLeave = await LeaveRequest.create({
      employeeId: req.user.id,
      startDate,
      endDate,
      reason,
      status: 'Pending'
    });

    // Create Notification
    const notif = await Notification.create({
      title: `Leave Request - ${req.user.name}`,
      message: `Requested leave: ${startDate} to ${endDate}. Reason: ${reason}`,
      type: 'Leave',
      timestamp: new Date().toLocaleTimeString(),
      read: false
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
    const list = await LeaveRequest.find().sort({ createdAt: -1 });
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
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    leave.status = status;
    const updated = await leave.save();

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
    const list = await Payroll.find();
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/staff/audit-logs
// @desc    Get operational audit logs
router.get('/audit-logs', protect, async (req, res) => {
  try {
    const list = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
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
    const log = await AuditLog.create({
      userId: req.user.id,
      userName: req.user.name,
      action,
      timestamp: new Date().toLocaleTimeString()
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
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    const username = user.username;
    await user.deleteOne();

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
    const existing = await Attendance.findOne({
      employeeId,
      date
    });

    let result;
    if (existing) {
      result = await Attendance.findByIdAndUpdate(
        existing._id,
        {
          status,
          clockIn: status === 'Absent' ? '' : (clockIn !== undefined ? clockIn : undefined),
          clockOut: status === 'Absent' ? '' : (clockOut !== undefined ? clockOut : undefined)
        },
        { new: true }
      );
    } else {
      result = await Attendance.create({
        employeeId,
        date,
        clockIn: status === 'Absent' ? '' : (clockIn || '09:00:00'),
        clockOut: status === 'Absent' ? '' : (clockOut || ''),
        status
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
