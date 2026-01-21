FROM node:20-bullseye

# Install FFmpeg and Google Chrome dependencies
# We use chromium instead of chrome-stable for easier compatibility
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip installing Chrome (we use the installed Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the Typescript server and Vite frontend
RUN npm run build

# Expose port (Railway will override this with its own PORT env var, but 8080 is standard)
EXPOSE 8080

# Start server
# Since "npm run dev" uses tsx watch, we want a production start.
# "tsx" is in dependencies, so we can use it directly or via npx
ENV NODE_ENV=production
ENV PORT=8080

CMD ["npx", "tsx", "server.ts"]
