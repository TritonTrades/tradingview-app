# Use Node 18 with Chromium pre-installed
FROM ghcr.io/puppeteer/puppeteer:21.6.1

# Set working directory
WORKDIR /app

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma Client (this doesn't need DATABASE_URL)
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Build Next.js (DATABASE_URL not needed for build)
RUN npm run build

# Expose port
EXPOSE 3000

# Run migrations and start the app (DATABASE_URL available at runtime)
CMD npx prisma migrate deploy && npm start