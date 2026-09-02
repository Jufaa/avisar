export interface AccountUser {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  fullName: string;
}

export interface NewAccount {
  organizationName: string;
  timezone: string;
  fullName: string;
  email: string;
  passwordHash: string;
}

export interface CreatedAccount {
  userId: string;
  organizationId: string;
}

/**
 * The application layer talks to this, never to Prisma.
 * Swapping the store means writing one new class in `infrastructure/`.
 */
export interface AuthRepository {
  findByEmail(email: string): Promise<AccountUser | null>;
  emailExists(email: string): Promise<boolean>;
  createAccount(input: NewAccount): Promise<CreatedAccount>;
  touchLastLogin(userId: string): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface TokenIssuer {
  issue(claims: { sub: string; organizationId: string }): string;
}
