# ── Build stage ──────────────────────────────────────────────
FROM node:22-alpine AS base

WORKDIR /app

# Copy package manifests and install dependencies (if any)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || true

# Copy the rest of the source code
COPY . .

# ── Runtime ──────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/team-task-manager.json

# Create the data directory so the JSON store can persist
RUN mkdir -p /data

EXPOSE 3000

# Health-check aligned with railway.json
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server/src/server.js"]
