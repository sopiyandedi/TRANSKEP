FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fontconfig \
    fonts-dejavu-core \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# Opsional: muat font Plus Jakarta Sans untuk tipografi identik Chrome
RUN mkdir -p /app/fonts /app/assets && \
    (curl -fsSL "https://github.com/tokotype/PlusJakartaSans/raw/master/fonts/ttf/PlusJakartaSans-Bold.ttf" -o /app/fonts/PlusJakartaSans-Bold.ttf || true) && \
    (curl -fsSL "https://github.com/tokotype/PlusJakartaSans/raw/master/fonts/ttf/PlusJakartaSans-ExtraBold.ttf" -o /app/fonts/PlusJakartaSans-ExtraBold.ttf || true)

COPY server.js ./

ENV PORT=3000
ENV ASSET_BASE_URL=https://sso.pa-indramayu.go.id/img
EXPOSE 3000

CMD ["node", "server.js"]