import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { MailService } from './../src/mail/mail.service';

// Force the in-memory mocks so the e2e suite is hermetic and never touches
// real infrastructure (Postgres/Redis/RabbitMQ) or persistent data.
// These values are read lazily by the services during app.init().
process.env.USE_MOCK_PRISMA = 'true';
process.env.REDIS_URL = '';
process.env.RABBITMQ_URL = '';

/**
 * bcrypt cost 10 costs ~150-250ms per operation, which would add seconds to
 * every register/login/password-reset flow. A deterministic fake preserves
 * the hashing contract (hash -> string, compare -> bool) in microseconds;
 * the mock prisma/redis/mail layers already make this suite hermetic anyway.
 */
jest.mock('bcryptjs', () => {
  const prefix = '$2b$04$uacm-test-hash:';
  const hash = (value: string) => `${prefix}${value}`;
  return {
    hash: async (value: string) => hash(value),
    hashSync: (value: string) => hash(value),
    compare: async (value: string, hashed: string) => hashed === hash(value),
    compareSync: (value: string, hashed: string) => hashed === hash(value),
  };
});

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  const registerVerified = async (name: string, credentials: any) => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, ...credentials })
      .expect(201);

    const prisma = app.get(PrismaService);
    const user = await prisma.user.findUnique({
      where: { email: credentials.email },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
  };

  /**
   * The full AppModule is compiled only ONCE. Compiling the DI graph inside
   * beforeEach (the previous behaviour) was by far the slowest part of the
   * suite. Creating a fresh app from the compiled module still re-runs
   * onModuleInit, so every test gets clean mock Prisma/Redis/Mail stores.
   */
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  beforeEach(async () => {
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  describe('POST /auth/register', () => {
    const validBody = {
      name: 'Ahmed Ali',
      email: 'ahmed@example.com',
      password: 'StrongPass123',
    };

    it('creates an account with valid data', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send(validBody)
        .expect(201)
        .expect((res) => {
          expect(res.body.message).toContain('verify');
          expect(res.body).not.toHaveProperty('accessToken');
          expect(res.body).not.toHaveProperty('refreshToken');
          expect(res.body).not.toHaveProperty('passwordHash');
          expect(res.body).not.toHaveProperty('password');
        });
    });

    it('rejects a duplicate email with 409', () => {
      const server = app.getHttpServer();
      return request(server)
        .post('/auth/register')
        .send(validBody)
        .expect(201)
        .then(() =>
          request(server)
            .post('/auth/register')
            .send(validBody)
            .expect(409)
            .expect((res) => {
              expect(res.body.message).toContain('Email is already registered');
            }),
        );
    });

    it('rejects invalid data with 400', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Ahmed Ali', email: 'not-an-email', password: '12345' })
        .expect(400)
        .expect((res) => {
          const messages = res.body.message;
          expect(Array.isArray(messages)).toBe(true);
          expect(messages.join()).toContain('email');
          expect(messages.join()).toContain('password');
        });
    });

    it('rejects a weak password (letters only, no numbers) with 400', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Ahmed Ali',
          email: 'ahmed2@example.com',
          password: 'password',
        })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    const credentials = {
      email: 'login@example.com',
      password: 'StrongPass123',
    };

    beforeEach(async () => {
      await registerVerified('Login User', credentials);
    });

    it('returns a valid access JWT for correct credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send(credentials)
        .expect(200)
        .expect((res) => {
          expect(res.body.accessToken).toBeDefined();
          expect(res.body.refreshToken).toBeDefined();
          expect(res.body.user.email).toBe(credentials.email);
          const payload = JSON.parse(
            Buffer.from(
              res.body.accessToken.split('.')[1],
              'base64url',
            ).toString(),
          );
          expect(payload.type).toBe('access');
          expect(payload.email).toBe(credentials.email);
        });
    });

    it('rejects invalid credentials with 401', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: 'WrongPass123' })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('Invalid email or password');
        });
    });

    it('rejects an unknown email with 401', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'WrongPass123' })
        .expect(401);
    });
  });

  describe('POST /auth/login with 2FA enabled', () => {
    const twoFactorSecret = authenticator.generateSecret();

    beforeEach(async () => {
      const prisma = app.get(PrismaService);
      const passwordHash = await bcrypt.hash('StrongPass123', 10);
      const created = await prisma.user.create({
        data: {
          name: 'Two Factor User',
          email: 'twofactor@example.com',
          passwordHash,
          twoFactorEnabled: true,
          twoFactorSecret,
        },
      });
      await prisma.user.update({
        where: { id: created.id },
        data: { emailVerified: true },
      });
    });

    it('requests a verification code instead of issuing a JWT', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'twofactor@example.com', password: 'StrongPass123' })
        .expect(200)
        .expect((res) => {
          expect(res.body.requiresTwoFactor).toBe(true);
          expect(res.body.loginToken).toBeDefined();
          expect(res.body.accessToken).toBeUndefined();
        });
    });

    it('grants access only after the correct code is verified', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'twofactor@example.com', password: 'StrongPass123' })
        .expect(200);

      const code = authenticator.generate(twoFactorSecret);

      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-2fa')
        .send({ loginToken: loginRes.body.loginToken, code })
        .expect(200);

      expect(verifyRes.body.accessToken).toBeDefined();
      const payload = JSON.parse(
        Buffer.from(
          verifyRes.body.accessToken.split('.')[1],
          'base64url',
        ).toString(),
      );
      expect(payload.type).toBe('access');
      expect(payload.email).toBe('twofactor@example.com');
    });

    it('rejects a wrong verification code', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'twofactor@example.com', password: 'StrongPass123' })
        .expect(200);

      return request(app.getHttpServer())
        .post('/auth/verify-2fa')
        .send({ loginToken: loginRes.body.loginToken, code: '000000' })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('Invalid verification code');
        });
    });
  });

  describe('session management (logout / protected access)', () => {
    const credentials = {
      email: 'session@example.com',
      password: 'StrongPass123',
    };

    const login = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send(credentials)
        .expect(200);

    beforeEach(async () => {
      await registerVerified('Session User', credentials);
    });

    it('allows access to a protected endpoint with a valid token', async () => {
      const loginRes = await login();

      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.email).toBe(credentials.email);
          expect(res.body.id).toBeDefined();
        });
    });

    it('rejects access without a token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('logged in');
        });
    });

    it('revokes the token on logout so protected pages become inaccessible', async () => {
      const loginRes = await login();

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('Logged out successfully');
        });

      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain(
            'Session has been terminated. Please log in again.',
          );
        });
    });

    it('allows logging in again after logout', async () => {
      const firstLogin = await login();

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${firstLogin.body.accessToken}`)
        .expect(200);

      const secondLogin = await login();
      expect(secondLogin.body.accessToken).toBeDefined();

      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${secondLogin.body.accessToken}`)
        .expect(200);
    });

    it('rejects an expired token and prompts the user to log in again', async () => {
      const jwtService = app.get(JwtService);
      const expiredToken = await jwtService.signAsync(
        { sub: 'user-x', email: credentials.email, type: 'access' },
        { expiresIn: 0 },
      );

      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain(
            'Session has expired. Please log in again.',
          );
        });
    });
  });

  describe('password reset flow', () => {
    const credentials = {
      email: 'reset@example.com',
      password: 'OldPass123',
    };
    const newPassword = 'NewStrongPass456';
    const RESET_SUBJECT = 'UACM - Password Reset';

    beforeEach(async () => {
      await registerVerified('Reset User', credentials);
    });

    const resetEmails = () =>
      app
        .get(MailService)
        .getSentMessages()
        .filter((m) => m.subject === RESET_SUBJECT);

    const requestResetLink = async (): Promise<string> => {
      const before = resetEmails().length;

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: credentials.email })
        .expect(200);

      const messages = resetEmails();
      expect(messages.length).toBe(before + 1);
      expect(messages[0].to).toBe(credentials.email);

      const link = /href="([^"]+)"/.exec(
        messages[messages.length - 1].html,
      )![1];
      const token = new URL(link).searchParams.get('token') as string;
      expect(token).toBeDefined();
      return token;
    };

    it('resets the password via the emailed link (full flow)', async () => {
      const token = await requestResetLink();

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, newPassword })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('Password has been reset successfully');
        });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: newPassword })
        .expect(200);

      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(401);
    });

    it('does not reveal whether an email is registered', async () => {
      const before = resetEmails().length;

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'nobody@example.com' })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain('Password reset link sent');
        });

      expect(resetEmails()).toHaveLength(before);
    });

    it('rejects an expired reset link', async () => {
      const jwtService = app.get(JwtService);
      const expiredToken = await jwtService.signAsync(
        {
          sub: 'user-x',
          email: credentials.email,
          type: 'password-reset',
          jti: 'x',
        },
        { expiresIn: 0 },
      );

      return request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: expiredToken, newPassword })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain(
            'This reset link has expired. Please request a new one.',
          );
        });
    });

    it('rejects reusing an already-used reset link', async () => {
      const token = await requestResetLink();

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, newPassword })
        .expect(200);

      return request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, newPassword: 'AnotherPass789' })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain(
            'This reset link has already been used',
          );
        });
    });
  });
});
