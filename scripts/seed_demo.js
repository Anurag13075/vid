import "dotenv/config";
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seed() {
  const script = {
    title: "The Complete History: Secrets of the Ancient World",
    description: "A comprehensive visual deep-dive exploring how ancient empires engineered monuments that survived millennia.",
    mood: "epic_cinematic",
    sections: [
      { id: 1, section_type: "intro", title: "The Dawn of Empires", duration: 45, key_point: "Foundations of Civilization", narration: "Throughout human history, monumental achievements have risen from the sands of time, shaping the destiny of civilizations..." },
      { id: 2, section_type: "scene_2", title: "Monuments of Eternity", duration: 50, key_point: "Colossal Engineering", narration: "From the colossal monoliths of Egypt to the aqueducts of Rome, engineering marvels defied the limitations of their era..." },
      { id: 3, section_type: "scene_3", title: "Trade & Scientific Exchange", duration: 50, key_point: "Crossroads of Innovation", narration: "Trade routes connected distant corners of the world, fostering exchanges of science, philosophy, and astronomical discoveries..." },
      { id: 4, section_type: "scene_4", title: "Rise & Fall of Powers", duration: 50, key_point: "Imperial Transformations", narration: "Yet with every golden age came periods of profound disruption. Conflicts and environmental shifts redrew the boundaries of empires..." },
      { id: 5, section_type: "scene_5", title: "The Renaissance of Knowledge", duration: 50, key_point: "Golden Age Revival", narration: "Preserved manuscripts and newfound navigational tools ignited an unprecedented revival of art, medicine, and human curiosity..." },
      { id: 6, section_type: "outro", title: "Echoes in the Modern World", duration: 45, key_point: "Timeless Legacy", narration: "Today, their legacy echoes through our modern cities, reminding us that every innovation stands on the shoulders of giants." }
    ]
  };

  const clips = Array.from({ length: 24 }).map((_, i) => ({
    id: i + 1,
    keyword: "cinematic ancient history architecture",
    status: "ready",
    duration: 12,
    thumbUrl: "/videos/demo/thumb.jpg",
    videoUrl: "/videos/demo/final.mp4",
    source: i % 2 === 0 ? "pexels" : "pixabay"
  }));

  const steps = [
    { id: "1", label: "Slicing sections into fast cuts", done: true },
    { id: "2", label: "Pre-rendering cuts with cinematic color grade", done: true },
    { id: "3", label: "Merging voiceover audio tracks", done: true },
    { id: "4", label: "Generating karaoke captions (ASS format)", done: true },
    { id: "5", label: "Chaining cuts with xfade transitions", done: true },
    { id: "6", label: "Mixing audio + burning captions + overlays", done: true },
    { id: "7", label: "Generating thumbnail", done: true }
  ];

  for (const id of ["demo", "showcase"]) {
    await pool.query(`
      INSERT INTO videos (
        id, title, voice, length, theme, background, mode, stage, progress, message,
        script, clips, render_steps, render_progress, video_url, thumbnail_url, duration_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        stage = EXCLUDED.stage,
        progress = EXCLUDED.progress,
        message = EXCLUDED.message,
        script = EXCLUDED.script,
        clips = EXCLUDED.clips,
        render_steps = EXCLUDED.render_steps,
        render_progress = EXCLUDED.render_progress,
        video_url = EXCLUDED.video_url,
        thumbnail_url = EXCLUDED.thumbnail_url,
        duration_seconds = EXCLUDED.duration_seconds
    `, [
      id,
      script.title,
      "Brian · Authoritative Male",
      "medium",
      "cinematic",
      "gradient_dark",
      "auto",
      "done",
      100,
      "Video updated and ready for YouTube export!",
      JSON.stringify(script),
      JSON.stringify(clips),
      JSON.stringify(steps),
      100,
      "/videos/demo/final.mp4",
      "/videos/demo/thumb.jpg",
      290
    ]);
    console.log("Seeded demo video into database with id:", id);
  }

  await pool.end();
  console.log("Seeding complete!");
}

seed().catch(console.error);
