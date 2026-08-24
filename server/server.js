import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { pingDatabase } from './config/db.js';
import { User, Table, MenuItem, Settings } from './models/index.js';

// Route imports
import authRoutes from './routes/auth.js';
import tableRoutes from './routes/tables.js';
import orderRoutes from './routes/orders.js';
import billingRoutes from './routes/billing.js';
import menuRoutes from './routes/menu.js';
import staffRoutes from './routes/staff.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Attach Socket.IO to Express app object for route access
app.set('io', io);

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// Server and Database status API (bypasses DB block to return clean connection status)
app.get('/api/status', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    await pingDatabase();
    dbStatus = 'connected';
  } catch (err) {
    console.error('Database connection test failed:', err.message);
  }
  res.json({
    success: true,
    server: 'online',
    database: dbStatus
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/staff', staffRoutes);

// General Settings API Routes
app.get('/api/settings', async (req, res) => {
  try {
    let settings = await Settings.findById('settings-main');
    if (!settings) {
      settings = await Settings.create({
        _id: 'settings-main',
        restaurantName: 'Paunikar Saoji Restaurant',
        address: 'Plot no.10 Near Purti Bazar, Manewada Rd, Besa Pipla, Maharashtra 440037',
        phone: '',
        upiId: 'restaurant@upi',
        zones: ['A', 'B', 'C'],
        mergedGroups: [],
        kitchenPrinterIp: '127.0.0.1',
        billingPrinterIp: '127.0.0.1'
      });
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.id;
    delete updates._id;
    const settings = await Settings.findOneAndUpdate(
      { _id: 'settings-main' },
      { $set: updates },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Socket.IO real-time orchestrator
io.on('connection', (socket) => {
  console.log(`Socket Client Connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Socket Client Disconnected: ${socket.id}`);
  });
});

// Database Auto-Seeder
const seedDatabase = async () => {
  try {
    // 1. Seed Admin User if missing
    const adminUser = await User.findOne({ username: 'admin' });
    if (!adminUser) {
      console.log('Seeding initial database admin user...');
      const bcrypt = await import('bcryptjs');
      const salt = await bcrypt.default.genSalt(10);
      const hashedPassword = await bcrypt.default.hash('password', salt);
      await User.create({
        name: 'Aditya Patil',
        username: 'admin',
        password: hashedPassword,
        role: 'SuperAdmin',
        status: 'Active',
        zone: 'All',
        salary: 75000
      });
      console.log('Admin user seeded successfully!');
    }

    // 2. Seed Seating Tables
    const tableCount = await Table.countDocuments();
    if (tableCount === 0) {
      console.log('Seeding restaurant tables (1 to 24)...');
      const tablesToSeed = Array.from({ length: 24 }, (_, i) => {
        const id = i + 1;
        let zone = 'A';
        if (id > 8 && id <= 16) zone = 'B';
        if (id > 16) zone = 'C';
        return {
          _id: id,
          guests: 0,
          status: 'Available',
          zone
        };
      });

      await Table.insertMany(tablesToSeed);
      console.log('Tables seeded successfully!');
    }

    // 3. Seed Menu Items
    const menuCount = await MenuItem.countDocuments();
    const hasSaojiMenu = await MenuItem.findById('m_veg_1');
    if (menuCount === 0 || !hasSaojiMenu) {
      console.log('Clearing old menu selections and seeding Paunikar Saoji Family Restaurant menu...');
      await MenuItem.deleteMany({});

      const menuToSeed = [
        // 1. वेज (Vegetarian Curries)
        { _id: 'm_veg_1', name: 'पाटवडी (Patvadi)', category: 'Vegetarian', portionMode: 'Single', price: 250, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_veg_2', name: 'डाळकांदा (Dal Kanda)', category: 'Vegetarian', portionMode: 'Single', price: 250, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_veg_3', name: 'शेवभाजी (Shev Bhaji)', category: 'Vegetarian', portionMode: 'Single', price: 250, variants: [], prepTime: 12, isAvailable: true },
        { _id: 'm_veg_4', name: 'पनीर बटर मसाला (Paneer Butter Masala)', category: 'Vegetarian', portionMode: 'Single', price: 280, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_veg_5', name: 'कोल्हापूरी पनीर (Kolhapuri Paneer)', category: 'Vegetarian', portionMode: 'Single', price: 280, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_veg_6', name: 'पनीर मसाला (Paneer Masala)', category: 'Vegetarian', portionMode: 'Single', price: 280, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_veg_7', name: 'पालक पनीर (Palak Paneer)', category: 'Vegetarian', portionMode: 'Single', price: 300, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_veg_8', name: 'पनीर खसखस (Paneer Khas Khas)', category: 'Vegetarian', portionMode: 'Single', price: 350, variants: [], prepTime: 18, isAvailable: true },
        { _id: 'm_veg_9', name: 'दाल फ्राय (Dal Fry)', category: 'Vegetarian', portionMode: 'Single', price: 200, variants: [], prepTime: 10, isAvailable: true },
        { _id: 'm_veg_10', name: 'दाल तडका (Dal Tadka)', category: 'Vegetarian', portionMode: 'Single', price: 230, variants: [], prepTime: 12, isAvailable: true },
        { _id: 'm_veg_11', name: 'टमाटर चटणी (Tamatar Chutney)', category: 'Vegetarian', portionMode: 'Single', price: 250, variants: [], prepTime: 12, isAvailable: true },
        { _id: 'm_veg_12', name: 'पनीर भुर्जी (Paneer Bhurji)', category: 'Vegetarian', portionMode: 'Single', price: 320, variants: [], prepTime: 15, isAvailable: true },

        // 2. अंडा करी (Egg Curry)
        { _id: 'm_egg_1', name: 'वेज अंडाकरी (Veg Egg Curry)', category: 'Egg Curry', portionMode: 'Single', price: 180, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_egg_2', name: 'वेज फ्राय अंडाकरी (Veg Fry Egg Curry)', category: 'Egg Curry', portionMode: 'Single', price: 200, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_egg_3', name: 'फ्राय अंडाकरी नॉनव्हेज (Fry Egg Curry Non-Veg)', category: 'Egg Curry', portionMode: 'Single', price: 220, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_egg_4', name: 'अंडाकरी नॉनव्हेज (Egg Curry Non-Veg)', category: 'Egg Curry', portionMode: 'Single', price: 200, variants: [], prepTime: 15, isAvailable: true },

        // 3. चपाती (Breads)
        { _id: 'm_bread_1', name: 'रोटी (Roti)', category: 'Breads', portionMode: 'Single', price: 15, variants: [], prepTime: 3, isAvailable: true },
        { _id: 'm_bread_2', name: 'कडक रोटी (Kadak Roti)', category: 'Breads', portionMode: 'Single', price: 20, variants: [], prepTime: 4, isAvailable: true },
        { _id: 'm_bread_3', name: 'बटर रोटी (Butter Roti)', category: 'Breads', portionMode: 'Single', price: 25, variants: [], prepTime: 3, isAvailable: true },
        { _id: 'm_bread_4', name: 'घी रोटी (Ghee Roti)', category: 'Breads', portionMode: 'Single', price: 25, variants: [], prepTime: 3, isAvailable: true },
        { _id: 'm_bread_5', name: 'बटर पराठा (Butter Paratha)', category: 'Breads', portionMode: 'Single', price: 30, variants: [], prepTime: 5, isAvailable: true },
        { _id: 'm_bread_6', name: 'घी पराठा (Ghee Paratha)', category: 'Breads', portionMode: 'Single', price: 30, variants: [], prepTime: 5, isAvailable: true },
        { _id: 'm_bread_7', name: 'तेल पराठा (Oil Paratha)', category: 'Breads', portionMode: 'Single', price: 30, variants: [], prepTime: 5, isAvailable: true },
        { _id: 'm_bread_8', name: 'भाकर (Bhakar)', category: 'Breads', portionMode: 'Single', price: 35, variants: [], prepTime: 6, isAvailable: true },

        // 4. राईस (Rice)
        { _id: 'm_rice_1', name: 'स्टीम राईस (Steam Rice)', category: 'Rice', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 50, prepTime: 8 }, { name: 'Full', price: 80, prepTime: 12 }], prepTime: 10, isAvailable: true },
        { _id: 'm_rice_2', name: 'जिरा राईस (Jeera Rice)', category: 'Rice', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 60, prepTime: 8 }, { name: 'Full', price: 100, prepTime: 12 }], prepTime: 10, isAvailable: true },
        { _id: 'm_rice_3', name: 'गार्लिक राईस (Garlic Rice)', category: 'Rice', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 80, prepTime: 10 }, { name: 'Full', price: 120, prepTime: 15 }], prepTime: 12, isAvailable: true },

        // 5. पापड (Papad)
        { _id: 'm_papad_1', name: 'पापड (Plain Papad)', category: 'Papad', portionMode: 'Single', price: 25, variants: [], prepTime: 2, isAvailable: true },
        { _id: 'm_papad_2', name: 'फ्राय पापड (Fried Papad)', category: 'Papad', portionMode: 'Single', price: 30, variants: [], prepTime: 2, isAvailable: true },
        { _id: 'm_papad_3', name: 'मसाला पापड (Masala Papad)', category: 'Papad', portionMode: 'Single', price: 50, variants: [], prepTime: 4, isAvailable: true },

        // 6. नॉनवेज स्टार्टर (Starters)
        { _id: 'm_nst_1', name: 'फिश फ्राय (Fish Fry)', category: 'Starters', portionMode: 'Single', price: 350, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_nst_2', name: 'सुखा झिंगा (Sukha Zinga / Dry Prawns)', category: 'Starters', portionMode: 'Single', price: 380, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_nst_3', name: 'खिमा कलेजी (Kheema Kaleji Starter)', category: 'Starters', portionMode: 'Single', price: 390, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_nst_4', name: 'गारलिक खिमा (Garlic Kheema)', category: 'Starters', portionMode: 'Single', price: 410, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_nst_5', name: 'मुंडरी स्टार्टर (Mundari Starter)', category: 'Starters', portionMode: 'Single', price: 320, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_nst_6', name: 'ग्रिन मटन (Green Mutton)', category: 'Starters', portionMode: 'Single', price: 380, variants: [], prepTime: 18, isAvailable: true },
        { _id: 'm_nst_7', name: 'गारलिक ग्रिन मटन (Garlic Green Mutton)', category: 'Starters', portionMode: 'Single', price: 400, variants: [], prepTime: 18, isAvailable: true },
        { _id: 'm_nst_8', name: 'सुखा मटन (Sukha Mutton / Dry Mutton)', category: 'Starters', portionMode: 'Single', price: 380, variants: [], prepTime: 18, isAvailable: true },
        { _id: 'm_nst_9', name: 'गारलिक मटन (Garlic Mutton)', category: 'Starters', portionMode: 'Single', price: 400, variants: [], prepTime: 18, isAvailable: true },
        { _id: 'm_nst_10', name: 'सुखा खुर (Sukha Khur / Dry Trotters)', category: 'Starters', portionMode: 'Single', price: 400, variants: [], prepTime: 20, isAvailable: true },
        { _id: 'm_nst_11', name: 'चिकन सुखा (Chicken Sukha / Dry Chicken)', category: 'Starters', portionMode: 'Single', price: 380, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_nst_12', name: 'गारलिक सुखा चिकन (Garlic Sukha Chicken)', category: 'Starters', portionMode: 'Single', price: 400, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_nst_13', name: 'गास्लीक कत्तीचा चिकन (Gaslik Katticha Chicken)', category: 'Starters', portionMode: 'Single', price: 470, variants: [], prepTime: 18, isAvailable: true },
        { _id: 'm_nst_14', name: 'सुखा चिकन कत्तीचा (Sukha Chicken Katticha)', category: 'Starters', portionMode: 'Single', price: 450, variants: [], prepTime: 18, isAvailable: true },
        { _id: 'm_nst_15', name: 'मसाला सावजी चिकन (Masala Saoji Chicken)', category: 'Starters', portionMode: 'Single', price: 350, variants: [], prepTime: 15, isAvailable: true },

        // 7. करी (Curries)
        { _id: 'm_cur_1', name: 'झिंगा करी (Zinga Curry / Prawns Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 280, prepTime: 12 }, { name: 'Full', price: 380, prepTime: 18 }], prepTime: 15, isAvailable: true },
        { _id: 'm_cur_2', name: 'मुंडरी करी (Mundari Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 220, prepTime: 12 }, { name: 'Full', price: 320, prepTime: 18 }], prepTime: 15, isAvailable: true },
        { _id: 'm_cur_3', name: 'खिमा कलेजी करी (Kheema Kaleji Curry)', category: 'Curries', portionMode: 'Single', price: 390, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_cur_4', name: 'गास्लीक खिमा कलेजी (Gaslik Kheema Kaleji)', category: 'Curries', portionMode: 'Single', price: 410, variants: [], prepTime: 15, isAvailable: true },
        { _id: 'm_cur_5', name: 'खिमा मटन (Kheema Mutton)', category: 'Curries', portionMode: 'Single', price: 390, variants: [], prepTime: 18, isAvailable: true },
        { _id: 'm_cur_6', name: 'मटन करी (Mutton Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 280, prepTime: 15 }, { name: 'Full', price: 380, prepTime: 20 }], prepTime: 18, isAvailable: true },
        { _id: 'm_cur_7', name: 'गास्लीक मटन करी (Gaslik Mutton Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 300, prepTime: 15 }, { name: 'Full', price: 400, prepTime: 20 }], prepTime: 18, isAvailable: true },
        { _id: 'm_cur_8', name: 'चिकन करी (Chicken Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 280, prepTime: 12 }, { name: 'Full', price: 380, prepTime: 18 }], prepTime: 15, isAvailable: true },
        { _id: 'm_cur_9', name: 'गास्लीक चिकन करी (Gaslik Chicken Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 300, prepTime: 12 }, { name: 'Full', price: 400, prepTime: 18 }], prepTime: 15, isAvailable: true },
        { _id: 'm_cur_10', name: 'खुर करी (Khur Curry / Trotters Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 290, prepTime: 18 }, { name: 'Full', price: 400, prepTime: 25 }], prepTime: 20, isAvailable: true },
        { _id: 'm_cur_11', name: 'गास्लीक खुर करी (Gaslik Khur Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 300, prepTime: 18 }, { name: 'Full', price: 420, prepTime: 25 }], prepTime: 20, isAvailable: true },
        { _id: 'm_cur_12', name: 'कातीचा कोंबडा (Katicha Kombda)', category: 'Curries', portionMode: 'Single', price: 450, variants: [], prepTime: 18, isAvailable: true },
        { _id: 'm_cur_13', name: 'गास्लीक कातीचा कोंबडा (Gaslik Katicha Kombda)', category: 'Curries', portionMode: 'Single', price: 470, variants: [], prepTime: 18, isAvailable: true },
        { _id: 'm_cur_14', name: 'मसाला सावजी चिकन करी (Masala Saoji Chicken Curry)', category: 'Curries', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 220, prepTime: 12 }, { name: 'Full', price: 350, prepTime: 18 }], prepTime: 15, isAvailable: true },

        // 8. हांडी (Handi Dishes)
        { _id: 'm_handi_1', name: 'मटन हांडी (Mutton Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 650, prepTime: 20 }, { name: 'Full', price: 1200, prepTime: 30 }], prepTime: 25, isAvailable: true },
        { _id: 'm_handi_2', name: 'मटन हांडी सुखा (Mutton Handi Sukha)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 650, prepTime: 20 }, { name: 'Full', price: 1200, prepTime: 30 }], prepTime: 25, isAvailable: true },
        { _id: 'm_handi_3', name: 'चिकन हांडी (Chicken Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 650, prepTime: 18 }, { name: 'Full', price: 1200, prepTime: 28 }], prepTime: 22, isAvailable: true },
        { _id: 'm_handi_4', name: 'सुखा चिकन हांडी (Sukha Chicken Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 650, prepTime: 18 }, { name: 'Full', price: 1200, prepTime: 28 }], prepTime: 22, isAvailable: true },
        { _id: 'm_handi_5', name: 'खुर हांडी (Khur Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 700, prepTime: 22 }, { name: 'Full', price: 1300, prepTime: 35 }], prepTime: 30, isAvailable: true },
        { _id: 'm_handi_6', name: 'सुखा खुर हांडी (Sukha Khur Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 700, prepTime: 22 }, { name: 'Full', price: 1300, prepTime: 35 }], prepTime: 30, isAvailable: true },
        { _id: 'm_handi_7', name: 'कातीचा कोंबडा हांडी (Katicha Kombda Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 850, prepTime: 25 }, { name: 'Full', price: 1600, prepTime: 40 }], prepTime: 35, isAvailable: true },
        { _id: 'm_handi_8', name: 'सुखा कातीचा कोंबडा हांडी (Sukha Katicha Kombda Handi)', category: 'Handi Dishes', portionMode: 'Variant', price: 0, variants: [{ name: 'Half', price: 850, prepTime: 25 }, { name: 'Full', price: 1600, prepTime: 40 }], prepTime: 35, isAvailable: true }
      ];

      await MenuItem.insertMany(menuToSeed);
      console.log('Paunikar Saoji menu items seeded successfully!');
    }

    // 4. Seed Settings
    const settingsCount = await Settings.countDocuments();
    if (settingsCount === 0) {
      console.log('Seeding initial settings...');
      await Settings.create({
        _id: 'settings-main',
        restaurantName: 'Paunikar Saoji Family Restaurant',
        address: 'Nagpur, Maharashtra',
        upiId: 'restaurant@upi',
        zones: ['A', 'B', 'C'],
        mergedGroups: []
      });
      console.log('Settings seeded successfully!');
    }
  } catch (error) {
    console.error('Database seeding failed:', error.message);
  }
};

// Start Server & Connect Database
const PORT = process.env.PORT || 5000;

// Initialize seeding
seedDatabase().then(() => {
  if (!process.env.VERCEL) {
    server.listen(PORT, () => {
      console.log(`Express Server booted on port ${PORT}`);
    });
  }
});

export default app;
