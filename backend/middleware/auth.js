const jwt    = require('jsonwebtoken');
const prisma = require('../prisma');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, isDeleted: true },
    });

    if (!user || user.isDeleted) {
      return res.status(401).json({ error: 'User account not found or deleted. Please log in again.' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;