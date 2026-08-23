import 'dotenv/config';
import mongoose from 'mongoose';

/**
 * Database connection - MongoDB via Mongoose.
 *
 * Connection string resolution order:
 *   1. MONGO_URI
 *   2. DATABASE_URL (kept for backward compatibility with the old Prisma setup)
 */
const uri = process.env.MONGO_URI || process.env.DATABASE_URL;

if (!uri) {
  console.error('[DB] Missing MONGO_URI / DATABASE_URL environment variable.');
}

// Expose documents through their business id (`id` virtual mirrors _id),
// matching the shape the old Prisma client produced.
mongoose.set('toJSON', { virtuals: true });
mongoose.set('toObject', { virtuals: true });

let connectPromise = null;

const connectDatabase = () => {
  if (!uri) {
    return Promise.reject(new Error(
      'MONGO_URI is not set. Add it to Vercel Project Settings -> Environment Variables.'
    ));
  }
  if (!connectPromise) {
    connectPromise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        dbName: process.env.MONGO_DB_NAME || undefined
      })
      .catch((err) => {
        // Do not cache failures - let the next serverless invocation retry.
        connectPromise = null;
        throw err;
      });
  }
  return connectPromise;
};

mongoose.connection.on('connected', () => {
  console.log(`[DB] MongoDB connected: ${mongoose.connection.name} @ ${mongoose.connection.host}`);
});

mongoose.connection.on('error', (err) => {
  console.error('[DB] MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[DB] MongoDB disconnected.');
});

export const isDbConnected = () => mongoose.connection.readyState === 1;

export const pingDatabase = async () => {
  await connectDatabase();
  await mongoose.connection.db.admin().command({ ping: 1 });
};

// Connect immediately on import (matches previous Prisma behaviour where the
// client was ready as soon as the module was loaded).
connectDatabase().catch((err) => {
  console.error('[DB] Initial MongoDB connection failed:', err.message);
});

export default mongoose;
