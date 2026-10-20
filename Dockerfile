# ---------------------------------------------------------------------------
# Avisar — one image that serves the API and the web client.
#
# Two stages: the first has the whole toolchain and builds; the second carries
# only what runs. Keeping the compiler out of the image that faces the internet
# is the cheapest security win available.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS build

# Prisma's engines need OpenSSL, and Alpine does not ship it by default.
RUN apk add --no-cache openssl

RUN corepack enable

WORKDIR /app

# Manifests first, on their own layer. Dependencies change far less often than
# source, so a code edit does not reinstall the world.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

COPY . .

# The client has to exist before tsc sees a single import of it.
RUN pnpm --filter @avisar/api exec prisma generate
RUN pnpm build

# Drops every devDependency from node_modules in place. The runtime stage
# copies what survives.
RUN pnpm prune --prod


FROM node:22-alpine AS runtime

RUN apk add --no-cache openssl

RUN corepack enable

# Never root. A process that only reads its own files has no business being
# able to write anywhere else in the image.
RUN addgroup -S avisar && adduser -S avisar -G avisar

WORKDIR /app

ENV NODE_ENV=production
ENV SERVE_WEB=true
ENV HOST=0.0.0.0
ENV PORT=3333

COPY --from=build --chown=avisar:avisar /app/node_modules ./node_modules
COPY --from=build --chown=avisar:avisar /app/package.json ./package.json
COPY --from=build --chown=avisar:avisar /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

COPY --from=build --chown=avisar:avisar /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=avisar:avisar /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=avisar:avisar /app/apps/api/dist ./apps/api/dist
# The migrations travel with the image so the running container can apply them.
COPY --from=build --chown=avisar:avisar /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=avisar:avisar /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build --chown=avisar:avisar /app/apps/api/src/config/load-env.ts ./apps/api/src/config/load-env.ts

# Built assets only — no sources, no Vite, no toolchain.
COPY --from=build --chown=avisar:avisar /app/apps/web/dist ./apps/web/dist

COPY --from=build --chown=avisar:avisar /app/packages/shared ./packages/shared

COPY --chown=avisar:avisar docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER avisar

EXPOSE 3333

# The platform reads this to know whether the container is alive. It answers
# without touching the database on purpose: a slow query must not be read as a
# dead process and trigger a restart loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3333)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
