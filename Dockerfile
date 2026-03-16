# ===== 构建阶段 =====
FROM node:22-bullseye AS builder

# 设置时区
ENV TZ=Asia/Shanghai

WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npx next build
# ===== 运行阶段 =====
FROM node:22-bullseye AS runner

# 设置时区
ENV TZ=Asia/Shanghai
RUN apt-get update && apt-get install -y tzdata && \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1
# ENTRYPOINT ["/entrypoint.sh"]
