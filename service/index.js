const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('../prisma/generated/client1');
const authRoutes = require('./auth');
const fileUpload = require('express-fileupload');
require('dotenv').config({ path: '../.env' });

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: '/tmp/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  abortOnLimit: true,
  debug: true
}));

// Logging
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('PORT:', process.env.PORT);

// Routes
app.use('/auth', authRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('Welcome to the User Service API');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    message: 'Something went wrong!',
    error: err.message
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ message: "Sorry, that route doesn't exist." });
});



// Start server
const port = process.env.PORT || 3000;
const server = app.listen(port, async () => {
  await prisma.$connect();
  console.log(`Server running on port ${port}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;