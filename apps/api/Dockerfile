# syntax=docker/dockerfile:1
# AT SEVDALISI API (02.10.2026, Faz 13-A). Kök dizinden derlenir:
#   docker build -f apps/api/Dockerfile -t at-sevdalisi-api .
# Hedefler:
#   runtime (varsayılan) — üretim sunucusu, dev bağımlılıksız, root DEĞİL.
#   migrate             — veritabanı migration'ları (`npm run migrate`); dağıtımda
#                         uygulamadan ÖNCE tek seferlik iş olarak koşulur.
# Gizli değer imaja GİRMEZ: JWT_SECRET, DATABASE_URL, REDIS_URL vb. çalışma
# anında ortamdan verilir; eksikse uygulama açılmaz (production-env.ts).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/game-config/package.json packages/game-config/
COPY packages/shared-types/package.json packages/shared-types/
RUN npm ci --ignore-scripts

FROM deps AS build
COPY tsconfig.base.json ./
COPY config config
COPY packages packages
COPY apps/api apps/api
RUN npm run build:packages && npm run build --workspace=apps/api

FROM build AS migrate
COPY tools tools
COPY database database
CMD ["npm", "run", "migrate"]

FROM build AS prod-deps
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Çalışma düzeni monorepo ile AYNI kalır: game-config `../../../config/*.json`
# okur ve workspace paketleri node_modules içinde sembolik bağdır.
COPY --from=prod-deps /app/package.json ./
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/config config
COPY --from=build /app/packages/game-config/package.json packages/game-config/
COPY --from=build /app/packages/game-config/dist packages/game-config/dist
COPY --from=build /app/packages/shared-types/package.json packages/shared-types/
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 4000
# Canlılık: süreç yanıt veriyor mu (bağımlılık sorgulamaz). Hazırlık için
# orkestratör /api/v1/health/ready kullanır.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health >/dev/null || exit 1
CMD ["node", "apps/api/dist/main.js"]
