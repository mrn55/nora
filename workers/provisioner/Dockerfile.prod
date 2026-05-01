FROM node:24-alpine AS deps
WORKDIR /app
COPY workers/provisioner/package.json workers/provisioner/package-lock.json* ./
RUN npm ci || npm install

FROM node:24-alpine AS builder
WORKDIR /app
COPY tsconfig.base.json /tsconfig.base.json
COPY --from=deps /app/node_modules ./node_modules
COPY workers/provisioner/ ./
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_PATH=/app/node_modules
COPY workers/provisioner/package.json workers/provisioner/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY agent-runtime /agent-runtime
COPY backend-api /backend-api
RUN cd /backend-api && (npm ci --omit=dev || npm install --omit=dev)
CMD ["npm", "start"]
