const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const EmailLog = require('../models/EmailLog');
const User = require('../models/User');

const DEFAULT_RESEND_DOMAIN = 'lgweb.app';
let activeTransport = { type: 'json' };
let transporter;
let resendClient;
let fallbackTransport;
let fallbackMetadata;
let cachedResendKey;

function getBrandName() {
  if (typeof process.env.EMAIL_FROM_NAME === 'string' && process.env.EMAIL_FROM_NAME.trim()) {
    return process.env.EMAIL_FROM_NAME.trim();
  }

  return 'AFC Private Listings';
}

function getResendApiKey() {
  if (typeof process.env.RESEND_API_KEY !== 'string') {
    return null;
  }

  const trimmed = process.env.RESEND_API_KEY.trim();
  return trimmed ? trimmed : null;
}

function hasResendConfigured() {
  return Boolean(getResendApiKey());
}

function getResendDomain() {
  if (typeof process.env.RESEND_DOMAIN === 'string' && process.env.RESEND_DOMAIN.trim()) {
    return process.env.RESEND_DOMAIN.trim();
  }

  return hasResendConfigured() ? DEFAULT_RESEND_DOMAIN : '';
}

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

function formatSenderAddress(value, options = {}) {
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

  const explicitDisplayName = Object.prototype.hasOwnProperty.call(options, 'displayName')
    ? options.displayName
    : undefined;

  let resolvedDisplayName;
  if (explicitDisplayName === undefined) {
    resolvedDisplayName = getBrandName();
  } else if (typeof explicitDisplayName === 'string') {
    resolvedDisplayName = explicitDisplayName.trim();
  } else {
    resolvedDisplayName = null;
  }

  if (!resolvedDisplayName) {
    return trimmed;
  }

  return `${resolvedDisplayName} <${trimmed}>`;
}

function pickFirstSender(candidates = [], options = {}) {
  for (const candidate of candidates) {
    const formatted = formatSenderAddress(candidate, options);
    if (formatted) {
      return formatted;
    }
  }

  return null;
}

