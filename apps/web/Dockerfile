# Build the whole workspace so pnpm's workspace links resolve, then run the
# adapter-node output. The image is intentionally simple for M0; a pnpm deploy
# based runtime is a later optimisation.
FROM node:22-bookworm-slim AS build
RUN npm install -g pnpm@10.32.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ARG PUBLIC_ORIGIN
ENV PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
RUN pnpm --filter @gallery/web build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@10.32.1
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "apps/web/build/index.js"]
