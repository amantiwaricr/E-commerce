# Fresh Meat Nepal — API image.
#
# Two stages so the shipped image carries no build tooling and no dev
# dependencies: jest, nodemon and supertest have no business on a machine
# facing the internet.

FROM node:20-alpine AS deps
WORKDIR /app
# Only the manifests, so this layer is reused whenever the source changes but
# the dependencies do not.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Alpine images carry no timezone data; the invoice and the delivery timeline
# both print local times.
RUN apk add --no-cache tzdata wget
ENV TZ=Asia/Kathmandu

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# The node image ships an unprivileged `node` user. Running as root inside a
# container turns a file-write bug into a container takeover.
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

# Overridden by the platform; this is only the default the healthcheck uses.
ENV PORT=5000
EXPOSE 5000

# /api/health is deliberately exempt from the HTTPS redirect, so it answers
# over plain HTTP from inside the network while the outside is TLS-only.
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" | grep -q '"success":true' || exit 1

CMD ["node", "src/index.js"]
