require('dotenv').config();
const http = require('http');

const app = require('./app');
const { connectDatabase } = require('./config/database');

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/afcpln';

async function start() {
  try {
    await connectDatabase(MONGODB_URI);
    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`API server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
}

start();
