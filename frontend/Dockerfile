# Etapa 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev

COPY package*.json ./

RUN corepack enable && corepack prepare yarn@stable --activate
RUN yarn install --network-timeout 100000

COPY . .

# URL da API gravada no bundle em tempo de build
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Etapa 2: Runtime
FROM node:22-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/build ./build

EXPOSE 3000

CMD ["serve", "-s", "build", "-l", "3000"]
