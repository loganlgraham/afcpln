jest.mock('nodemailer', () => {
  const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'message-transport' });
  const createTransportMock = jest.fn(() => ({ sendMail: sendMailMock }));
  return {
    createTransport: createTransportMock,
    __mock: { sendMailMock, createTransportMock }
  };
});

const request = require('supertest');
const nodemailer = require('nodemailer');
const app = require('../app');
const Message = require('../models/Message');
const EmailLog = require('../models/EmailLog');

const { sendMailMock } = nodemailer.__mock;

async function registerUser(overrides = {}) {
  const payload = {
    fullName: 'Test User',
    email: `user-${Math.random().toString(16).slice(2)}@example.com`,
    password: 'Password123!',
    role: 'user',
    ...overrides
  };

  const response = await request(app).post('/api/auth/register').send(payload);
  return response;
}

describe('Messaging API', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it('stores messages and records email notifications', async () => {
    const agentRes = await registerUser({
      fullName: 'Agent Smith',
      email: 'agent-message@example.com',
      role: 'agent'
    });
    expect(agentRes.status).toBe(201);
    const agentToken = agentRes.body.token;
    const agentId = agentRes.body.user._id;

    const buyerRes = await registerUser({
      fullName: 'Buyer Jane',
      email: 'buyer-message@example.com',
      role: 'user'
    });
    expect(buyerRes.status).toBe(201);
    const buyerToken = buyerRes.body.token;
    const buyerId = buyerRes.body.user._id;

    const listingPayload = {
      title: 'Riverfront Loft',
      description: 'Spacious loft with skyline views.',
      price: 450000,
      bedrooms: 2,
      bathrooms: 2,
      area: 'Downtown',
      address: {
        street: '200 Main St',
        city: 'Minneapolis',
        state: 'MN',
        postalCode: '55414'
      }
    };

    const createListingRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${agentToken}`)
      .send(listingPayload);

    expect(createListingRes.status).toBe(201);
    const listingId = createListingRes.body._id;

    const messageBody = 'Hello Agent, I would love to schedule a tour!';

    const messageRes = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ recipientId: agentId, listingId, body: messageBody });

    expect(messageRes.status).toBe(201);
    expect(messageRes.body.body).toBe(messageBody);
    expect(messageRes.body.sender._id).toBe(buyerId);
    expect(messageRes.body.recipient._id).toBe(agentId);
    expect(messageRes.body.listing._id).toBe(listingId);

    const messages = await Message.find({});
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe(messageBody);
    expect(messages[0].listing.toString()).toBe(listingId);

    const logs = await EmailLog.find({ message: messages[0]._id });
    expect(logs).toHaveLength(1);
    expect(logs[0].to).toBe('agent-message@example.com');
    expect(logs[0].user.toString()).toBe(agentId);
    expect(logs[0].searchName).toMatch(/message/);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sentEmail = sendMailMock.mock.calls[0][0];
    expect(sentEmail.to).toBe('agent-message@example.com');
    expect(sentEmail.subject).toMatch(/messaged you/i);
    expect(sentEmail.text).toMatch(messageBody);
  });
});
