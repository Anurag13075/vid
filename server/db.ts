import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Prevent unhandled errors on idle clients from crashing the entire Node process
pool.on("error", (err) => {
  console.warn("[db pool] Unexpected idle client error:", err.message);
});

export async function query(text: string, params?: unknown[], retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (err: any) {
      console.warn(`[db] Query attempt ${attempt} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

export async function initDb() {
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
  ];
  for (const sql of migrations) {
    await query(sql).catch(() => {});
  }

  console.log("DB initialized");
}

export async function getVideo(id: string) {
  const res = await query("SELECT * FROM videos WHERE id = $1", [id]);
  return res?.rows[0] || null;
}

export async function updateVideo(id: string, fields: Record<string, unknown>) {
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

export async function listVideos() {
  const res = await query(
    "SELECT id, title, stage, progress, message, video_url, thumbnail_url, duration_seconds, created_at FROM videos ORDER BY created_at DESC LIMIT 50"
  );
  return res?.rows || [];
}
