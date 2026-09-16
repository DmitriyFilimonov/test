# syntax=docker/dockerfile:1
# Контекст — корень репозитория (docker-compose.yml).

# Сборка: Node и монорепозиторий. В финальный образ отсюда едет только dist.
FROM node:24-alpine AS build

WORKDIR /repo

# Манифесты всех пакетов до npm ci: слой зависимостей пересобирается при их смене,
# а не на каждую правку кода.
COPY --parents package.json package-lock.json apps/*/package.json packages/*/*/package.json scripts/*/package.json ./
RUN npm ci

COPY . .
# Ни ARG, ни ENV с ключом модели: значение в сборке Vite осталось бы и в бандле, и в слоях.
RUN npm run build -w @app/web
# Предсжатие для gzip_static: сжимается один раз и максимально, nginx не тратит CPU на запрос.
RUN find apps/web/dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' \) -exec gzip -9 -k {} +

FROM nginx:1.30-alpine

COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
