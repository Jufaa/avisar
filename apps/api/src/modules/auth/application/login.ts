import { UnauthorizedError } from '../../../shared/errors.js';
import type { AuthRepository, PasswordHasher, TokenIssuer } from '../domain/auth.repository.js';
import type { AuthResult } from './register-account.js';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginDeps {
  repository: AuthRepository;
  hasher: PasswordHasher;
  tokens: TokenIssuer;
}

export async function login(input: LoginInput, deps: LoginDeps): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const user = await deps.repository.findByEmail(email);

  // Same message and same work for "no such user" and "wrong password":
  // a different response here tells an attacker which emails are registered.
  const passwordMatches = user
    ? await deps.hasher.verify(input.password, user.passwordHash)
    : await deps.hasher.verify(input.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');

  if (!user || !passwordMatches) {
    throw new UnauthorizedError('Email or password is incorrect');
  }

  await deps.repository.touchLastLogin(user.id);

  return {
    token: deps.tokens.issue({ sub: user.id, organizationId: user.organizationId }),
    userId: user.id,
    organizationId: user.organizationId,
  };
}
