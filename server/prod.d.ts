/**
 * Unified production server — single process, single port.
 * Express handles /api/* and /videos/*; everything else serves dist/index.html.
 * Run with: tsx server/prod.ts
 */
import "dotenv/config";
