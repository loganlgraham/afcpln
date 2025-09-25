jest.mock('nodemailer', () => {
  const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'mock-transport' });
  const createTransportMock = jest.fn(() => ({ sendMail: sendMailMock }));
  return {
    createTransport: createTransportMock,
    __mock: { sendMailMock, createTransportMock }
  };
});

jest.mock('resend', () => {
  const sendMock = jest.fn().mockResolvedValue({ data: { id: 'resend-test-id' } });
  const Resend = jest.fn(() => ({ emails: { send: sendMock } }));
  return { Resend, __mock: { sendMock } };
});

jest.mock('../models/User', () => ({
  findById: jest.fn()
}));

const nodemailer = require('nodemailer');
const resend = require('resend');
const User = require('../models/User');

describe('emailService transport selection', () => {
  beforeEach(() => {
    resend.__mock.sendMock.mockReset();
    resend.__mock.sendMock.mockResolvedValue({ data: { id: 'resend-test-id' } });
    nodemailer.__mock.sendMailMock.mockReset();
    nodemailer.__mock.createTransportMock.mockReset();
    User.findById.mockReset();

    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.RESEND_FROM;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_SENDER;
    delete process.env.RESEND_FROM_ADDRESS;
    delete process.env.RESEND_DOMAIN;
    delete process.env.EMAIL_FROM_NAME;
  });

  it('uses Resend delivery when RESEND_API_KEY is provided', async () => {
    process.env.RESEND_API_KEY = 'test-resend-key';

    let sendRegistrationEmail;
    jest.isolateModules(() => {
      ({ sendRegistrationEmail } = require('../services/emailService'));
    });

    await sendRegistrationEmail({ email: 'resend-user@example.com', fullName: 'Resend User' });

    expect(resend.__mock.sendMock).toHaveBeenCalledTimes(1);
    expect(resend.__mock.sendMock.mock.calls[0][0]).toMatchObject({
      to: 'resend-user@example.com',
      from: 'AFC Private Listings <hello@lgweb.app>',
      subject: expect.stringMatching(/welcome/i)
    });
    expect(nodemailer.__mock.createTransportMock).not.toHaveBeenCalled();
  });

  it('falls back to Nodemailer when Resend rejects the sender domain', async () => {
    process.env.RESEND_API_KEY = 'test-resend-key';
    resend.__mock.sendMock.mockRejectedValueOnce(
      Object.assign(new Error('You can only send testing emails to your own email address'), { statusCode: 403 })
    );

    let sendRegistrationEmail;
    jest.isolateModules(() => {
      ({ sendRegistrationEmail } = require('../services/emailService'));
    });

    await sendRegistrationEmail({ email: 'fallback@example.com', fullName: 'Fallback User' });

    expect(resend.__mock.sendMock).toHaveBeenCalledTimes(1);
    expect(nodemailer.__mock.createTransportMock).toHaveBeenCalledTimes(1);
    expect(nodemailer.__mock.sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'fallback@example.com',
        from: expect.stringContaining('AFC Private Listings'),
        subject: expect.stringMatching(/welcome/i)
      })
    );
  });

  it('hydrates missing participant emails before delivering conversation notifications', async () => {
    process.env.RESEND_API_KEY = 'test-resend-key';
    const agentId = '507f1f77bcf86cd799439011';
    const buyerId = '507f191e810c19729de860ea';

    User.findById.mockResolvedValueOnce({
      _id: agentId,
      fullName: 'Agent Example',
      email: 'agent@example.com',
      role: 'agent'
    });

    let sendConversationNotification;
    jest.isolateModules(() => {
      ({ sendConversationNotification } = require('../services/emailService'));
    });

    await sendConversationNotification(
      {
        agent: agentId,
        buyer: { _id: buyerId, email: 'buyer@example.com', fullName: 'Buyer Example', role: 'user' },
        listing: { title: '123 Test St', area: 'Test Area', address: { city: 'Test City', state: 'TS' } }
      },
      { senderId: buyerId, messageBody: 'Is this still available?' }
    );

    expect(User.findById).toHaveBeenCalledWith(agentId);
    expect(resend.__mock.sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'agent@example.com',
        subject: expect.stringMatching(/new message/i),
        text: expect.stringContaining('Is this still available?')
      })
    );
  });

  it('notifies the opposite participant when an agent replies to a buyer', async () => {
    process.env.RESEND_API_KEY = 'test-resend-key';
    const agentId = '64b7f1f77bcf86cd799439022';
    const buyerId = '64b7f191e810c19729de860ff';

    let sendConversationNotification;
    jest.isolateModules(() => {
      ({ sendConversationNotification } = require('../services/emailService'));
    });

    await sendConversationNotification(
      {
        agent: { _id: agentId, email: 'agent@example.com', fullName: 'Agent Example', role: 'agent' },
        buyer: { _id: buyerId, email: 'buyer@example.com', fullName: 'Buyer Example', role: 'user' },
        listing: { title: 'Skyline Loft', area: 'North Loop', address: { city: 'Minneapolis', state: 'MN' } }
      },
      { senderId: agentId, messageBody: 'Happy to set up a tour this week.' }
    );

    expect(resend.__mock.sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        subject: expect.stringMatching(/new message/i),
        text: expect.stringContaining('Happy to set up a tour this week.')
      })
    );
  });
});
