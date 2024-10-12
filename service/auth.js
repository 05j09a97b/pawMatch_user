const express = require('express');
const { PrismaClient } = require('../prisma/generated/client1');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const prisma = new PrismaClient();

// Middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  console.log('Auth Header:', authHeader);
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    console.log('JWT Verify Error:', err);
    console.log('Decoded User:', user);
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Register user
router.post('/register', async (req, res) => {
  const { name, surname, displayName, email, telephoneNumber, lineId, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        name,
        surname,
        displayName,
        email,
        telephoneNumber,
        lineId,
        password: hashedPassword
      }
    });
    res.status(201).json({ message: 'User registered', userId: user.userId });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'P2002') {
      res.status(400).json({ message: 'Email already exists' });
    } else {
      res.status(500).json({ message: 'Error registering user' });
    }
  }
});

// Login User
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', email);

    const user = await prisma.user.findUnique({ where: { email } });
    console.log('User found:', user);

    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match:', isMatch);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET);
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User Profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: { userId: true, name: true, surname: true, displayName: true, email: true, telephoneNumber: true, lineId: true }
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update User Profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, surname, displayName, telephoneNumber, lineId } = req.body;
    const user = await prisma.user.update({
      where: { userId: req.user.userId },
      data: { name, surname, displayName, telephoneNumber, lineId },
      select: { userId: true, name: true, surname: true, displayName: true, email: true, telephoneNumber: true, lineId: true }
    });
    res.json(user);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete User Profile
router.delete('/profile', authenticateToken, async (req, res) => {
  try {
    await prisma.user.delete({ where: { userId: req.user.userId } });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;