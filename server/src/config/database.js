const mongoose = require('mongoose');

let connectionPromise = null;

async function connectDatabase(uri) {
  if (!uri) {
    throw new Error('Missing MongoDB connection string. Set the MONGODB_URI environment variable.');
  }

  if (!connectionPromise) {
    mongoose.set('strictQuery', true);
    connectionPromise = mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  }

  await connectionPromise;
  return mongoose.connection;
}

async function disconnectDatabase() {
  if (connectionPromise) {
    await mongoose.disconnect();
    connectionPromise = null;
  }
}

module.exports = {
  connectDatabase,
  disconnectDatabase
};
