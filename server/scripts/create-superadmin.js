/**
 * Create or update a SuperAdmin account directly in MongoDB.
 *
 * Bypasses POST /api/staff, which requires an already-authenticated
 * SuperAdmin/Manager token - i.e. it cannot bootstrap the first admin.
 *
 * Usage:
 *   node server/scripts/create-superadmin.js --name "Rugved" --username demo --password demo
 *
 * Options:
 *   --name       Display name                          (required unless the user exists)
 *   --username   Login username, stored lowercased    (required)
 *   --password   Plaintext password, bcrypt hashed    (required; under 6 chars only warns)
 *   --role       Defaults to SuperAdmin
 *   --zone       Defaults to All
 *   --salary     Defaults to 0
 *   --force      Reset the password if the username already exists
 *   --first-login
 *                Leave the account on the mandatory first-login password reset
 *                screen instead of logging straight in (off by default).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'force' || key === 'first-login') {
      args[key] = true;
    } else {
      args[key] = argv[i + 1];
      i += 1;
    }
  }
  return args;
};

const fail = (message) => {
  console.error(`\n[create-superadmin] ${message}\n`);
  process.exit(1);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const username = (args.username || '').trim().toLowerCase();
  const password = args.password;
  const name = (args.name || '').trim() || 'Super Admin';
  const role = args.role || 'SuperAdmin';
  const zone = args.zone || 'All';
  const salary = Number(args.salary) || 0;
  const isFirstLogin = Boolean(args['first-login']);

  if (!username || !password) {
    fail('Missing --username and/or --password. See the header of this file for usage.');
  }
  if (password.length < 6) {
    console.warn(
      `\n[create-superadmin] WARNING: "${password}" is under 6 characters. The app only enforces the\n` +
        '[create-superadmin] 6-character minimum on self-service password changes, so this login works -\n' +
        '[create-superadmin] but treat the account as a throwaway/demo credential.\n'
    );
  }

  const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    fail('MONGO_URI / DATABASE_URL is not set. Add it to .env before running this script.');
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    dbName: process.env.MONGO_DB_NAME || undefined
  });

  const existing = await User.findOne({ username });

  if (existing && !args.force) {
    console.log(`\n[create-superadmin] "${username}" already exists (${existing.name}, ${existing.role}).`);
    console.log('[create-superadmin] Re-run with --force to reset the password.\n');
  } else {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (existing) {
      existing.name = name;
      existing.password = hashedPassword;
      existing.role = role;
      existing.zone = zone;
      existing.salary = salary;
      existing.status = 'Active';
      existing.isFirstLogin = isFirstLogin;
      await existing.save();
    } else {
      await User.create({
        name,
        username,
        password: hashedPassword,
        role,
        status: 'Active',
        zone,
        salary,
        performance: 5,
        overtimeHours: 0,
        isFirstLogin
      });
    }

    console.log(`\n[create-superadmin] ${existing ? 'Updated' : 'Created'} ${role} "${name}"`);
    console.log(`[create-superadmin] username: ${username}`);
    console.log(`[create-superadmin] first-login reset screen: ${isFirstLogin ? 'on' : 'off'}\n`);
  }

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error('\n[create-superadmin] Failed:', error.message, '\n');
  mongoose.disconnect().finally(() => process.exit(1));
});