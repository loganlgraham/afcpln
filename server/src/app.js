const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const conversationRoutes = require('./routes/conversations');
const userRoutes = require('./routes/users');

const app = express();

const payloadLimit = process.env.REQUEST_PAYLOAD_LIMIT || '15mb';

app.use(cors());
app.use(express.json({ limit: payloadLimit }));
app.use(express.urlencoded({ extended: true, limit: payloadLimit }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/users', userRoutes);

const clientDir = path.resolve(__dirname, '..', '..', 'client');
if (process.env.SERVE_CLIENT !== 'false' && fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }

    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ message: 'Resource not found.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'An unexpected error occurred.' });
});

module.exports = app;
