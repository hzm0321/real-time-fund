# ===== 构建阶段（Alpine 减小体积）=====
# 未传入的 build-arg 使用占位符，便于运行阶段用环境变量替换
# Supabase 构建时会校验 URL，故使用合法占位 URL，运行时再替换
FROM node:22-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL=https://runtime-replace.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=__NEXT_PUBLIC_SUPABASE_ANON_KEY__
ARG NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY=__NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY__
ARG NEXT_PUBLIC_GA_ID=__NEXT_PUBLIC_GA_ID__
ARG NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL=__NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL__
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY=$NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY
ENV NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID
ENV NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL=$NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npx next build

# ===== 运行阶段（仅静态资源 + nginx，启动时替换占位符）=====
FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html

COPY --from=builder /app/out .
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1
ENTRYPOINT ["/entrypoint.sh"]
