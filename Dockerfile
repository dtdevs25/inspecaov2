# ==========================================
# Etapa 1: Build do Frontend (React/Vite)
# ==========================================
FROM node:20-alpine AS build-frontend
WORKDIR /app

# Instala dependências e faz o build do Vite
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
# Gerar prisma client aqui também pode ser feito para ter os tipos se o frontend usar
RUN npx prisma generate
RUN npm run build

# ==========================================
# Etapa 2: Build do Backend (Node.js/Express)
# ==========================================
FROM node:20-alpine AS build-backend
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npx prisma generate
# Compila o backend se usarmos tsup/tsc. Como é tsx, podemos rodar direto, 
# mas em produção compilado é melhor. 
# Para simplificar, rodaremos com tsx em prod ou tsup build se configurado.
# Como o CapRover suporta execução rápida, instalaremos as libs de prod.

# ==========================================
# Etapa 3: Produção Final
# ==========================================
FROM node:20-alpine AS production
WORKDIR /app

# Instala LibreOffice e dependências para conversão de PPTX -> PDF
# openjdk11-jre é recomendado para o libreoffice funcionar corretamente em algumas conversões
RUN apk add --no-cache \
    libreoffice \
    openjdk11-jre \
    ttf-dejavu \
    ttf-liberation \
    fontconfig

# Variáveis de Ambiente esperadas do CapRover
ENV NODE_ENV=production
ENV PORT=80

# Copia dependências e código do backend
COPY --from=build-backend /app/package.json ./package.json
COPY --from=build-backend /app/package-lock.json ./package-lock.json
COPY --from=build-backend /app/node_modules ./node_modules
COPY --from=build-backend /app/prisma ./prisma
COPY --from=build-backend /app/server ./server
COPY --from=build-backend /app/logos ./logos
COPY --from=build-backend /app/tsconfig.json ./tsconfig.json

# Copia a pasta compilada do frontend
COPY --from=build-frontend /app/dist ./dist

# Expõe a porta 80
EXPOSE 80

# Agora com o comando Prisma db push garantimos que sempre que o CapRover deployar, ele atualizará a estrutura das tabelas no PostgreSQL.
# Inicia a API (que também serve a pasta dist)
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npx tsx server/index.ts"]
