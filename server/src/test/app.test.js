const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Listing = require('../models/Listing');
const EmailLog = require('../models/EmailLog');

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
    const agentToken = agentRes.body.token;

    const userRes = await registerUser({
      fullName: 'Buyer Jane',
      email: userEmail,
      role: 'user'
    });

    expect(userRes.status).toBe(201);
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

    const listingPayload = {
      title: 'Modern Downtown Condo',
      description: 'Bright condo with skyline views and private balcony.',
      price: 350000,
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1200,
      area: 'North Loop',
      features: ['Balcony', 'Gym Access'],
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
});
