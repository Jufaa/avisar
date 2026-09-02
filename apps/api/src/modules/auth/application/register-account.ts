import { ConflictError, ValidationError } from '../../../shared/errors.js';
import { isValidTimeZone } from '../../../shared/datetime.js';
import type { AuthRepository, PasswordHasher, TokenIssuer } from '../domain/auth.repository.js';

export interface RegisterAccountInput {
  organizationName: string;
  timezone: string;
  fullName: string;
  email: string;
  password: string;
}

export interface RegisterAccountDeps {
  repository: AuthRepository;
  hasher: PasswordHasher;
  tokens: TokenIssuer;
}

export interface AuthResult {
  token: string;
  userId: string;
  organizationId: string;
}

export async function registerAccount(
  input: RegisterAccountInput,
  deps: RegisterAccountDeps,
): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();

  if (!isValidTimeZone(input.timezone)) {
    throw new ValidationError('That timezone is not recognized');
  }

  if (await deps.repository.emailExists(email)) {
    throw new ConflictError('There is already an account with that email');
  }

  const passwordHash = await deps.hasher.hash(input.password);

  const account = await deps.repository.createAccount({
    organizationName: input.organizationName.trim(),
    timezone: input.timezone,
    fullName: input.fullName.trim(),
    email,
    passwordHash,
  });

  return {
    token: deps.tokens.issue({ sub: account.userId, organizationId: account.organizationId }),
    userId: account.userId,
    organizationId: account.organizationId,
  };
}
