# Usa uma imagem oficial do Python slim
FROM python:3.11-slim

# Define a pasta de trabalho dentro do container
WORKDIR /app

# Instala dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copia o arquivo de requisitos
COPY requirements.txt .

# Instala as dependências de produção
RUN pip install --no-cache-dir -r requirements.txt

# Copia o restante do código do backend
COPY . .

# Expõe a porta 3001
EXPOSE 3001

# Comando para iniciar a aplicação
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "3001"]
