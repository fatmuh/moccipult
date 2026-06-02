FROM node:20-alpine

LABEL maintainer="Moccipult"
LABEL description="Moccipult — Self-hosted code push for Flutter"

# Install dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production

# Copy source code
COPY src/ ./src/

# Create data directory
RUN mkdir -p /app/data

# Runtime defaults (override via env_file / env vars)
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/patches.db

# Expose port
EXPOSE 3000

# Health check — generous start period for slow environments
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# Run the server
CMD ["node", "src/server.js"]
