# ── Stage 1: install dependencies ─────────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: build ─────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy build-time values — real secrets are injected at runtime via Railway env vars
ENV DB_SERVER=build \
    DB_NAME=build \
    DB_USER=build \
    DB_PASSWORD=build \
    JWT_SECRET=buildsecret \
    GROQ_API_KEY=build \
    OPENAI_API_KEY=build \
    CLIENT_PORTAL_PASSWORD=build
RUN npm run build

# ── Stage 3: runtime ───────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
