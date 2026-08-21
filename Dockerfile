FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx vinext build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY wrangler.selfhost.jsonc docker-entrypoint.sh ./

RUN chmod 0755 /app/docker-entrypoint.sh

EXPOSE 3000
VOLUME ["/data"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]
