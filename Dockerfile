# ENG-002 / ADR-010: Echo must remain deployable outside Vercel. This image is
# the proof, and it is deliberately boring — a stock Node base, the Next.js
# standalone server, and no platform-specific primitive anywhere.
#
# Nothing here bakes in configuration. Owner credentials and provider settings
# are read from the environment when the server starts, so one image runs any
# deployment and the image itself contains no secret. `npm run test:selfhost`
# asserts exactly that against the same bundle this image ships.
#
# Build and run from the repository root:
#   docker build -t echo .
#   docker run --rm -p 3000:3000 --env-file echo-web-app/.env.local echo

# Pinned to the version in .nvmrc. package.json requires >=22 <23.
FROM node:22.23.2-alpine AS build
WORKDIR /repo

# Dependencies first so a source-only change does not reinstall them.
COPY package.json package-lock.json ./
COPY echo-web-app/package.json ./echo-web-app/package.json
RUN npm ci

COPY . .
# NEXT_TELEMETRY_DISABLED keeps the build from making a network call the
# self-hosted story does not need.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# Copies .next/static (and public/ when it exists) into the bundle. The
# standalone server does not emit them because Vercel serves them from a CDN;
# a self-hosted deployment has no CDN. Skipping this produces a server that
# returns 200 for the page and 404 for every stylesheet and script.
RUN npm run selfhost:assemble

FROM node:22.23.2-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# server.js reads both. 0.0.0.0 so the port is reachable from outside the
# container; publish it only where you intend it to be reachable.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The standalone bundle carries its own traced node_modules, so the runtime
# stage installs nothing and ships no package manager state.
RUN addgroup -S echo && adduser -S echo -G echo
COPY --from=build --chown=echo:echo /repo/echo-web-app/.next/standalone/ ./
USER echo

EXPOSE 3000
# Mirrors the workspace layout, because outputFileTracingRoot is the repository
# root (echo-web-app/next.config.ts explains why it has to be).
CMD ["node", "echo-web-app/server.js"]
