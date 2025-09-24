jest.mock('resend', () => {
  const sendMock = jest.fn().mockResolvedValue({ data: { id: 'resend-test-id' } });
  const Resend = jest.fn(() => ({ emails: { send: sendMock } }));
  return { Resend, __mock: { sendMock } };
});

describe('emailService transport selection', () => {
  afterEach(() => {
    const resend = require('resend');
    resend.__mock.sendMock.mockClear();
    delete process.env.RESEND_API_KEY;
  });

  it('uses Resend delivery when RESEND_API_KEY is provided', async () => {
    process.env.RESEND_API_KEY = 'test-resend-key';

    let sendRegistrationEmail;
    jest.isolateModules(() => {
      ({ sendRegistrationEmail } = require('../services/emailService'));
    });

    await sendRegistrationEmail({ email: 'resend-user@example.com', fullName: 'Resend User' });

    const resend = require('resend');
    expect(resend.__mock.sendMock).toHaveBeenCalledTimes(1);
    expect(resend.__mock.sendMock.mock.calls[0][0]).toMatchObject({
      to: 'resend-user@example.com',
      subject: expect.stringMatching(/welcome/i)
    });
  });
});
