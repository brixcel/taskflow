# ─── Stage 1: dependencies ───────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files first so this layer is cached unless deps change
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ─── Stage 2: Prisma client generation ───────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
# Install all deps (including prisma CLI) to run generate
RUN npm ci

COPY prisma ./prisma
# Generate the Prisma client into the expected output path
RUN npx prisma generate

# ─── Stage 3: production image ───────────────────────────────────────────────
FROM node:22-alpine AS runner

# Security: run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Bring in production node_modules from deps stage
COPY --from=deps    /app/node_modules ./node_modules

# Bring in the generated Prisma client from builder stage
COPY --from=builder /app/generated    ./generated

# Copy application source
COPY . .

# Drop to non-root
USER appuser

EXPOSE 3000

# Healthcheck so docker-compose and orchestrators know when the app is ready
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
