# Usa uma imagem oficial do Node.js estável
FROM node:22-alpine

# Define a pasta de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as dependências de produção
RUN npm install

# Copia o restante do código do backend
COPY . .

# Expõe a porta que o seu backend usa (pelo seu README, é a 3001)
EXPOSE 3001

# Comando para iniciar a aplicação
CMD ["npm", "start"]
