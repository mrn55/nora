FROM node:24-alpine AS deps
WORKDIR /app
COPY backend-api/package.json backend-api/package-lock.json* ./
RUN npm ci || npm install

FROM node:24-alpine AS builder
WORKDIR /app
COPY tsconfig.base.json /tsconfig.base.json
COPY --from=deps /app/node_modules ./node_modules
COPY backend-api/ ./
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
COPY backend-api/package.json backend-api/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY agent-runtime /agent-runtime
COPY workers/provisioner/backends /app/backends
EXPOSE 4000
CMD ["npm", "start"]
