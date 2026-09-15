FROM node:22-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY api ./api
COPY shared ./shared
COPY tsconfig.json tsconfig.api.json ./
RUN pnpm build:api && pnpm prune --prod

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/api ./dist/api

USER node
CMD ["node", "dist/api/api/server.js"]
