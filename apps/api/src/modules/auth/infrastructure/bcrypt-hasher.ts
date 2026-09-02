import bcrypt from 'bcryptjs';
import type { PasswordHasher } from '../domain/auth.repository.js';

const SALT_ROUNDS = 10;

export class BcryptHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
