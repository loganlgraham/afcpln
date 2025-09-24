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

const nodemailer = require('nodemailer');
const resend = require('resend');

describe('emailService transport selection', () => {
  beforeEach(() => {
    resend.__mock.sendMock.mockReset();
    resend.__mock.sendMock.mockResolvedValue({ data: { id: 'resend-test-id' } });
    nodemailer.__mock.sendMailMock.mockReset();
    nodemailer.__mock.createTransportMock.mockReset();

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
});
