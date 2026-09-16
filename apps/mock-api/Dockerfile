# syntax=docker/dockerfile:1
# Контекст — корень репозитория (docker-compose.yml).
FROM node:24-alpine

WORKDIR /repo

# Манифесты всех пакетов до npm ci: lock описывает все workspaces, а слой зависимостей
# пересобирается только при их смене, не на каждую правку кода.
COPY --parents package.json package-lock.json apps/*/package.json packages/*/*/package.json scripts/*/package.json ./
RUN npm ci --workspace @app/mock-api --include-workspace-root=false

COPY tsconfig.base.json ./
COPY apps/mock-api/tsconfig.json apps/mock-api/
COPY apps/mock-api/src apps/mock-api/src

WORKDIR /repo/apps/mock-api
USER node
EXPOSE 3001
# Один процесс node с загрузчиком tsx: без дочернего процесса, который пришлось бы гасить.
CMD ["node", "--import", "tsx", "src/server.ts"]
