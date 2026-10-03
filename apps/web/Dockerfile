# syntax=docker/dockerfile:1
# AT SEVDALISI web (02.10.2026, Faz 13-A). Kök dizinden derlenir:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.ornek/api/v1 -t at-sevdalisi-web .
# `NEXT_PUBLIC_*` değerleri DERLEME ANINDA pakete gömülür ve tarayıcıya gider —
# buraya ASLA gizli değer konmaz (yalnızca herkese açık adresler).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/game-config/package.json packages/game-config/
COPY packages/shared-types/package.json packages/shared-types/
RUN npm ci --ignore-scripts

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
COPY tsconfig.base.json ./
COPY config config
COPY packages packages
COPY apps/web apps/web
RUN npm run build:packages && npm run build --workspace=apps/web
RUN npm prune --omit=dev --ignore-scripts && mkdir -p apps/web/node_modules

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/config config
COPY --from=build /app/packages/game-config/package.json packages/game-config/
COPY --from=build /app/packages/game-config/dist packages/game-config/dist
COPY --from=build /app/packages/shared-types/package.json packages/shared-types/
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/apps/web/node_modules apps/web/node_modules
COPY --from=build /app/apps/web/package.json /app/apps/web/next.config.mjs apps/web/
COPY --from=build /app/apps/web/.next apps/web/.next
COPY --from=build /app/apps/web/public apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["npm", "run", "start", "--workspace=apps/web"]
