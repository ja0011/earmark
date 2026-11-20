# Earmark website + server (one service: the server serves the built site and /api).
# Build from the repo root:  docker build -f deploy/earmark.Dockerfile .
FROM node:22-slim
WORKDIR /repo
COPY contracts/deployments contracts/deployments
COPY contracts/abi contracts/abi
COPY earmark-plugin earmark-plugin
COPY earmark-app earmark-app
RUN cd earmark-plugin && npm ci --no-audit --no-fund \
 && cd ../earmark-app && npm ci --no-audit --no-fund && npm run build
WORKDIR /repo/earmark-app
ENV NODE_ENV=production
# Railway sets PORT; keep app data on a mounted volume.
ENV EARMARK_DATA_DIR=/data
CMD ["npx", "tsx", "server/index.ts"]
