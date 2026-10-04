# Etapa 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Instala ferramentas necessárias para compilar dependências nativas
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev

COPY package*.json ./

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

# Etapa 2: Runtime
FROM node:22-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/build ./build

EXPOSE 3000

CMD ["serve", "-s", "build", "-l", "3000"]
