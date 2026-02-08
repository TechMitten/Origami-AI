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

# Copy node_modules from deps - keep all including vite for static import
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node public ./public
COPY --chown=node:node server.ts ./
# Copy config files just in case tsx/vite needs them for resolution
COPY --chown=node:node tsconfig*.json ./
COPY --chown=node:node vite.config.ts ./

EXPOSE 3000

USER node

CMD ["npx", "tsx", "server.ts"]
