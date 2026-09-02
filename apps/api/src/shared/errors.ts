/**
 * Application errors carry an HTTP status and a stable machine code, so the
 * web client can react to a case without matching on message text.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'The data sent is not valid', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'You need to sign in to continue') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'CONFLICT', message, details);
  }
}

/**
 * Raised by the rate limiter.
 *
 * It is an AppError rather than a plain object on purpose: the error handler
 * recognises those and answers 429. A bare object with no status code falls
 * through to the catch-all and becomes a 500, which tells the caller the
 * server broke when in fact it defended itself.
 */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Demasiadas solicitudes. Esperá un momento y probá de nuevo.') {
    super(429, 'RATE_LIMITED', message);
  }
}
