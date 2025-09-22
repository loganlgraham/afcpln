const DEFAULT_JWT_SECRET = 'afcpln-development-secret';

let warned = false;

function getJwtSecret() {
  const configured = process.env.JWT_SECRET;

  if (configured && configured.trim().length > 0) {
    return configured;
  }

  if (!warned) {
    warned = true;
    console.warn(
      'JWT_SECRET is not set. Using the built-in development secret. ' +
        'Set JWT_SECRET to a strong value in production.'
    );
  }

  return DEFAULT_JWT_SECRET;
}

module.exports = {
  getJwtSecret
};
