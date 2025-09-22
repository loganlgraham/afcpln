const mongoose = require('mongoose');

let connectionPromise = null;

function resolveMongoUri(uri) {
  const resolvedUri =
    uri ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    process.env.DATABASE_URL ||
    'mongodb://127.0.0.1:27017/afcpln';

  if (!resolvedUri) {
    throw new Error('Missing MongoDB connection string. Set the MONGODB_URI environment variable.');
  }

  return resolvedUri;
}

async function connectDatabase(uri) {
  const mongoUri = resolveMongoUri(uri);

  if (!connectionPromise || mongoose.connection.readyState === 0) {
    mongoose.set('strictQuery', true);
    connectionPromise = mongoose.connect(mongoUri, {
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
  disconnectDatabase,
  resolveMongoUri
};
