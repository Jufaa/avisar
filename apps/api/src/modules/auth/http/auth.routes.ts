import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../shared/prisma.js';
import { env } from '../../../config/env.js';
import { PrismaAuthRepository } from '../infrastructure/prisma-auth.repository.js';
import { BcryptHasher } from '../infrastructure/bcrypt-hasher.js';
import { registerAccount } from '../application/register-account.js';
import { login } from '../application/login.js';
import type { TokenIssuer } from '../domain/auth.repository.js';

const registerBody = z.object({
  organizationName: z.string().trim().min(2, 'Enter the name of your practice'),
  timezone: z.string().default('America/Argentina/Buenos_Aires'),
  fullName: z.string().trim().min(2, 'Enter your name'),
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters'),
});

const loginBody = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const repository = new PrismaAuthRepository(prisma);
  const hasher = new BcryptHasher();

  const tokens: TokenIssuer = {
    issue: (claims) => app.jwt.sign(claims, { expiresIn: env.JWT_EXPIRES_IN }),
  };

  /**
   * The tightest budget in the API.
   *
   * A password is the one secret a stranger can guess, and bcrypt only makes
   * each guess expensive — it does not stop someone making millions of them.
   * Ten attempts per address per fifteen minutes leaves a forgetful user
   * plenty of room and leaves an attacker none.
   */
  const strictLimit = {
    config: {
      rateLimit: { max: 10, timeWindow: '15 minutes' },
    },
  };

  app.post('/auth/register', strictLimit, async (request, reply) => {
    const body = registerBody.parse(request.body);
    const result = await registerAccount(body, { repository, hasher, tokens });
    return reply.status(201).send(result);
  });

  app.post('/auth/login', strictLimit, async (request, reply) => {
    const body = loginBody.parse(request.body);
    const result = await login(body, { repository, hasher, tokens });
    return reply.send(result);
  });
}
