# Stage 1: Dependencies
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
# Install all dependencies (including devDependencies like 'vite')
# We need 'vite' because server.ts uses a static import for it in strict ESM mode
RUN npm ci

# Stage 2: Builder
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build the application
RUN npm run build

# Stage 3: Runner
FROM node:20-slim AS runner
WORKDIR /app

# Install runtime system dependencies
# We use chromium instead of chrome-stable for easier compatibility
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=3000

# Copy necessary files from previous stages
COPY package*.json ./
# Copying all node_modules to ensure 'vite' and 'tsx' are available
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY public ./public
COPY server.ts ./
# Copy config files just in case tsx/vite needs them for resolution
COPY tsconfig*.json ./
COPY vite.config.ts ./

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
