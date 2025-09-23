const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0';

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const MAX_BODY_SIZE = 15 * 1024 * 1024; // 15 MB allows reasonable photo uploads
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB limit for uploaded photos

async function ensureDirectoryExists(dirPath) {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function ensureFileExists(filePath, defaultContent) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fsp.writeFile(filePath, defaultContent, 'utf8');
    } else {
      throw error;
    }
  }
}

async function bootstrap() {
  await ensureDirectoryExists(DATA_DIR);
  await ensureDirectoryExists(UPLOADS_DIR);
  await ensureFileExists(LISTINGS_FILE, '[]\n');
  await ensureFileExists(USERS_FILE, '[]\n');
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function serveStatic(res, filePath) {
  try {
    const resolvedPath = path.normalize(filePath);
    if (!resolvedPath.startsWith(PUBLIC_DIR) && !resolvedPath.startsWith(UPLOADS_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const data = await fsp.readFile(resolvedPath);
    res.writeHead(200, {
      'Content-Type': getMimeType(resolvedPath),
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    console.error('Static file error:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    req.on('data', chunk => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_SIZE) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', reject);
  });
}

function sanitizeFileName(originalName) {
  const fallback = 'property-photo';
  if (!originalName || typeof originalName !== 'string') {
    return fallback;
  }
  return originalName.replace(/[^a-zA-Z0-9_.-]/g, '_') || fallback;
}

function guessExtensionFromMime(mimeType) {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}

async function savePhoto(photo) {
  if (!photo || typeof photo !== 'object') {
    return null;
  }

  const { data, filename, contentType } = photo;
  if (!data || typeof data !== 'string') {
    return null;
  }

  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) {
    return null;
  }

  if (buffer.length > MAX_PHOTO_SIZE) {
    throw new Error('Photo exceeds the 10MB upload limit.');
  }

  const safeOriginalName = sanitizeFileName(filename);
  const extension = path.extname(safeOriginalName) || guessExtensionFromMime(contentType);
  const uniqueName = `${crypto.randomUUID()}${extension || '.bin'}`;
  const targetPath = path.join(UPLOADS_DIR, uniqueName);

  await fsp.writeFile(targetPath, buffer);
  return `/uploads/${uniqueName}`;
}

async function readJsonArray(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8');
  if (!raw.trim()) {
    return [];
  }
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`Failed to parse JSON from ${filePath}:`, error);
    return [];
  }
}

async function writeJsonArray(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  await fsp.writeFile(filePath, `${json}\n`, 'utf8');
}

function normaliseText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normaliseState(value) {
  return normaliseText(value).toUpperCase();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function handleListProperty(req, res) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch (error) {
    sendError(res, 400, error.message);
    return;
  }

  const title = normaliseText(body.title);
  const area = normaliseText(body.area);
  const city = normaliseText(body.city);
  const state = normaliseState(body.state);
  const description = normaliseText(body.description);

  const price = toNumber(body.price);
  const bedrooms = toNumber(body.bedrooms);
  const bathrooms = toNumber(body.bathrooms);
  const squareFeet = toNumber(body.squareFeet);

  if (!title || !area || !city || !state) {
    sendError(res, 400, 'Title, area, city, and state are required.');
    return;
  }

  if (price === null || price < 0) {
    sendError(res, 400, 'Price must be a positive number.');
    return;
  }

  if (bedrooms !== null && bedrooms < 0) {
    sendError(res, 400, 'Bedrooms cannot be negative.');
    return;
  }

  if (bathrooms !== null && bathrooms < 0) {
    sendError(res, 400, 'Bathrooms cannot be negative.');
    return;
  }

  if (squareFeet !== null && squareFeet < 0) {
    sendError(res, 400, 'Square footage cannot be negative.');
    return;
  }

  let photoUrl = null;
  try {
    photoUrl = await savePhoto(body.photo);
  } catch (error) {
    console.error('Photo upload failed:', error);
    const message = error instanceof Error && error.message ? error.message : 'Photo upload failed. Please try again.';
    sendError(res, 422, message);
    return;
  }

  const listing = {
    id: crypto.randomUUID(),
    title,
    area,
    city,
    state,
    description,
    price,
    bedrooms,
    bathrooms,
    squareFeet,
    photoUrl,
    createdAt: new Date().toISOString()
  };

  const listings = await readJsonArray(LISTINGS_FILE);
  listings.unshift(listing);
  await writeJsonArray(LISTINGS_FILE, listings);

  sendJson(res, 201, {
    message: 'Property listed successfully.',
    listing
  });
}

function matchesText(haystack, needle) {
  if (!needle) {
    return true;
  }
  if (!haystack) {
    return false;
  }
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function matchesNumber(value, expected) {
  if (expected === null || expected === undefined || expected === '') {
    return true;
  }
  if (value === null || value === undefined) {
    return false;
  }
  return Number(value) === Number(expected);
}

function withinRange(value, min, max) {
  if (value === null || value === undefined) {
    return false;
  }
  const numericValue = Number(value);
  if (Number.isFinite(min) && numericValue < min) {
    return false;
  }
  if (Number.isFinite(max) && numericValue > max) {
    return false;
  }
  return true;
}

async function handleSearchListings(req, res) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch (error) {
    sendError(res, 400, error.message);
    return;
  }

  const area = normaliseText(body.area);
  const city = normaliseText(body.city);
  const state = normaliseState(body.state);
  const minPrice = toNumber(body.minPrice);
  const maxPrice = toNumber(body.maxPrice);
  const bedrooms = toNumber(body.bedrooms);
  const bathrooms = toNumber(body.bathrooms);

  const listings = await readJsonArray(LISTINGS_FILE);

  const results = listings.filter(listing => {
    if (!matchesText(listing.area, area)) {
      return false;
    }
    if (!matchesText(listing.city, city)) {
      return false;
    }
    if (state && listing.state !== state) {
      return false;
    }
    if (minPrice !== null || maxPrice !== null) {
      if (!withinRange(listing.price, minPrice ?? -Infinity, maxPrice ?? Infinity)) {
        return false;
      }
    }
    if (!matchesNumber(listing.bedrooms, bedrooms)) {
      return false;
    }
    if (!matchesNumber(listing.bathrooms, bathrooms)) {
      return false;
    }
    return true;
  });

  sendJson(res, 200, { results });
}

function isValidEmail(email) {
  return /.+@.+\..+/.test(email);
}

async function handleRegister(req, res) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch (error) {
    sendError(res, 400, error.message);
    return;
  }

  const name = normaliseText(body.name);
  const email = normaliseText(body.email).toLowerCase();
  const password = body.password ? String(body.password) : '';
  const persona = body.persona === 'agent' ? 'agent' : 'buyer';

  if (!name) {
    sendError(res, 400, 'Name is required.');
    return;
  }

  if (!email || !isValidEmail(email)) {
    sendError(res, 400, 'A valid email address is required.');
    return;
  }

  if (password.length < 8) {
    sendError(res, 400, 'Password must be at least 8 characters long.');
    return;
  }

  const users = await readJsonArray(USERS_FILE);
  const existing = users.find(user => user.email === email);
  if (existing) {
    sendError(res, 409, 'That email address is already registered.');
    return;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');

  const userRecord = {
    id: crypto.randomUUID(),
    name,
    email,
    persona,
    passwordHash,
    salt,
    createdAt: new Date().toISOString()
  };

  try {
    await sendConfirmationEmail(userRecord);
  } catch (error) {
    console.error('Confirmation email failed:', error);
    sendError(res, 502, 'Registration could not be completed because the confirmation email failed to send. Please try again later.');
    return;
  }

  users.push(userRecord);
  await writeJsonArray(USERS_FILE, users);

  sendJson(res, 201, {
    message: 'Registration successful! A confirmation email is on its way.',
    user: {
      id: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      persona: userRecord.persona,
      createdAt: userRecord.createdAt
    }
  });
}

function buildWelcomeEmailHtml(name, persona) {
  const safeName = name || 'there';
  const personaDescriptor = persona === 'agent' ? 'listing agent' : 'buyer';
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Welcome to AFC Private Listing Network</title>
  </head>
  <body style="font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background-color: #f5f7fb;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f7fb; padding: 32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 12px 48px rgba(15, 23, 42, 0.12);">
            <tr>
              <td>
                <h1 style="margin-top: 0; color: #1f2937; font-size: 24px;">Welcome to the AFC Private Listing Network</h1>
                <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
                  Hi ${safeName},<br /><br />
                  Thank you for joining the AFC Private Listing Network as a ${personaDescriptor}. Your account is now active and you'll start receiving updates on new off-market opportunities tailored to your preferences.
                </p>
                <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
                  To get started, log in to your dashboard, set up your saved searches, and feel free to list your own properties.
                </p>
                <p style="margin: 24px 0;">
                  <a href="https://afcpln.example.com" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">Go to Dashboard</a>
                </p>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.4;">
                  If you did not create this account, please contact our support team immediately so we can help secure your information.
                </p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
                <p style="color: #9ca3af; font-size: 12px;">
                  AFC Private Listing Network &bull; Minneapolis, MN
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendConfirmationEmail(user) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not configured.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'AFC Private Listings <noreply@afcpln.local>',
      to: [user.email],
      subject: 'Welcome to the AFC Private Listing Network',
      html: buildWelcomeEmailHtml(user.name, user.persona)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API responded with ${response.status}: ${errorText}`);
  }
}

function handleOptions(req, res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  });
  res.end();
}

async function router(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    handleOptions(req, res);
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'GET' && pathname === '/api/listings') {
    const listings = await readJsonArray(LISTINGS_FILE);
    sendJson(res, 200, { listings });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/listings') {
    await handleListProperty(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/listings/search') {
    await handleSearchListings(req, res);
    return;
  }

  if (req.method === 'POST' && (pathname === '/api/register' || pathname === '/api/register/')) {
    await handleRegister(req, res);
    return;
  }

  if (req.method === 'GET' && pathname === '/') {
    await serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/uploads/')) {
    const relative = pathname.slice('/uploads/'.length);
    const filePath = path.join(UPLOADS_DIR, relative);
    await serveStatic(res, filePath);
    return;
  }

  if (req.method === 'GET') {
    const relative = pathname.replace(/^\//, '');
    const staticPath = path.join(PUBLIC_DIR, relative);
    await serveStatic(res, staticPath);
    return;
  }

  sendError(res, 404, 'Route not found.');
}

const server = http.createServer((req, res) => {
  router(req, res).catch(error => {
    console.error('Unhandled error:', error);
    if (!res.headersSent) {
      sendError(res, 500, 'Unexpected server error.');
    } else {
      res.end();
    }
  });
});

bootstrap()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Server listening on http://${HOST}:${PORT}`);
    });
  })
  .catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
