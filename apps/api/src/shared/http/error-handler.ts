import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';

/**
 * One place turns any thrown value into the response shape the web client
 * expects. Handlers just throw; they never build an error body.
 */
export interface ErrorHandlerOptions {
  /**
   * Whether this process also serves the web client.
   *
   * It changes what a miss means: with the client behind it, an unknown path
   * is a route the browser router owns, not a mistake. Fastify allows exactly
   * one not-found handler per instance, so the decision lives here rather than
   * in a second registration that would throw at boot.
   */
  serveWeb?: boolean;
}

export function registerErrorHandler(app: FastifyInstance, options: ErrorHandlerOptions = {}): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some fields are missing or invalid',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return reply.status(409).send({
          error: {
            code: 'CONFLICT',
            message: 'A record with that data already exists',
            details: error.meta,
          },
        });
      }
      if (error.code === 'P2025') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Record not found' },
        });
      }
    }

    const fastifyError = error as { statusCode?: number; message?: string; code?: string };
    if (typeof fastifyError.statusCode === 'number' && fastifyError.statusCode < 500) {
      return reply.status(fastifyError.statusCode).send({
        error: {
          code: fastifyError.code ?? 'REQUEST_ERROR',
          message: fastifyError.message ?? 'Request could not be processed',
        },
      });
    }

    request.log.error({ err: error }, 'Unhandled error');

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our side. Please try again.',
      },
    });
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    // An unknown /api path is always a mistake and always answers JSON.
    if (options.serveWeb && !request.url.startsWith('/api/')) {
      // Everything else belongs to the browser router: /agenda, /facturas and
      // the patient's /t/:token must survive a hard refresh.
      return reply.sendFile('index.html');
    }

    return reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} does not exist` },
    });
  });
}
