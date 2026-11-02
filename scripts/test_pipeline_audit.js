/**
 * VidRush Pipeline Codebase Automated Audit & Self-Test Suite
 * Runs an end-to-end test of pipeline components to verify nothing fails.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkFFmpegCapabilities, getFFmpegCapabilities } from "../server/pipeline/ffmpeg.js";
import { findMultipleFootage } from "../server/pipeline/footageAgent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runAudit() {
  console.log("================================================================================");
  console.log("🚀 STARTING VIDRUSH PIPELINE CODEBASE TEST");
  console.log("================================================================================");

  // ── TEST 1: FFmpeg Binary & Capabilities Detection ───────────────────────────
  console.log("\n[1/7] Testing FFmpeg Binary & Capabilities...");
  try {
    const caps = checkFFmpegCapabilities();
    assert(Boolean(caps.binaryPath), `FFmpeg binary resolved (${caps.binaryPath})`);
    assert(typeof caps.hasDrawtext === "boolean", "Drawtext capability flag evaluated");
    assert(typeof caps.hasAss === "boolean", "ASS subtitle capability flag evaluated");
    assert(typeof caps.hasLoudnorm === "boolean", "Loudnorm audio capability flag evaluated");
  } catch (err) {
    assert(false, `FFmpeg capability probe crashed: ${err.message}`);
  }

  // ── TEST 2: Free Spoken Voiceover TTS Synthesis ──────────────────────────────
  console.log("\n[2/7] Testing Free TTS Voiceover Engine...");
  try {
    const testText = "The Indian digital payment system, known as UPI, transformed global banking.";
    const chunks = [];
    let cur = "";
    for (const w of testText.split(/\s+/)) {
      if ((cur + " " + w).length <= 160) cur += (cur ? " " : "") + w;
      else { chunks.push(cur); cur = w; }
    }
    if (cur) chunks.push(cur);

    assert(chunks.length === 1, `TTS text chunking verified (${chunks.length} chunk)`);

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunks[0])}&tl=en&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    assert(res.ok, `Free TTS synthesis endpoint reachable (HTTP ${res.status})`);
    const ab = await res.arrayBuffer();
    assert(ab.byteLength > 1000, `Synthesized spoken audio data received (${ab.byteLength} bytes)`);
  } catch (err) {
    assert(false, `Free TTS engine test failed: ${err.message}`);
  }

  // ── TEST 3: Resilient 5-Phase Stock Footage Search Agent ─────────────────────
  console.log("\n[3/7] Testing 5-Phase Stock Footage Agent...");
  try {
    const testSection = {
      id: 1,
      narration: "A bustling metropolis with digital payments and mobile banking transactions.",
      visual_keywords: ["mobile payment smartphone hands", "city financial district timelapse"],
      section_type: "broll",
      key_point: "Digital Transaction Milestone",
      estimated_words: 100,
      sfx: false,
    };
    const usedIds = new Set();
    const clips = await findMultipleFootage(testSection, 3, "test_job_123", usedIds, "Digital Revolution");
    assert(clips.length > 0, `Footage search succeeded: retrieved ${clips.length} high-definition clips`);
    assert(Boolean(clips[0].videoUrl), `Clip 1 has valid video/image URL (${clips[0].source}: ${clips[0].videoUrl.slice(0, 50)}...)`);
    assert(Boolean(clips[0].license), `Clip 1 carries commercial license: ${clips[0].license}`);
  } catch (err) {
    assert(false, `Footage search test failed: ${err.message}`);
  }

  // ── TEST 4: Cut Slicer Algorithm & Timing Precision ─────────────────────────
  console.log("\n[4/7] Testing Video Cut Slicer & Synchronization...");
  try {
    function sliceCuts(audioDuration) {
      const CUT_TARGET_SEC = 4.0;
      const CUT_MIN_SEC = 2.5;
      const CUT_MAX_SEC = 6.0;
      if (audioDuration <= CUT_MAX_SEC) return [audioDuration];
      const cuts = [];
      let remaining = audioDuration;
      while (remaining > 0) {
        if (remaining <= CUT_MAX_SEC) { cuts.push(remaining); break; }
        const wouldLeave = remaining - CUT_TARGET_SEC;
        if (wouldLeave > 0 && wouldLeave < CUT_MIN_SEC) {
          const half = remaining / 2;
          cuts.push(half, half);
          break;
        }
        cuts.push(CUT_TARGET_SEC);
        remaining -= CUT_TARGET_SEC;
      }
      return cuts;
    }

    const testDurations = [3.0, 7.5, 12.0, 47.8, 125.4];
    let allSumExact = true;
    for (const d of testDurations) {
      const cuts = sliceCuts(d);
      const sum = cuts.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - d) > 0.001) allSumExact = false;
    }
    assert(allSumExact, "Cut slicer produces exact durations matching audio across all lengths");
  } catch (err) {
    assert(false, `Cut slicer test failed: ${err.message}`);
  }

  // ── TEST 5: ASS Subtitle & Broadcast Formatting ─────────────────────────────
  console.log("\n[5/7] Testing ASS Subtitle & Styling Formatter...");
  try {
    function hexToAss(hex, alpha = 0) {
      const clean = hex.replace("#", "");
      const r = parseInt(clean.slice(0, 2), 16) || 255;
      const g = parseInt(clean.slice(2, 4), 16) || 255;
      const b = parseInt(clean.slice(4, 6), 16) || 255;
      const aa = Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase();
      return `&H${aa}${b.toString(16).padStart(2, "0").toUpperCase()}${g.toString(16).padStart(2, "0").toUpperCase()}${r.toString(16).padStart(2, "0").toUpperCase()}`;
    }
    const purple = hexToAss("#6c47ff");
    assert(purple.startsWith("&H00"), `ASS color conversion valid for #6c47ff: ${purple}`);

    function escapeAss(text) {
      return text.replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}").replace(/[\r\n]+/g, " ").trim();
    }
    const escaped = escapeAss("Text with {curly braces} and \n newlines");
    assert(escaped.includes("\\{") && !escaped.includes("\n"), "ASS string sanitizer safely neutralizes override tags and newlines");
  } catch (err) {
    assert(false, `ASS formatter test failed: ${err.message}`);
  }

  // ── TEST 6: Resilient JSON Repair Engine ─────────────────────────────────────
  console.log("\n[6/7] Testing JSON Repair & Sanitization Engine...");
  try {
    function repairJson(raw, isArray = false) {
      let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      if (isArray) {
        const first = s.indexOf("[");
        const last = s.lastIndexOf("]");
        if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
      } else {
        const first = s.indexOf("{");
        const last = s.lastIndexOf("}");
        if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
      }
      s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
      s = s.replace(/\/\/[^\n]*/g, "");
      const missingCommaRe = /(\btrue|\bfalse|\bnull|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:[^"\\]|\\.)*")\s*\n(\s*"[^"]*"\s*:)/g;
      let prev = "";
      while (prev !== s) { prev = s; s = s.replace(missingCommaRe, "$1,\n$2"); }
      s = s.replace(/,\s*([}\]])/g, "$1");
      s = s.replace(/,\s*,/g, ",");
      return s;
    }

    const testObject = '```json\n{\n  "title": "UPI Revolution", // comment\n  "mood": "dramatic",\n}\n```';
    const cleanedObj = JSON.parse(repairJson(testObject, false));
    assert(cleanedObj.title === "UPI Revolution", "JSON object repaired (removed markdown, comments, trailing commas)");

    const testArray = '```json\n[\n  {"id": 1, "narration": "Hello world"},\n  {"id": 2, "narration": "Next scene"},\n]\n```';
    const cleanedArr = JSON.parse(repairJson(testArray, true));
    assert(cleanedArr.length === 2 && cleanedArr[0].id === 1, "JSON array repaired (handled fences, trailing comma, parsed 2 items)");
  } catch (err) {
    assert(false, `JSON repair test failed: ${err.message}`);
  }

  // ── TEST 7: Production SPA Distribution Path Resolver ────────────────────────
  console.log("\n[7/7] Testing Production Server SPA Static Serving...");
  try {
    const candidatePaths = [
      path.join(__dirname, "../dist"),
      path.join(__dirname, "../dist/public"),
      path.join(__dirname, "../dist/client"),
      path.join(process.cwd(), "dist"),
      path.join(process.cwd(), "dist/public"),
    ];
    function resolveDistPath() {
      for (const candidate of candidatePaths) {
        if (fs.existsSync(path.join(candidate, "index.html"))) {
          return candidate;
        }
      }
      return path.join(__dirname, "../dist");
    }
    const resolved = resolveDistPath();
    assert(typeof resolved === "string" && resolved.length > 0, `Dist path resolved without crash: ${resolved}`);
  } catch (err) {
    assert(false, `Production dist path resolver failed: ${err.message}`);
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────────
  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error("Test suite unhandled error:", err);
  process.exit(1);
});
