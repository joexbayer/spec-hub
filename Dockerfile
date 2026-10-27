# Spec Hub image. The server runs its TypeScript sources directly on Node 24 (type stripping;
# tsconfig has erasableSyntaxOnly), so there is no server build step, and @spec-hub/core resolves
# through the pnpm workspace symlink to packages/core/src.

FROM node:24-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
# tag kept for readability; the digest is what is pulled. Refresh deliberately.
RUN corepack enable \
 && apt-get update && apt-get install -y --no-install-recommends zip && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages/ packages/
COPY apps/ apps/
RUN pnpm --filter @spec-hub/web build \
 && mkdir -p apps/server/public/extension \
 && cd packages/extension \
 && zip -r ../../apps/server/public/extension/spec-hub.zip extension.yml config-template.yml README.md scripts

FROM node:24-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
# tag kept for readability; the digest is what is pulled. Refresh deliberately.
RUN corepack enable
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --prod --filter @spec-hub/server... && chown -R node:node /app
COPY --from=build --chown=node:node /repo/packages/core/src packages/core/src
COPY --from=build --chown=node:node /repo/apps/server/src apps/server/src
COPY --from=build --chown=node:node /repo/apps/server/public apps/server/public
USER node
WORKDIR /app/apps/server
EXPOSE 3000
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.ts"]
