# nsjail is built from a pinned release; the runtime image keeps only the binary
# and the small set of shared libraries it needs.
FROM debian:bookworm-slim AS nsjail-build
ARG NSJAIL_COMMIT=079d70dda4aa1edd9512cfd25ff1e47e316dc355
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git ca-certificates build-essential bison flex pkg-config \
      libprotobuf-dev protobuf-compiler libnl-3-dev libnl-route-3-dev libcap-dev \
 && git init /src \
 && cd /src \
 && git remote add origin https://github.com/google/nsjail.git \
 && git fetch --depth 1 origin "${NSJAIL_COMMIT}" \
 && git checkout --detach FETCH_HEAD \
 && make -j"$(nproc)" \
 && strip nsjail

FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libprotobuf32 libnl-3-200 libnl-route-3-200 libcap2 unzip tar ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=nsjail-build /src/nsjail /usr/local/bin/nsjail
RUN mkdir -p /work/out \
 && touch /work/design.solidcraft \
 && chmod 0777 /work/out \
 && chmod 0644 /work/design.solidcraft \
 && nsjail --help >/dev/null
RUN npm install -g pnpm@10.32.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production
# The managed solidcraft-cli directory is mounted at /opt/solidcraft by the
# deployment. The worker uses /opt/solidcraft/current/solidcraft-cli; the
# production update job swaps that symlink without restarting the container.
CMD ["pnpm", "--filter", "@gallery/worker", "start"]
