const nodemailer = require('nodemailer');
const EmailLog = require('../models/EmailLog');

const fromAddress = process.env.EMAIL_FROM || 'no-reply@afcpln.local';

const transporter = nodemailer.createTransport({
  jsonTransport: true
});

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

async function sendListingMatchEmail(user, listing, search) {
  const message = buildListingEmail({ user, listing, search });
  const response = await transporter.sendMail(message);

  await EmailLog.create({
    user: user._id,
    listing: listing._id,
    searchName: search.name,
    to: message.to,
    subject: message.subject,
    body: message.text,
    transportResponse: typeof response.message === 'string' ? response.message : JSON.stringify(response.message)
  });
}

module.exports = {
  sendListingMatchEmail
};
