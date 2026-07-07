import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

// Middleware to verify JWT Token
export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Decode token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey123!');

      // Attach user details to request object
      // We'll read directly from User model inside controllers or seed req.user
      req.user = {
        id: decoded.id,
        name: decoded.name,
        username: decoded.username,
        role: decoded.role,
        zone: decoded.zone
      };

      next();
    } catch (error) {
      console.error('JWT Token Verification Fail:', error);
      res.status(401).json({ success: false, message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }
};

// Middleware to guard roles (RBAC)
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `Role (${req.user?.role || 'Guest'}) is not authorized to access this route` 
      });
    }
    next();
  };
};
