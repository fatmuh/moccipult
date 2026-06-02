FROM node:20-alpine

LABEL maintainer="Self-Hosted Shorebird"
LABEL description="Shorebird Code Push Patch Server"

# Install dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production

# Copy source code
COPY src/ ./src/

# Create data and storage directories
RUN mkdir -p /app/data /app/patches-storage

# Environment defaults
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/patches.db
ENV STORAGE_PATH=/app/patches-storage
ENV SERVER_URL=http://localhost:3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Run the server
CMD ["node", "src/server.js"]
