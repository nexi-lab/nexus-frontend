# Nexus Frontend - Production Dockerfile
# Multi-stage build: Build with Node.js, serve with Nginx

# ============================================
# Stage 1: Build the React application
# ============================================
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --prefer-offline --no-audit

# Copy application source
COPY . .

# Build argument for backend API URL (can be overridden at build time)
ARG VITE_NEXUS_API_URL=http://localhost:8080
ARG VITE_LANGGRAPH_API_URL=http://localhost:2024
ARG VITE_NEXUS_SERVER_URL=http://nexus:8080

# Create environment file for Docker build (overrides any local env files)
RUN echo "VITE_NEXUS_API_URL=${VITE_NEXUS_API_URL}" > .env.production.local && \
    echo "VITE_LANGGRAPH_API_URL=${VITE_LANGGRAPH_API_URL}" >> .env.production.local && \
    echo "VITE_NEXUS_SERVER_URL=${VITE_NEXUS_SERVER_URL}" >> .env.production.local

# Build the application
RUN npm run build

# ============================================
# Stage 2: Serve with Nginx
# ============================================
FROM nginx:alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user for security
RUN addgroup -g 1000 -S nexus && \
    adduser -u 1000 -S nexus -G nexus && \
    chown -R nexus:nexus /usr/share/nginx/html && \
    chown -R nexus:nexus /var/cache/nginx && \
    chown -R nexus:nexus /var/log/nginx && \
    chown -R nexus:nexus /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nexus:nexus /var/run/nginx.pid

# Switch to non-root user
USER nexus

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
