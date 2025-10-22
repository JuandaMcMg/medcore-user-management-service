# ---- build ----
FROM node:20-alpine AS builder
WORKDIR /app

# OpenSSL para Alpine (musl + OpenSSL 3)
RUN apk add --no-cache openssl

# Copiamos lo mínimo para cache de deps
COPY package*.json prisma ./
ENV NODE_ENV=production

# Si hay package-lock consistente, usa ci; si no, fallback a install
RUN npm ci || npm install

# Copia el resto del código
COPY . .

# Limpia solo engines viejos (no toco tu output)
RUN rm -rf node_modules/.prisma .prisma

# **IMPORTANTE**: Prisma ya tiene en el schema:
#   output = "../src/generated/prisma"
# Eso resuelve a /app/src/generated/prisma (correcto)
RUN npx prisma generate

# Verificación: debe existir el cliente en la ruta esperada
RUN ls -la /app/src/generated || true \
 && ls -la /app/src/generated/prisma || true \
 && test -f /app/src/generated/prisma/index.js

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# OpenSSL también en runtime
RUN apk add --no-cache openssl

COPY --from=builder /app ./
CMD ["npm","run","start"]
