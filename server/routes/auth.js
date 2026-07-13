import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';

const router = express.Router();

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() }
    });
    
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid username' });
    }

    if (password) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Invalid credentials' });
      }
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
        overtimeHours: user.overtimeHours
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
