const express = require('express');
const { PrismaClient } = require('../prisma/generated/client1');
require('dotenv').config({ path: '../.env' });

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('PORT:', process.env.PORT);

// Connect to PostgreSQL using Prisma
async function connectToDatabase() {
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL');
  } catch (err) {
    console.error('Could not connect to PostgreSQL', err);
    process.exit(1);
  }
}

connectToDatabase();

// Auth routes
const authRoutes = require('./auth');
app.use('/auth', authRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).send("Sorry, that route doesn't exist.");
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
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