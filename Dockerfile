# syntax=docker/dockerfile:1.25
# ──────────────────────────────────────────────────────────────────────────────
# Finance tracker — multi-stage image.
#   deps     → install node_modules once, cached across builds
#   dev      → hot-reloading dev server (used by docker/development.yml)
#   builder  → next build, emitting .next/standalone
#   runner   → minimal production runtime (default target)
# ──────────────────────────────────────────────────────────────────────────────

# ───────────────────────────────── base ─────────────────────────────────
FROM node:26-alpine AS base
WORKDIR /app
# glibc shim some native/prebuilt binaries expect on musl
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1

# ───────────────────────────────── deps ─────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ────────────────────────────── development ─────────────────────────────
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
# source is bind-mounted by the development overlay, so this stays hot-reloading
CMD ["npm", "run", "dev"]

# ──────────────────────────────── builder ───────────────────────────────
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ──────────────────────────────── runner ────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone bundles only the server files it traced; public/ and .next/static
# have to be copied in explicitly (docs: config/output)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# schema.sql is read at runtime to keep the database up to date
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.js"]
