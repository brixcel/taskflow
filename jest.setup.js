// Load .env before any test module imports prisma.js,
// so DATABASE_URL and JWT_SECRET are available when the
// PrismaPg adapter is constructed.
require('dotenv').config();
