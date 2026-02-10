FROM oven/bun:1-alpine
   WORKDIR /app
   RUN apk add --no-cache sqlite
   COPY package.json bun.lock ./
   RUN bun install --frozen-lockfile
   COPY . .
   RUN mkdir -p /data /models
   ENV GNO_HOST=0.0.0.0
   ENV GNO_MODEL_CACHE_DIR=/models
   ENV NODE_ENV=production
   EXPOSE 3000
   CMD ["bun", "run", "src/index.ts", "serve", "--port", "3000"]