# One image for the backend: <image> intake | worker [--watch] | migrate
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN pnpm fetch --prod
COPY . .
RUN pnpm install --offline --prod --frozen-lockfile

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app /app
USER node
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
