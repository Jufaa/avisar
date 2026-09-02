import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors.js';

export interface AuthClaims {
  sub: string;
  organizationId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Present on every route registered behind `requireAuth`. */
    auth?: AuthClaims;
  }
}

/**
 * Pre-handler for authenticated routes. Anything that reaches the use case
 * already has a verified organization id, so no handler has to remember to
 * scope its query by tenant on its own.
 */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    const claims = await request.jwtVerify<AuthClaims>();
    request.auth = { sub: claims.sub, organizationId: claims.organizationId };
  } catch {
    throw new UnauthorizedError('Your session expired. Please sign in again.');
  }
}

/** Reads the verified claims, or fails loudly if a route forgot `requireAuth`. */
export function authOf(request: FastifyRequest): AuthClaims {
  if (!request.auth) throw new UnauthorizedError();
  return request.auth;
}
