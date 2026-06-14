// Client-safe pipeline utilities and shared types
export type Stage =
  | "queued"
  | "researching"
  | "writing"
  | "voiceover"
  | "footage"
  | "rendering"
  | "done"
  | "error";

export interface ScriptSection {
  id: number;
  section_type: string;
  narration: string;
  visual_keywords: string[];
}

export interface Script {
  sections: ScriptSection[];
  mood?: string;
}

export interface Clip {
  id: number;
  keyword: string;
  thumbUrl: string;
  videoUrl: string;
  source: string;
  externalId: string;
  duration: number;
  status: "pending" | "ready" | "failed" | "skipped" | "downloading";
  localPath?: string;
}

export interface RenderStep {
  id: string;
  label: string;
  done: boolean;
}

export interface Job {
  id: string;
  title: string;
  voice: string;
  length: string;
  theme: string;
  background: string;
  mode: string;
  stage: Stage;
  progress: number;
  message?: string;
  script?: Script | null;
  clips?: Clip[] | null;
  renderSteps?: RenderStep[] | null;
  renderProgress?: number | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  errorMessage?: string | null;
}

async function handleJsonResponse(res: Response) {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function createJob(opts: {
  topic: string;
  voice: string;
  length: string;
  theme: string;
  background: string;
  mode: string;
}): Promise<string> {
  const res = await fetch(`/api/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: opts.topic,
      voice: opts.voice,
      length: opts.length,
      theme: opts.theme,
      background: opts.background,
      mode: opts.mode,
    }),
  });
  const data = await handleJsonResponse(res);
  return data.id as string;
}

export async function fetchJob(jobId: string): Promise<Job> {
  const res = await fetch(`/api/videos/${encodeURIComponent(jobId)}`);
  const data = await handleJsonResponse(res);
  return data as Job;
}
// Client-safe pipeline utilities and shared types
export type Stage =
  | "queued"
  | "researching"
  | "writing"
  | "voiceover"
  | "footage"
  | "rendering"
  | "done"
  | "error";

export interface ScriptSection {
  id: number;
  section_type: string;
  narration: string;
  visual_keywords: string[];
}

export interface Script {
  sections: ScriptSection[];
  mood?: string;
}

export interface Clip {
  id: number;
  keyword: string;
  thumbUrl: string;
  videoUrl: string;
  source: string;
  externalId: string;
  duration: number;
  status: "pending" | "ready" | "failed" | "skipped" | "downloading";
  localPath?: string;
}

export interface RenderStep {
  id: string;
  label: string;
  done: boolean;
}

export interface Job {
  id: string;
  title: string;
  voice: string;
  length: string;
  theme: string;
  background: string;
  mode: string;
  stage: Stage;
  progress: number;
  message?: string;
  script?: Script | null;
  clips?: Clip[] | null;
  renderSteps?: RenderStep[] | null;
  renderProgress?: number | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  errorMessage?: string | null;
}

async function handleJsonResponse(res: Response) {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function createJob(opts: {
  topic: string;
  voice: string;
  length: string;
  theme: string;
  background: string;
  mode: string;
}): Promise<string> {
  const res = await fetch(`/api/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: opts.topic,
      voice: opts.voice,
      length: opts.length,
      theme: opts.theme,
      background: opts.background,
      mode: opts.mode,
    }),
  });
  const data = await handleJsonResponse(res);
  return data.id as string;
}

export async function fetchJob(jobId: string): Promise<Job> {
  const res = await fetch(`/api/videos/${encodeURIComponent(jobId)}`);
  const data = await handleJsonResponse(res);
  return data as Job;
}
