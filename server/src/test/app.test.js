jest.mock('nodemailer', () => {
  const sendMailMock = jest.fn().mockResolvedValue({ message: 'mock-transport' });
  const createTransportMock = jest.fn(() => ({ sendMail: sendMailMock }));
  return {
    createTransport: createTransportMock,
    __mock: { sendMailMock, createTransportMock }
  };
});

const request = require('supertest');
const nodemailer = require('nodemailer');
const app = require('../app');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Conversation = require('../models/Conversation');
const EmailLog = require('../models/EmailLog');

const { sendMailMock } = nodemailer.__mock;

async function registerUser(overrides = {}) {
  const payload = {
    fullName: 'Test User',
    email: 'user@example.com',
    password: 'Password123!',
    role: 'user',
    ...overrides
  };

  const response = await request(app).post('/api/auth/register').send(payload);
  return response;
}

async function loginUser(email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

describe('AFCPLN API', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it('registers agents and users, stores listings, and creates targeted emails', async () => {
    const agentEmail = 'agent@example.com';
    const userEmail = 'buyer@example.com';

    const agentRes = await registerUser({
      fullName: 'Agent Smith',
      email: agentEmail,
      role: 'agent'
    });

    expect(agentRes.status).toBe(201);
    expect(agentRes.body.token).toBeDefined();
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0].to).toBe(agentEmail);
    expect(sendMailMock.mock.calls[0][0].subject).toContain('Welcome to the AFC Private Listing Network');
    const agentToken = agentRes.body.token;

    const userRes = await registerUser({
      fullName: 'Buyer Jane',
      email: userEmail,
      role: 'user'
    });

    expect(userRes.status).toBe(201);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    const welcomeMessages = sendMailMock.mock.calls
      .map((call) => call[0])
      .filter((message) =>
        message?.subject?.includes('Welcome to the AFC Private Listing Network')
      );
    expect(welcomeMessages).toHaveLength(2);
    const userToken = userRes.body.token;

    const savedSearchRes = await request(app)
      .post('/api/users/me/saved-searches')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'North Loop Buyers',
        areas: ['North Loop'],
        minPrice: 200000,
        maxPrice: 500000,
        minBedrooms: 2
      });

    expect(savedSearchRes.status).toBe(201);
    expect(savedSearchRes.body.name).toBe('North Loop Buyers');

    const sampleImage = `data:image/jpeg;base64,${'A'.repeat(300000)}`;

    const listingPayload = {
      title: 'Modern Downtown Condo',
      description: 'Bright condo with skyline views and private balcony.',
      price: 350000,
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1200,
      area: 'North Loop',
      features: ['Balcony', 'Gym Access'],
      images: [sampleImage],
      address: {
        street: '123 River St',
        city: 'Minneapolis',
        state: 'MN',
        postalCode: '55401'
      }
    };

    const createListingRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${agentToken}`)
      .send(listingPayload);

    expect(createListingRes.status).toBe(201);
    expect(createListingRes.body.area).toBe('North Loop');
    expect(createListingRes.body.images).toHaveLength(1);

    const listingsRes = await request(app).get('/api/listings').query({ area: 'North Loop' });
    expect(listingsRes.status).toBe(200);
    expect(listingsRes.body.length).toBe(1);
    expect(listingsRes.body[0].title).toBe('Modern Downtown Condo');

    const emailLogs = await EmailLog.find({});
    expect(emailLogs.length).toBe(1);
    expect(emailLogs[0].to).toBe(userEmail);
    expect(emailLogs[0].searchName).toBe('North Loop Buyers');
  });

  it('prevents agents from editing other agents listings', async () => {
    await User.deleteMany({});
    await Listing.deleteMany({});
    await EmailLog.deleteMany({});
    await Conversation.deleteMany({});

    const agentOneRes = await registerUser({
      fullName: 'Agent One',
      email: 'agent1@example.com',
      role: 'agent'
    });
    const agentTwoRes = await registerUser({
      fullName: 'Agent Two',
      email: 'agent2@example.com',
      role: 'agent'
    });

    const listingRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${agentOneRes.body.token}`)
      .send({
        title: 'Cozy Bungalow',
        description: 'Charming starter home.',
        price: 210000,
        bedrooms: 3,
        bathrooms: 2,
        area: 'South Side',
        address: {
          street: '45 Oak Ave',
          city: 'Minneapolis',
          state: 'MN',
          postalCode: '55407'
        }
      });

    const updateRes = await request(app)
      .put(`/api/listings/${listingRes.body._id}`)
      .set('Authorization', `Bearer ${agentTwoRes.body.token}`)
      .send({ price: 220000 });

    expect(updateRes.status).toBe(403);
    expect(updateRes.body.message).toMatch(/permission/);
  });

  it('sends a confirmation email after successful registration', async () => {
    const email = 'welcome@example.com';
    const response = await registerUser({ email });

    expect(response.status).toBe(201);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const message = sendMailMock.mock.calls[0][0];
    expect(message.to).toBe(email);
    expect(message.subject).toMatch(/welcome/i);
  });

  it('allows buyers and agents to exchange in-app messages about a listing', async () => {
    await User.deleteMany({});
    await Listing.deleteMany({});
    await Conversation.deleteMany({});
    await EmailLog.deleteMany({});

    const agentRes = await registerUser({
      fullName: 'Agent Author',
      email: 'author@example.com',
      role: 'agent'
    });

    const buyerRes = await registerUser({
      fullName: 'Curious Buyer',
      email: 'curious@example.com',
      role: 'user'
    });

    const listingPayload = {
      title: 'Skyline Loft',
      description: 'Open layout with floor-to-ceiling windows.',
      price: 495000,
      bedrooms: 2,
      bathrooms: 2,
      area: 'North Loop',
      address: {
        street: '77 Riverfront Dr',
        city: 'Minneapolis',
        state: 'MN',
        postalCode: '55401'
      }
    };

    const listingRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${agentRes.body.token}`)
      .send(listingPayload);

    expect(listingRes.status).toBe(201);
    const listingId = listingRes.body._id;

    const emailCountAfterListing = sendMailMock.mock.calls.length;

    const messageRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${buyerRes.body.token}`)
      .send({ listingId, message: 'Is this loft still available?' });

    expect(messageRes.status).toBe(201);
    expect(messageRes.body.messages).toHaveLength(1);
    expect(messageRes.body.messages[0].body).toContain('available');
    expect(sendMailMock).toHaveBeenCalledTimes(emailCountAfterListing + 1);
    const firstConversationEmail = sendMailMock.mock.calls[sendMailMock.mock.calls.length - 1][0];
    expect(firstConversationEmail.to).toBe(agentEmail);
    expect(firstConversationEmail.subject).toMatch(/new message/i);
    expect(firstConversationEmail.text).toContain('Is this loft still available?');

    const agentConversationList = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${agentRes.body.token}`);

    expect(agentConversationList.status).toBe(200);
    expect(agentConversationList.body).toHaveLength(1);
    const conversationId = agentConversationList.body[0]._id;

    const replyRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${agentRes.body.token}`)
      .send({ message: 'Yes, let us know when you would like to tour.' });

    expect(replyRes.status).toBe(200);
    expect(replyRes.body.messages).toHaveLength(2);
    expect(replyRes.body.messages[1].body).toContain('tour');
    expect(sendMailMock).toHaveBeenCalledTimes(emailCountAfterListing + 2);
    const replyNotification = sendMailMock.mock.calls[sendMailMock.mock.calls.length - 1][0];
    expect(replyNotification.to).toBe(userEmail);
    expect(replyNotification.subject).toMatch(/new message/i);
    expect(replyNotification.text).toContain('let us know when you would like to tour');

    const buyerConversationList = await request(app)
      .get('/api/conversations')
      .query({ listingId })
      .set('Authorization', `Bearer ${buyerRes.body.token}`);

    expect(buyerConversationList.status).toBe(200);
    expect(buyerConversationList.body).toHaveLength(1);
    expect(buyerConversationList.body[0].messages).toHaveLength(2);
    const participants = buyerConversationList.body[0];
    expect(participants.agent.fullName).toBe('Agent Author');
    expect(participants.buyer.fullName).toBe('Curious Buyer');
  });
});
