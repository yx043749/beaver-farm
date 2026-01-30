FROM node:18-alpine

WORKDIR /app

# 复制整个项目
COPY . .

# 创建必要的目录
RUN mkdir -p data data_backups logs

EXPOSE 3000

CMD ["node", "backend/server.js"]