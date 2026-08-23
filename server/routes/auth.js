import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({
      username: username.toLowerCase()
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid username' });
    }

    // Password is mandatory - never authenticate on a missing/empty password.
    if (!password) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Sign JWT token
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        zone: user.zone
      },
      process.env.JWT_SECRET || 'supersecretjwtkey123!',
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        status: user.status,
        zone: user.zone,
        salary: user.salary,
        performance: user.performance,
        overtimeHours: user.overtimeHours,
        shiftStart: user.shiftStart,
        shiftEnd: user.shiftEnd,
        isFirstLogin: user.isFirstLogin
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change authenticated user's password
router.post('/change-password', protect, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Verify current password if provided
    if (currentPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    user.isFirstLogin = false;
    await user.save();

    const safeUser = user.toObject();
    delete safeUser.password;

    res.json({ success: true, message: 'Password updated successfully', user: safeUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
