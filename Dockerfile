FROM node:22-alpine

# Install FFmpeg and system fonts
RUN apk add --no-cache ffmpeg ttf-dejavu

WORKDIR /app

# Install stable pnpm v9 (LTS) - avoids pnpm 10 build script blocking
RUN npm install -g pnpm@9.15.5

# Copy package manifests & npm config first
COPY package.json pnpm-lock.yaml* .npmrc* ./

# Install dependencies
RUN pnpm install

# Copy project source
COPY . .

# Build the frontend and compile TypeScript
RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# Run unified production server (serves both API & Frontend SPA on single port)
CMD ["npx", "tsx", "server/prod.ts"]
