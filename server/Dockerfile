# Buddyy API — production image
# Multi-stage: build TypeScript + generate Prisma client, then a slim runtime.
FROM node:20-slim AS build
WORKDIR /app

# OpenSSL is required by Prisma's query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

EXPOSE 4000
# Sync the DB schema at boot, then start. `db push` is used because there is no
# migration history yet; swap to `prisma migrate deploy` once you add migrations.
# Needs DIRECT_URL (session pooler) — pgbouncer's transaction pooler can't run it.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
