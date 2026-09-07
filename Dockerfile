# syntax=docker/dockerfile:1

# ---- build stage -----------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install all dependencies (root + client workspace).
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
RUN npm ci --ignore-scripts

# Generate the Prisma client and apply migrations to an empty SQLite DB that
# we ship with the image so the runtime never needs the prisma CLI.
ENV DATABASE_URL="file:./app.db"
COPY prisma ./prisma
# Prisma's "native" detection picks the openssl-1.1.x engine on this image but
# the runtime reports openssl-3.0.x, so generate the matching engine for the
# build arch. Patch only inside the image; the repo schema stays pristine.
RUN ARCH=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/') && \
    sed -i "s|provider = \"prisma-client-js\"|provider = \"prisma-client-js\"\n  binaryTargets = [\"native\", \"linux-${ARCH}-openssl-3.0.x\"]|" prisma/schema.prisma && \
    npx prisma generate && npx prisma migrate deploy

# Build the Nest server and the Vite client.
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
COPY client ./client
RUN npm run build

# ---- runtime stage ---------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init sqlite3 \
 && rm -rf /var/lib/apt/lists/*

# Production dependencies only.
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
RUN npm ci --omit=dev --ignore-scripts

# Generated Prisma client + query engine from the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Application artefacts: server bundle, built SPA, empty DB, migrations.
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/prisma/app.db ./prisma/app.db
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
