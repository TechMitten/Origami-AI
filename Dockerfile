# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Install all dependencies (including devDependencies like 'vite')
# We need 'vite' because server.ts uses a static import for it in strict ESM mode
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build the application
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

# In production, we only need basic node environment since rendering is client-side
ENV NODE_ENV=production
ENV PORT=3000

# Copy package.json and node_modules from deps, then prune dev dependencies
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --production
COPY --from=builder /app/dist ./dist
COPY public ./public
COPY server.ts ./
# Copy config files just in case tsx/vite needs them for resolution
COPY tsconfig*.json ./
COPY vite.config.ts ./

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
