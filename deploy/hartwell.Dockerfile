# Hartwell Supply store (one service: the backend serves the built store front and /earmark, /api).
# Build from the repo root:  docker build -f deploy/hartwell.Dockerfile .
FROM node:22-slim
WORKDIR /repo
COPY contracts/deployments contracts/deployments
COPY earmark-plugin earmark-plugin
COPY hartwell-supply/backend hartwell-supply/backend
COPY hartwell-supply/frontend hartwell-supply/frontend
RUN cd earmark-plugin && npm ci --no-audit --no-fund \
 && cd ../hartwell-supply/backend && npm ci --no-audit --no-fund \
 && cd ../frontend && npm ci --no-audit --no-fund && npm run build
WORKDIR /repo/hartwell-supply/backend
ENV NODE_ENV=production
ENV HARTWELL_DATA_DIR=/data
CMD ["npx", "tsx", "src/index.ts"]
