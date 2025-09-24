const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const EmailLog = require('../models/EmailLog');

const fromAddress = process.env.EMAIL_FROM || 'no-reply@afcpln.local';

let transportMetadata = { type: 'json' };
let transporter;
let resendClient;

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const lowered = String(value).toLowerCase().trim();
  if (['true', '1', 'yes', 'y'].includes(lowered)) {
    return true;
  }

  if (['false', '0', 'no', 'n'].includes(lowered)) {
    return false;
  }

  return fallback;
}

function createTransport() {
  const explicitJson = (process.env.EMAIL_TRANSPORT || '').toLowerCase() === 'json';
  if (explicitJson) {
    transportMetadata = { type: 'json', reason: 'EMAIL_TRANSPORT=json' };
    return nodemailer.createTransport({ jsonTransport: true });
  }

  if (process.env.SMTP_URL) {
    transportMetadata = { type: 'smtp-url' };
    return nodemailer.createTransport(process.env.SMTP_URL);
  }

  if (process.env.SMTP_HOST) {
    const port = Number.parseInt(process.env.SMTP_PORT, 10) || 587;
    const secure = normalizeBool(process.env.SMTP_SECURE, port === 465);
    transportMetadata = {
      type: 'smtp',
      host: process.env.SMTP_HOST,
      port,
      secure
    };

    const auth = process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined;

    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth
    });
  }

  transportMetadata = { type: 'json' };
  return nodemailer.createTransport({ jsonTransport: true });
}

function initializeTransport() {
  if (process.env.RESEND_API_KEY) {
    try {
      resendClient = new Resend(process.env.RESEND_API_KEY);
      transportMetadata = { type: 'resend' };
      return;
    } catch (error) {
      console.error('Failed to initialize Resend email transport, falling back to Nodemailer', error);
    }
  }

  transporter = createTransport();
}

initializeTransport();

let loggedJsonTransportNotice = false;

function warnIfJsonTransport() {
  if (loggedJsonTransportNotice) {
    return;
  }

  if (transportMetadata.type === 'json' && process.env.NODE_ENV !== 'test') {
    console.warn(
      'Email transport is configured for JSON output. Set SMTP_URL or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS to send real emails.'
    );
  }

  loggedJsonTransportNotice = true;
}

function buildListingEmail({ user, listing, search }) {
  const subject = `New listing in ${listing.area} for your saved search "${search.name}"`;
  const address = `${listing.address.street}, ${listing.address.city}, ${listing.address.state} ${listing.address.postalCode}`;
  const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(listing.price);

  const lines = [
    `Hi ${user.fullName},`,
    '',
    `We found a new listing that matches your "${search.name}" saved search:`,
    `Title: ${listing.title}`,
    `Address: ${address}`,
    `Price: ${price}`,
    `Bedrooms: ${listing.bedrooms}`,
    `Bathrooms: ${listing.bathrooms}`,
    '',
    listing.description,
    '',
    'Log in to view more details in the Private Listing Network.'
  ];

  return {
    to: user.email,
    from: fromAddress,
    subject,
    text: lines.join('\n')
  };
}

function formatTransportResponse(data) {
  if (!data) {
    return undefined;
  }

  if (typeof data === 'string') {
    return data;
  }

  try {
    return JSON.stringify(data);
  } catch (error) {
    return String(data);
  }
}

async function deliverEmail(message) {
  if (transportMetadata.type === 'resend' && resendClient) {
    const result = await resendClient.emails.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text
    });

    if (result?.error) {
      const error = new Error(result.error.message || 'Failed to send email via Resend');
      error.cause = result.error;
      throw error;
    }

    return { provider: 'resend', id: result?.data?.id };
  }

  warnIfJsonTransport();
  const response = await transporter.sendMail(message);
  return { provider: transportMetadata.type, response };
}

async function sendListingMatchEmail(user, listing, search) {
  const message = buildListingEmail({ user, listing, search });
  const delivery = await deliverEmail(message);

  await EmailLog.create({
    user: user._id,
    listing: listing._id,
    searchName: search.name,
    to: message.to,
    subject: message.subject,
    body: message.text,
    transportResponse: formatTransportResponse(delivery)
  });
}

function buildRegistrationEmail(user) {
  const safeUser =
    user && typeof user.toObject === 'function' ? user.toObject({ virtuals: true }) : user;
  const fullName = safeUser?.fullName || safeUser?.email || 'there';
  const subject = 'Welcome to the AFC Private Listing Network';

  const lines = [
    `Hi ${fullName},`,
    '',
    'Thanks for joining the AFC Private Listing Network. Your account is ready to go.',
    'Log in anytime to explore private listings, manage saved searches, and connect with listing agents.',
    '',
    'If you did not create this account, please ignore this email.'
  ];

  return {
    to: safeUser?.email,
    from: fromAddress,
    subject,
    text: lines.join('\n')
  };
}

async function sendRegistrationEmail(user) {
  const message = buildRegistrationEmail(user);
  if (!message.to) {
    return;
  }

  await deliverEmail(message);
}

module.exports = {
  sendListingMatchEmail,
  sendRegistrationEmail
};
