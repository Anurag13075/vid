# Backend Setup Guide

## Installation & Configuration

### 1. Install NPM Dependencies
```bash
npm install
# or
pnpm install
```

### 2. System Dependencies Required
The backend requires these external tools to be installed on your system:

#### FFmpeg (for video processing)
- **Windows**: Download from https://ffmpeg.org/download.html or `choco install ffmpeg`
- **macOS**: `brew install ffmpeg`
- **Linux**: `sudo apt-get install ffmpeg`

Verify: `ffmpeg -version`

#### edge-tts (for text-to-speech)
- **Windows**: `pip install edge-tts`
- **macOS**: `pip install edge-tts`
- **Linux**: `pip install edge-tts`

Requires Python 3.7+

Verify: `edge-tts --help`

### 3. Environment Variables
Create/update `.env` file with:
```
API_PORT=3001
DATABASE_URL=postgresql://...your-db-connection...
GROQ_API_KEY=your_groq_key
PEXELS_API_KEY=your_pexels_key
PIXABAY_API_KEY=your_pixabay_key
```

### 4. Database Setup
The database is automatically initialized on first server start via `initDb()` in `db.ts`

### 5. Run the Server

**Development:**
```bash
bun run index.ts
# or
npm run dev:api
```

**Production:**
```bash
npm run build
npm start
```

## Backend Architecture

### Core Files
- `index.ts` - Express server setup & SSE endpoints
- `db.ts` - PostgreSQL connection pool & queries
- `routes/videos.ts` - REST API routes for video CRUD

### Pipeline (`pipeline/`)
- `orchestrator.ts` - Main video generation workflow
- `scriptGenerator.ts` - AI script generation with Groq
- `voiceover.ts` - Text-to-speech with edge-tts
- `footageAgent.ts` - Footage search (Pexels/Pixabay)
- `assembler.ts` - FFmpeg video composition
- `queue.ts` - Job queue & SSE event emitter
- `types.ts` - TypeScript type definitions

## API Endpoints

### Videos
- `POST /api/videos` - Create video job
- `GET /api/videos` - List videos
- `GET /api/videos/:id` - Get video status
- `DELETE /api/videos/:id` - Cancel video job

### Pipeline Status
- `GET /api/pipeline/:id/status` - SSE stream for real-time progress

### Health
- `GET /api/health` - Health check

## Troubleshooting

**"Command not found: ffmpeg"**
- Ensure FFmpeg is installed and in your PATH
- Windows: Add FFmpeg bin directory to PATH environment variable

**"edge-tts: command not found"**
- Verify Python is installed (`python --version`)
- Reinstall edge-tts: `pip install --upgrade edge-tts`

**Database connection errors**
- Verify DATABASE_URL is correct
- Check network connectivity if using remote PostgreSQL
- Ensure Neon database account is active

**Type errors when compiling**

- Run: `npx tsc --noEmit` to check
- All TypeScript should compile without errors
