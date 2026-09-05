# Frontend Dockerfile

# Build stage
FROM node:22-alpine AS build

WORKDIR /app

# Allow overriding the API base URL at build time (Vite will pick up VITE_* env vars)
# Default is the backend service in compose network so the built app can call '/api' through nginx (or directly).
ARG VITE_API_BASE_URL=/api
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
