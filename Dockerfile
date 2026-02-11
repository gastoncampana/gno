FROM oven/bun:1-alpine
WORKDIR /app
RUN apk add --no-cache sqlite git
COPY package.json bun.lock ./
RUN git init && bun install --frozen-lockfile
COPY . .
RUN mkdir -p /data /models
ENV GNO_HOST=0.0.0.0
ENV GNO_MODEL_CACHE_DIR=/models
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "bun run src/index.ts init /data/vault --yes --tokenizer unicode61 2>/dev/null; bun run src/index.ts serve --port 3000"]
