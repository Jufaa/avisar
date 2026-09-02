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

  app.post('/auth/register', async (request, reply) => {
    const body = registerBody.parse(request.body);
    const result = await registerAccount(body, { repository, hasher, tokens });
    return reply.status(201).send(result);
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginBody.parse(request.body);
    const result = await login(body, { repository, hasher, tokens });
    return reply.send(result);
  });
}
