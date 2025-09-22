const ORIGINAL_ENV = process.env;

describe('resolveMongoUri', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MONGODB_DB;
    delete process.env.MONGO_DB;
    delete process.env.DB_NAME;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('appends the default database when the URI lacks one', () => {
    const { resolveMongoUri } = require('../config/database');
    const uri = 'mongodb+srv://example.mongodb.net/?retryWrites=true&w=majority';

    expect(resolveMongoUri(uri)).toBe(
      'mongodb+srv://example.mongodb.net/afcpln?retryWrites=true&w=majority'
    );
  });

  it('uses the configured database name override when provided', () => {
    process.env.MONGODB_DB = 'production-db';
    const { resolveMongoUri } = require('../config/database');
    const uri = 'mongodb+srv://example.mongodb.net/?retryWrites=true&w=majority';

    expect(resolveMongoUri(uri)).toBe(
      'mongodb+srv://example.mongodb.net/production-db?retryWrites=true&w=majority'
    );
  });

  it('leaves the URI unchanged when a database name is already present', () => {
    process.env.MONGODB_DB = 'ignored-db';
    const { resolveMongoUri } = require('../config/database');
    const uri = 'mongodb+srv://example.mongodb.net/custom-db?retryWrites=true&w=majority';

    expect(resolveMongoUri(uri)).toBe(uri);
  });
});
