require('dotenv').config();
const { PrismaClient } = require('./generated/prisma');
const { PrismaPg } = require('@prisma/adapter-pg');

const { recordQueryMetric } = require('./services/queryMonitor');

const connectionString = process.env.DATABASE_URL || "postgresql://postgres.tczepfidgmguskidbchs:BEwooBds0vsDeGDY@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";
const adapter = new PrismaPg({ connectionString });
const basePrisma = new PrismaClient({ adapter });

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const start = performance.now();
        try {
          const result = await query(args);
          const duration = performance.now() - start;
          recordQueryMetric(model, operation, duration, args);
          return result;
        } catch (error) {
          const duration = performance.now() - start;
          recordQueryMetric(model, operation, duration, args);
          throw error;
        }
      },
    },
  },
});

module.exports = prisma;