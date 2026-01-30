#!/bin/bash

# 专注农场Docker部署脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 开始部署专注农场系统...${NC}"

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker未安装${NC}"
    echo "请先安装Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# 检查Docker Compose是否安装
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}警告: Docker Compose未安装，使用Docker命令部署${NC}"
    USE_COMPOSE=false
else
    USE_COMPOSE=true
fi

# 生成安全密钥
generate_secret() {
    openssl rand -base64 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1
}

# 创建数据目录
mkdir -p backend/users
mkdir -p data_backups

# 检查是否已有配置文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}创建环境配置文件...${NC}"
    cat > .env << EOF
# 专注农场环境配置
NODE_ENV=production
PORT=3000
SECRET_KEY=$(generate_secret)
EOF
    echo -e "${GREEN}环境配置文件已创建${NC}"
fi

# 加载环境变量
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# 构建镜像
echo -e "${GREEN}构建Docker镜像...${NC}"
docker build -t beaver-farm:latest .

if [ "$USE_COMPOSE" = true ]; then
    # 使用Docker Compose部署
    echo -e "${GREEN}使用Docker Compose启动服务...${NC}"
    docker-compose up -d
    
    echo -e "${GREEN}等待服务启动...${NC}"
    sleep 10
    
    # 检查服务状态
    if docker-compose ps | grep -q "Up"; then
        echo -e "${GREEN}✅ 服务启动成功！${NC}"
    else
        echo -e "${RED}❌ 服务启动失败${NC}"
        docker-compose logs
        exit 1
    fi
else
    # 使用Docker命令部署
    echo -e "${GREEN}使用Docker命令启动服务...${NC}"
    
    # 检查是否已有容器
    if docker ps -a --format '{{.Names}}' | grep -q "beaver-farm"; then
        echo -e "${YELLOW}停止并移除旧容器...${NC}"
        docker stop beaver-farm || true
        docker rm beaver-farm || true
    fi
    
    # 运行新容器
    docker run -d \
        --name beaver-farm \
        --restart unless-stopped \
        -p 12001:3000 \
        -e NODE_ENV=production \
        -e PORT=3000 \
        -e SECRET_KEY=${SECRET_KEY} \
        -v $(pwd)/backend/users:/app/backend/users \
        -v $(pwd)/backend/crops.json:/app/backend/crops.json:ro \
        -v $(pwd)/backend/recipes.json:/app/backend/recipes.json:ro \
        beaver-farm:latest
    
    echo -e "${GREEN}等待服务启动...${NC}"
    sleep 10
    
    # 检查容器状态
    if docker ps --format '{{.Names}}' | grep -q "beaver-farm"; then
        echo -e "${GREEN}✅ 服务启动成功！${NC}"
    else
        echo -e "${RED}❌ 服务启动失败${NC}"
        docker logs beaver-farm
        exit 1
    fi
fi

# 显示访问信息
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 专注农场部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}访问地址:${NC}"
echo -e "本地访问: ${GREEN}http://localhost:3000${NC}"
echo ""

# 获取本机IP
if command -v ip &> /dev/null; then
    IP=$(ip addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -n1)
elif command -v ifconfig &> /dev/null; then
    IP=$(ifconfig | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -n1)
fi

if [ ! -z "$IP" ]; then
    echo -e "局域网访问: ${GREEN}http://${IP}:3000${NC}"
    echo ""
fi

echo -e "${YELLOW}管理命令:${NC}"
if [ "$USE_COMPOSE" = true ]; then
    echo "查看日志: docker-compose logs -f"
    echo "停止服务: docker-compose down"
    echo "重启服务: docker-compose restart"
else
    echo "查看日志: docker logs -f beaver-farm"
    echo "停止服务: docker stop beaver-farm"
    echo "重启服务: docker restart beaver-farm"
fi
echo ""
echo -e "${YELLOW}数据备份:${NC}"
echo "用户数据保存在: backend/users/"
echo ""
echo -e "${GREEN}开始使用专注农场吧！${NC}"