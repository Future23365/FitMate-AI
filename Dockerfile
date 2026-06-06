# syntax=docker/dockerfile:1

# FitMate AI 的容器构建文件。
# runner target 只运行 Next.js standalone 产物；ops target 保留 Prisma CLI 和运维脚本，用于迁移、seed、刷新 embedding。

FROM node:22-alpine AS base

# /app 是容器内统一工作目录，Next.js standalone 的 server.js 也会从这里启动。
WORKDIR /app

# 关闭 Next.js telemetry，避免生产容器产生无关外部上报。
ENV NEXT_TELEMETRY_DISABLED=1

# libc6-compat / openssl 为 Alpine 环境下部分 Node 原生依赖和 Prisma 运行提供兼容库。
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps

# package-lock.json 表示当前项目使用 npm；先单独复制依赖清单以复用 Docker layer cache。
COPY package.json package-lock.json ./

# npm ci 严格按 lockfile 安装依赖，保证 CI/CD 与本地依赖版本一致。
RUN npm ci

FROM deps AS builder

# 构建阶段需要完整源码、Prisma schema、动作 seed 数据和本地动作图片目录。
COPY . .

# Prisma Client 是服务端数据库访问边界，必须在 next build 前生成。
RUN npx prisma generate

# 生成 .next/standalone；服务器只运行构建产物，不在低配服务器上执行 next build。
RUN npm run build

FROM base AS runner

# production 让 Next.js 和本地匿名 auth 使用生产语义；PORT/HOSTNAME 对齐 standalone server.js。
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 小内存服务器保守限制 V8 heap，避免单个 app 容器抢占过多内存。
ENV NODE_OPTIONS=--max-old-space-size=512

# 非 root 用户运行应用，降低容器逃逸或文件误写风险。
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# public 是 Next.js 静态资源目录。
COPY --from=builder /app/public ./public

# standalone 已包含生产运行所需的 server.js 和最小 Node 依赖。
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# .next/static 是客户端 chunk 和静态构建产物。
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 动作图片默认由站内 /api/exercise-images 读取；服务器也可以用 volume 覆盖这个目录。
COPY --from=builder --chown=nextjs:nodejs /app/exercises_picture ./exercises_picture

USER nextjs

# app 容器只在 Docker 内部网络暴露 3000，由 Caddy 对外代理 80/443。
EXPOSE 3000

# standalone 启动入口由 Next.js 构建生成。
CMD ["node", "server.js"]

FROM deps AS ops

# ops 镜像不接公网流量，只在服务器上执行 Prisma migration、seed 和 embedding 刷新。
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 运维命令需要源码中的 prisma/、scripts/、data/ 和 package.json scripts。
COPY . .

# 让 ops 镜像内的 Prisma CLI 和脚本使用同一份生成后的 Prisma Client。
RUN npx prisma generate

# 默认命令只应用已提交 migration；seed 和 refresh 通过 docker compose 的独立服务显式执行。
CMD ["npx", "prisma", "migrate", "deploy"]
