# Multi-stage (simple) Next.js build + runtime
FROM node:20-alpine AS base
ENV NODE_ENV=production
WORKDIR /app

# Install deps first (leverage Docker layer cache)
# Copy only package manifests if present
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./


# Install dependencies
RUN npm install --legacy-peer-deps
# Copy the rest of the app
COPY . .

# Runtime
EXPOSE 3000
# Use npm "start" (expected to be Next.js start) to serve the built app
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
