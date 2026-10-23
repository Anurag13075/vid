FROM node:22-alpine

# Install FFmpeg and required fonts on Alpine (lightweight: only ~35MB added)
RUN apk add --no-cache ffmpeg ttf-dejavu

WORKDIR /app

# Disable pnpm minimum-release-age supply-chain quarantine check
ENV PNPM_CONFIG_MINIMUM_RELEASE_AGE=0

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package manifests & npm config first for efficient docker caching
COPY package.json pnpm-lock.yaml* .npmrc* ./

# Configure pnpm and install dependencies
RUN pnpm config set minimum-release-age 0 && pnpm install

# Copy project source
COPY . .

# Build the frontend and compile TypeScript
RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# Run unified production server (serves both API & Frontend SPA on single port)
CMD ["npx", "tsx", "server/prod.ts"]
