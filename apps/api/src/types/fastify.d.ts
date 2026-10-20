import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * The exact bytes of the request body, available only on routes that ask
     * for them.
     *
     * Webhooks are authenticated by a signature computed over those bytes, so
     * verifying a re-serialized body instead would fail for reasons that look
     * like a bug in the crypto.
     */
    rawBody?: Buffer;
  }
}