function resolveFromAddress() {
  const explicit = pickFirstSender(
    [
      process.env.EMAIL_FROM,
      process.env.RESEND_FROM,
      process.env.RESEND_FROM_EMAIL,
      process.env.RESEND_SENDER,
      process.env.RESEND_FROM_ADDRESS
    ],
    { displayName: process.env.EMAIL_FROM_NAME }
  );

  if (explicit) {
    return explicit;
  }

  const domain = getResendDomain();
  if (domain) {
    const domainBased = pickFirstSender(
      [`hello@${domain}`, `no-reply@${domain}`],
      { displayName: getBrandName() }
    );
    if (domainBased) {
      return domainBased;
    }
  }

  const fallbackSender = formatSenderAddress('hello@lgweb.app', { displayName: getBrandName() });
  return fallbackSender || 'hello@lgweb.app';
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

function refreshActiveTransport() {
  const resendKey = getResendApiKey();

  if (resendKey) {
    if (!resendClient || cachedResendKey !== resendKey) {
      try {
        resendClient = new Resend(resendKey);
        cachedResendKey = resendKey;
      } catch (error) {
        console.error('Failed to initialize Resend email transport, falling back to Nodemailer', error);
        resendClient = null;
        cachedResendKey = null;
      }
    }

    if (resendClient) {
      activeTransport = { type: 'resend' };
      transporter = null;
      return;
    }
  } else {
    resendClient = null;
    cachedResendKey = null;
  }

  if (!transporter || activeTransport.type === 'resend') {
    const nodemailerTransport = createNodemailerTransport();
    transporter = nodemailerTransport.transporter;
    activeTransport = nodemailerTransport.metadata;
  }
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

refreshActiveTransport();

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

  const description = listing.description || '';

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
    description,
    '',
    'Log in to view more details in the Private Listing Network.'
  ];

  const htmlLines = [
    `<p>Hi ${user.fullName},</p>`,
    `<p>We found a new listing that matches your "${search.name}" saved search:</p>`,
    '<ul style="margin:0 0 1rem 1.5rem;">',
    `<li><strong>Title:</strong> ${listing.title}</li>`,
    `<li><strong>Address:</strong> ${address}</li>`,
    `<li><strong>Price:</strong> ${price}</li>`,
    `<li><strong>Bedrooms:</strong> ${listing.bedrooms}</li>`,
    `<li><strong>Bathrooms:</strong> ${listing.bathrooms}</li>`,
    '</ul>',
    `<p>${description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
    '<p>Log in to view more details in the Private Listing Network.</p>'
  ];

  return {
    to: user.email,
    from: resolveFromAddress(),
    subject,
    text: lines.join('\n'),
    html: htmlLines.join('')
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
  refreshActiveTransport();

  if (activeTransport.type === 'resend' && resendClient) {
    try {
      const result = await resendClient.emails.send({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html
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
  const escapedFullName = fullName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const subject = 'Welcome to the AFC Private Listing Network';

  const lines = [
    `Hi ${fullName},`,
    '',
    'Thanks for joining the AFC Private Listing Network. Your account is ready to go.',
    'Log in anytime to explore private listings, manage saved searches, and connect with listing agents.',
    '',
    'If you did not create this account, please ignore this email.'
  ];

  const htmlLines = [
    `<p>Hi ${escapedFullName},</p>`,
    '<p>Thanks for joining the AFC Private Listing Network. Your account is ready to go.</p>',
    '<p>Log in anytime to explore private listings, manage saved searches, and connect with listing agents.</p>',
    '<p>If you did not create this account, please ignore this email.</p>'
  ];

  return {
    to: safeUser?.email,
    from: resolveFromAddress(),
    subject,
    text: lines.join('\n'),
    html: htmlLines.join('')
  };
}

async function sendRegistrationEmail(user) {
  const message = buildRegistrationEmail(user);
  if (!message.to) {
    return;
  }

  await deliverEmail(message);
}

function resolveId(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    if (value._id) {
      return resolveId(value._id);
    }

    if (value.id) {
      return resolveId(value.id);
    }

    if (typeof value.toString === 'function' && value.toString() !== '[object Object]') {
      return value.toString();
    }
  }

  return String(value);
}

function normalizeParticipant(participant) {
  if (!participant) {
    return { _id: null, fullName: '', email: '', role: '' };
  }

  return {
    _id: resolveId(participant._id || participant.id || participant),
    fullName: participant.fullName || '',
    email: participant.email || '',
    role: participant.role || ''
  };
}

async function hydrateParticipant(participant) {
  const normalized = normalizeParticipant(participant);

  if (!normalized._id) {
    return normalized;
  }

  if (normalized.email) {
    return normalized;
  }

  try {
    const user = await User.findById(normalized._id).select('fullName email role');

    if (user) {
      return {
        _id: user._id?.toString?.() || normalized._id,
        fullName: user.fullName || normalized.fullName,
        email: user.email || normalized.email,
        role: user.role || normalized.role
      };
    }
  } catch (error) {
    console.error('Failed to hydrate conversation participant for email notification', error);
  }

  return normalized;
}

function formatListingLocation(listing) {
  if (!listing) {
    return '';
  }

  const parts = [];
  if (listing.area) {
    parts.push(listing.area);
  }

  const cityState = [listing.address?.city, listing.address?.state].filter(Boolean).join(', ');
  if (cityState) {
    parts.push(cityState);
  }

  return parts.join(' • ');
}

function buildConversationNotificationEmail({ recipient, sender, listing, message }) {
  if (!recipient?.email) {
    return null;
  }

  const listingTitle = listing?.title || 'your listing';
  const location = formatListingLocation(listing);
  const recipientName = recipient.fullName || 'there';
  const senderName = sender.fullName || (sender.role === 'agent' ? 'the listing agent' : 'the buyer');
  const escapedRecipientName = recipientName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const subject = senderName
    ? `New message from ${senderName} about ${listingTitle}`
    : `New message about ${listingTitle}`;

  const lines = [
    `Hi ${recipientName},`,
    '',
    senderName
      ? `${senderName} just sent you a new message about ${listingTitle}.`
      : `You have a new message about ${listingTitle}.`
  ];

  if (location) {
    lines.push(location, '');
  } else {
    lines.push('');
  }

  if (message) {
    lines.push(message, '');
  }

  lines.push(
    'Log in to the AFC Private Listing Network to reply and keep the conversation going.',
    '',
    '— AFC Private Listings'
  );

  const paragraphs = [`<p>Hi ${escapedRecipientName},</p>`];
  const introCopy = senderName
    ? `${senderName} just sent you a new message about ${listingTitle}.`
    : `You have a new message about ${listingTitle}.`;
  const escapedIntro = introCopy.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  paragraphs.push(`<p>${escapedIntro}</p>`);

  if (location) {
    const escapedLocation = location.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    paragraphs.push(`<p>${escapedLocation}</p>`);
  }

  if (message) {
    const escapedMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    paragraphs.push(
      `<blockquote style="margin:1rem 0;padding-left:1rem;border-left:4px solid #e1e8f0;">${escapedMessage}</blockquote>`
    );
  }

  paragraphs.push(
    '<p>Log in to the AFC Private Listing Network to reply and keep the conversation going.</p>',
    '<p>— AFC Private Listings</p>'
  );

  return {
    to: recipient.email,
    from: resolveFromAddress(),
    subject,
    text: lines.join('\n'),
    html: paragraphs.join('')
  };
}

async function sendConversationNotification(conversation, { senderId, messageBody }) {
  if (!conversation) {
    return;
  }

  const agent = await hydrateParticipant(conversation.agent);
  const buyer = await hydrateParticipant(conversation.buyer);
  const normalizedSenderId = resolveId(senderId);
  const agentId = resolveId(agent);
  const buyerId = resolveId(buyer);

  let recipient = agent;
  let sender = buyer;

  if (normalizedSenderId && agentId && normalizedSenderId === agentId) {
    recipient = buyer;
    sender = agent;
  } else if (normalizedSenderId && buyerId && normalizedSenderId === buyerId) {
    recipient = agent;
    sender = buyer;
  } else if (!recipient?.email && buyer?.email) {
    recipient = buyer;
    sender = agent;
  }

  const recipientId = resolveId(recipient);
  const senderResolvedId = resolveId(sender);

  if (!recipient?.email || (recipientId && senderResolvedId && recipientId === senderResolvedId)) {
    return;
  }

  const message = buildConversationNotificationEmail({
    recipient,
    sender,
    listing: conversation.listing,
    message: messageBody
  });

  if (!message) {
    return;
  }

  await deliverEmail(message);
}

module.exports = {
  sendListingMatchEmail,
  sendRegistrationEmail,
  sendConversationNotification
};

