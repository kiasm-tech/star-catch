# One image for the backend: <image> api | intake | worker [--watch] | migrate
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

# The tree-sitter grammars, copied out of the changes package's devDependencies; no install
# scripts run here, so nothing tries a native build.
FROM base AS grammars
RUN pnpm fetch --ignore-scripts
COPY . .
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --filter @star-catch/changes \
  && node --experimental-strip-types packages/changes/scripts/vendor-grammars.ts

FROM base AS deps
RUN pnpm fetch --prod
COPY . .
RUN pnpm install --offline --prod --frozen-lockfile

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY --from=grammars /app/packages/changes/grammars /app/packages/changes/grammars
USER node
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
