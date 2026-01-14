const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

/* -----------------------------------------
   ✅ CORS CONFIG (Frontend + Local)
------------------------------------------- */
app.use(
  cors({
    origin: [
      'https://inventory-system-seven-alpha.vercel.app', // PRODUCTION FRONTEND
      'http://localhost:5173', // Vite Local
      'http://localhost:3000', // React Local
      'http://localhost:5000'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  })
);

// Parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* -----------------------------------------
   ✅ Connect MongoDB Atlas
------------------------------------------- */
mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  })
  .then(() => {
    console.log('✅ MongoDB Atlas connected');
    console.log('📊 Database:', mongoose.connection.db.databaseName);
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    console.error('❌ Connection error details:', err);
  });

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

/* -----------------------------------------
   ✅ Root route
------------------------------------------- */
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Backend is live and working!',
    time: new Date(),
    health: 'All systems functional',
    backend: 'Vercel Serverless',
  });
});

/* -----------------------------------------
   ✅ Test route (without /api prefix for Vercel)
------------------------------------------- */
app.get('/test', (req, res) => {
  res.json({
    message: 'Backend test API is running!',
    timestamp: new Date(),
    endpoints: ['/api/items', '/api/income', '/api/slips', '/api/analytics'],
    backend: 'Vercel Serverless',
  });
});

/* -----------------------------------------
   ✅ Test route with /api prefix (for compatibility)
------------------------------------------- */
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Backend test API is running!',
    timestamp: new Date(),
    endpoints: ['/api/items', '/api/income', '/api/slips', '/api/analytics'],
    backend: 'Vercel Serverless',
  });
});

/* -----------------------------------------
   ✅ Import routes
------------------------------------------- */
app.use('/api/items', require('../routes/items'));
app.use('/api/income', require('../routes/income'));
app.use('/api/slips', require('../routes/slips'));
app.use('/api/analytics', require('../routes/analytics'));
app.use('/api/history', require('../routes/history'));
app.use('/api/customer-history', require('../routes/customerHistory'));

/* -----------------------------------------
   ✅ 404 Handler (MUST BE LAST)
------------------------------------------- */
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    requestedUrl: req.originalUrl,
  });
});

// Export the Express app for Vercel (Vercel handles Express apps automatically)
module.exports = app;

