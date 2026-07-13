import 'dotenv/config';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// Single global PrismaClient instance configured for Prisma Postgres with driver adapter
const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

export default prisma;
