FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends bubblewrap unzip ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.32.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production
# The pinned solidcraft-cli is mounted by the deployment once rendering lands;
# see docs/12-operations.md.
CMD ["pnpm", "--filter", "@gallery/worker", "start"]
