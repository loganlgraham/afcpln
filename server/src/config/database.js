const mongoose = require('mongoose');

let connectionPromise = null;

function getConfiguredDatabaseName() {
  const candidates = [
    process.env.MONGODB_DB,
    process.env.MONGO_DB,
    process.env.DB_NAME,
    'afcpln'
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();

      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return 'afcpln';
}

function appendDatabaseIfMissing(connectionString, databaseName) {
  if (!databaseName) {
    return connectionString;
  }

  try {
    const parsed = new URL(connectionString);
    const pathname = (parsed.pathname || '').replace(/^\//, '');

    if (!pathname) {
      parsed.pathname = `/${databaseName}`;
      return parsed.toString();
    }

    return connectionString;
  } catch (error) {
    const [base, query] = connectionString.split('?');

    if (/\/[^/]+$/.test(base)) {
      return connectionString;
    }

    const baseWithSlash = base.endsWith('/') ? base : `${base}/`;
    const querySuffix = query ? `?${query}` : '';

    return `${baseWithSlash}${databaseName}${querySuffix}`;
  }
}

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

  const databaseName = getConfiguredDatabaseName();
  return appendDatabaseIfMissing(resolvedUri, databaseName);
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
