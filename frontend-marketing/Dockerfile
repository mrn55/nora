FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
RUN --mount=from=builder,source=/app,target=/build \
    cp /build/next.config.js . 2>/dev/null || true && \
    cp -r /build/public ./public 2>/dev/null || true
EXPOSE 3000
CMD ["npm", "start"]
