FROM node:20-alpine AS builder

WORKDIR /app

# Copia solo los manifiestos primero (cache de dependencias)
COPY package*.json prisma ./

# Instala dependencias de producción
RUN npm ci

# Copia el resto del código
COPY . .

# Genera el cliente de Prisma (usa tu schema.prisma y env)
RUN npx prisma generate

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
# Arranque (ajusta si tu entrypoint es otro)
CMD ["npm", "run", "start"]
