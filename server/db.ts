import pg from "pg";
import fs from "fs";
import { getDataDir } from "./pipeline/tempDir.js";

const { Pool } = pg;
const LOCAL_DB_PATH = getDataDir("db.json");

let useLocalJson = !process.env.DATABASE_URL;
let pool: pg.Pool | null = null;

if (!useLocalJson) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err) => {
      console.warn("[db pool] Unexpected idle client error:", err.message);
    });
  } catch (err: any) {
    console.warn("[db] Failed to create Postgres pool, switching to local JSON store:", err.message);
    useLocalJson = true;
  }
}

// Local JSON Store helpers
interface VideoRecord {
  id: string;
  title: string;
  voice: string;
  length: string;
  theme?: string;
  background?: string;
  mode?: string;
  stage: string;
  progress: number;
  message?: string;
  script?: any;
  clips?: any;
  render_steps?: any;
  render_progress?: number;
  video_url?: string;
  thumbnail_url?: string;
  short_video_url?: string;
  duration_seconds?: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

function ensureLocalDbFile(): Record<string, VideoRecord> {
  const dir = path.dirname(LOCAL_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify({}), "utf8");
    return {};
  }
  try {
    const raw = fs.readFileSync(LOCAL_DB_PATH, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function writeLocalDb(data: Record<string, VideoRecord>) {
  const dir = path.dirname(LOCAL_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

export async function query(text: string, params?: unknown[], retries = 3): Promise<any> {
  if (useLocalJson || !pool) return { rows: [] };
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (err: any) {
      console.warn(`[db] Query attempt ${attempt} failed: ${err.message}`);
      if (attempt === retries) {
        console.warn("[db] Switching to local JSON database due to repeated connection failure");
        useLocalJson = true;
        return { rows: [] };
      }
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
}

export async function initDb() {
  if (useLocalJson || !pool) {
    ensureLocalDbFile();
    console.log("[db] Using local embedded JSON database (data/db.json)");
    return;
  }

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        voice TEXT NOT NULL DEFAULT 'presenter_female',
        length TEXT NOT NULL DEFAULT 'medium',
        theme TEXT DEFAULT 'modern',
        background TEXT DEFAULT 'gradient_dark',
        mode TEXT DEFAULT 'auto',
        stage TEXT NOT NULL DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
        message TEXT DEFAULT '',
        script JSONB,
        clips JSONB,
        render_steps JSONB,
        render_progress INTEGER DEFAULT 0,
        video_url TEXT,
        thumbnail_url TEXT,
        short_video_url TEXT,
        duration_seconds INTEGER,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const migrations = [
      `ALTER TABLE videos ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'modern'`,
      `ALTER TABLE videos ADD COLUMN IF NOT EXISTS background TEXT DEFAULT 'gradient_dark'`,
      `ALTER TABLE videos ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'auto'`,
      `ALTER TABLE videos ADD COLUMN IF NOT EXISTS short_video_url TEXT`,
    ];
    for (const sql of migrations) {
      await query(sql).catch(() => {});
    }

    console.log("[db] PostgreSQL DB initialized");
  } catch (err: any) {
    console.warn("[db] Postgres init failed, falling back to local JSON store:", err.message);
    useLocalJson = true;
    ensureLocalDbFile();
  }
}

export async function getVideo(id: string): Promise<VideoRecord | null> {
  if (useLocalJson || !pool) {
    const db = ensureLocalDbFile();
    return db[id] || null;
  }
  const res = await query("SELECT * FROM videos WHERE id = $1", [id]);
  return res?.rows?.[0] || null;
}

export async function updateVideo(id: string, fields: Record<string, unknown>) {
  if (useLocalJson || !pool) {
    const db = ensureLocalDbFile();
    if (db[id]) {
      db[id] = {
        ...db[id],
        ...fields,
        updated_at: new Date().toISOString(),
      };
      writeLocalDb(db);
    }
    return;
  }

  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await query(
    `UPDATE videos SET ${setClause}, updated_at = NOW() WHERE id = $1`,
    [id, ...values]
  );
}

export async function createVideo(data: {
  id: string;
  title: string;
  voice: string;
  length: string;
  theme?: string;
  background?: string;
  mode?: string;
}) {
  if (useLocalJson || !pool) {
    const db = ensureLocalDbFile();
    db[data.id] = {
      id: data.id,
      title: data.title,
      voice: data.voice,
      length: data.length,
      theme: data.theme || "modern",
      background: data.background || "gradient_dark",
      mode: data.mode || "auto",
      stage: "queued",
      progress: 0,
      message: "Initializing pipeline...",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    writeLocalDb(db);
    return;
  }

  await query(
    `INSERT INTO videos (id, title, voice, length, theme, background, mode, stage, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', 'Initializing pipeline...')`,
    [
      data.id,
      data.title,
      data.voice,
      data.length,
      data.theme || "modern",
      data.background || "gradient_dark",
      data.mode || "auto",
    ]
  );
}

export async function listVideos(): Promise<any[]> {
  if (useLocalJson || !pool) {
    const db = ensureLocalDbFile();
    return Object.values(db).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
  const res = await query(
    "SELECT id, title, stage, progress, message, video_url, thumbnail_url, short_video_url, duration_seconds, created_at FROM videos ORDER BY created_at DESC LIMIT 50"
  );
  return res?.rows || [];
}
