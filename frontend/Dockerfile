# Etapa 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Instala ferramentas necessárias e aumenta limites de memória
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev

COPY package*.json ./

# Usa yarn (mais eficiente que npm com monorepos e resolutions)
RUN corepack enable && corepack prepare yarn@stable --activate
RUN yarn install --network-timeout 100000


COPY . .

# Build com memória aumentada
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Etapa 2: Runtime
FROM node:22-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/build ./build

EXPOSE 3000

CMD ["serve", "-s", "build", "-l", "3000"]
