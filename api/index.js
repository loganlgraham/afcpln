const app = require('../server/src/app');
const { connectDatabase } = require('../server/src/config/database');

let connectionPromise;

module.exports = async (req, res) => {
  if (!connectionPromise) {
    const uri = process.env.MONGODB_URI;
    connectionPromise = connectDatabase(uri).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  try {
    await connectionPromise;
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ message: 'Unable to connect to the database. Please verify configuration.' })
    );
    return;
  }

  return app(req, res);
};
