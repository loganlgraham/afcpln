const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const EmailLog = require('../models/EmailLog');

const brandName =
  typeof process.env.EMAIL_FROM_NAME === 'string' && process.env.EMAIL_FROM_NAME.trim()
    ? process.env.EMAIL_FROM_NAME.trim()
    : 'AFC Private Listings';

const hasResendConfigured = Boolean(process.env.RESEND_API_KEY);

const resendDomain =
  typeof process.env.RESEND_DOMAIN === 'string' && process.env.RESEND_DOMAIN.trim()
    ? process.env.RESEND_DOMAIN.trim()
    : '';

const fromAddress = resolveFromAddress();

let activeTransport = { type: 'json' };
let transporter;
let resendClient;
let fallbackTransport;
let fallbackMetadata;

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

function formatSenderAddress(value) {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('<') && trimmed.includes('>')) {
    return trimmed;
  }

  return `${brandName} <${trimmed}>`;
}

function pickFirstSender(candidates = []) {
  for (const candidate of candidates) {
    const formatted = formatSenderAddress(candidate);
    if (formatted) {
      return formatted;
    }
  }

  return null;
}

function resolveFromAddress() {
  const explicit = pickFirstSender([
    process.env.EMAIL_FROM,
    process.env.RESEND_FROM,
    process.env.RESEND_FROM_EMAIL,
    process.env.RESEND_SENDER,
    process.env.RESEND_FROM_ADDRESS
  ]);

  if (explicit) {
    return explicit;
  }

  if (resendDomain) {
    const domainBased = pickFirstSender([`hello@${resendDomain}`, `no-reply@${resendDomain}`]);
    if (domainBased) {
      return domainBased;
    }
  }

  if (hasResendConfigured) {
    return formatSenderAddress('onboarding@resend.dev');
  }

  return formatSenderAddress('no-reply@afcpln.local');
}

function createNodemailerTransport() {
  const explicitJson = (process.env.EMAIL_TRANSPORT || '').toLowerCase() === 'json';
  if (explicitJson) {
    return {
      transporter: nodemailer.createTransport({ jsonTransport: true }),
      metadata: { type: 'json', reason: 'EMAIL_TRANSPORT=json' }
    };
  }

  if (process.env.SMTP_URL) {
    return {
      transporter: nodemailer.createTransport(process.env.SMTP_URL),
      metadata: { type: 'smtp-url' }
    };
  }

  if (process.env.SMTP_HOST) {
    const port = Number.parseInt(process.env.SMTP_PORT, 10) || 587;
    const secure = normalizeBool(process.env.SMTP_SECURE, port === 465);
    const auth = process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined;

    return {
      transporter: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth
      }),
      metadata: {
        type: 'smtp',
        host: process.env.SMTP_HOST,
        port,
        secure
      }
    };
  }

  return {
    transporter: nodemailer.createTransport({ jsonTransport: true }),
    metadata: { type: 'json' }
  };
}

function initializeTransport() {
  if (hasResendConfigured) {
    try {
      resendClient = new Resend(process.env.RESEND_API_KEY);
      activeTransport = { type: 'resend' };
      return;
    } catch (error) {
      console.error('Failed to initialize Resend email transport, falling back to Nodemailer', error);
    }
  }

  const nodemailerTransport = createNodemailerTransport();
  transporter = nodemailerTransport.transporter;
  activeTransport = nodemailerTransport.metadata;
}

function ensureFallbackTransport() {
  if (fallbackTransport && fallbackMetadata) {
    return { transporter: fallbackTransport, metadata: fallbackMetadata };
  }

  const nodemailerTransport = createNodemailerTransport();
  fallbackTransport = nodemailerTransport.transporter;
  fallbackMetadata = nodemailerTransport.metadata;
  return { transporter: fallbackTransport, metadata: fallbackMetadata };
}

initializeTransport();

let loggedJsonTransportNotice = false;

function warnIfJsonTransport(metadata = activeTransport) {
  if (loggedJsonTransportNotice) {
    return;
  }

  if (metadata && metadata.type === 'json' && process.env.NODE_ENV !== 'test') {
    console.warn(
      'Email transport is configured for JSON output. Set SMTP_URL or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS to send real emails.'
    );
    loggedJsonTransportNotice = true;
  }
}

function extractErrorMessage(error) {
  if (!error) {
    return '';
  }

  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  if (error.response && error.response.body && typeof error.response.body.message === 'string') {
    return error.response.body.message;
  }

  if (error.cause) {
    return extractErrorMessage(error.cause);
  }

  return '';
}

function interpretResendError(error) {
  const message = extractErrorMessage(error);
  const statusCode =
    (error && error.statusCode) || (error && error.cause && error.cause.statusCode) || undefined;

  if (statusCode === 403 || /verify a domain/i.test(message) || /not authorized/i.test(message)) {
    return 'Resend rejected the sender address. Verify your domain in Resend and set EMAIL_FROM to an address on that domain.';
  }

  if (message) {
    return message;
  }

  return 'Failed to send email via Resend.';
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
  if (activeTransport.type === 'resend' && resendClient) {
    try {
      const result = await resendClient.emails.send({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text
      });

      if (result && result.error) {
        const resendError = new Error(result.error.message || 'Failed to send email via Resend');
        resendError.cause = result.error;
        resendError.statusCode = result.error.statusCode;
        throw resendError;
      }

      return { provider: 'resend', id: result && result.data ? result.data.id : undefined };
    } catch (error) {
      const fallback = ensureFallbackTransport();
      const friendlyMessage = interpretResendError(error);

      if (process.env.NODE_ENV !== 'test') {
        console.warn(
          `Resend delivery failed${friendlyMessage ? ` (${friendlyMessage})` : ''}. Falling back to ${fallback.metadata.type} transport.`
        );
      }

      warnIfJsonTransport(fallback.metadata);
      const response = await fallback.transporter.sendMail(message);
      return {
        provider: `resend-fallback:${fallback.metadata.type}`,
        response,
        error: friendlyMessage
      };
    }
  }

  if (!transporter) {
    const fallback = ensureFallbackTransport();
    transporter = fallback.transporter;
    activeTransport = fallback.metadata;
  }

  warnIfJsonTransport(activeTransport);
  const response = await transporter.sendMail(message);
  return { provider: activeTransport.type, response };
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

