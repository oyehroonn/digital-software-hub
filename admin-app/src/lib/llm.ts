/**
 * Shared LLM client for the AI-selling features (Daily Briefing, Lead Summary,
 * Bulk SEO, Churn predictor). Talks the OpenAI-compatible chat/completions API.
 *
 * The LLM is an UNSTABLE backend (per the resilience contract): it may time out,
 * 500, or be entirely offline. Every function here is defensive — `chat()` and
 * `chatJson()` reject with a clean Error on failure so callers can render a
 * "AI unavailable" state instead of crashing; `ping()` never throws.
 *
 * Endpoint routing: we try the VPS LLM proxy (`{vps_base}/api/llm/...`) and the
 * direct codex-proxy (`{codex_base}/...`) in turn, remembering whichever
 * answered first so subsequent calls skip the dead route. All calls go through
 * the Tauri http bridge (rpc) to dodge CORS and keep the key out of the bundle.
 */
import { httpGet, httpPost } from "./rpc";
import type { AppConfig } from "./config";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Ask the backend for a strict JSON object response when supported. */
  json?: boolean;
}

/** Candidate chat/completions endpoints, in preference order. */
function endpoints(cfg: AppConfig): { url: string; auth: boolean }[] {
  const list: { url: string; auth: boolean }[] = [];
  const codex = (cfg.codex_base ?? "").trim().replace(/\/$/, "");
  const vps = (cfg.vps_base ?? "").trim().replace(/\/$/, "");
  // codex-proxy is the primary known-good OpenAI-compatible surface…
  if (codex) list.push({ url: `${codex}/chat/completions`, auth: true });
  // …with the VPS LLM proxy as an alternate route.
  if (vps) list.push({ url: `${vps}/api/llm/chat/completions`, auth: true });
  return list;
}

// Remember which endpoint answered last so we don't re-probe a dead route.
let _preferred: string | null = null;

function headersFor(cfg: AppConfig, auth: boolean): Record<string, string> | undefined {
  if (auth && cfg.codex_key) return { Authorization: `Bearer ${cfg.codex_key}` };
  return undefined;
}

function extractContent(text: string): string {
  const data = JSON.parse(text) as unknown;
  const obj = (data ?? {}) as Record<string, unknown>;
  // OpenAI shape: choices[0].message.content
  const choices = obj.choices as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(choices) && choices.length) {
    const msg = choices[0].message as Record<string, unknown> | undefined;
    const content = (msg?.content ?? choices[0].text) as unknown;
    if (typeof content === "string" && content.trim()) return content;
  }
  // Some proxies return { content } or { message } directly.
  for (const k of ["content", "message", "output", "response"]) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  // An error payload — surface it.
  const err = obj.error as Record<string, unknown> | string | undefined;
  if (err) throw new Error(typeof err === "string" ? err : String(err.message ?? "LLM error"));
  throw new Error("LLM returned no content");
}

/**
 * Send a chat completion. Resolves with the assistant's text; rejects with a
 * clean Error if every candidate endpoint fails.
 */
export async function chat(
  cfg: AppConfig,
  messages: LlmMessage[],
  opts: LlmOptions = {},
): Promise<string> {
  const { temperature = 0.4, maxTokens = 1200, timeoutMs = 45000, json = false } = opts;
  const model = cfg.codex_model || "gpt-5.4";
  const body = JSON.stringify({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(json ? { response_format: { type: "json_object" } } : {}),
  });

  const routes = endpoints(cfg);
  if (routes.length === 0) throw new Error("No LLM endpoint configured (set codex/VPS base in Settings)");

  // Try the last-known-good route first.
  const ordered = _preferred
    ? [...routes].sort((a, b) => (a.url === _preferred ? -1 : b.url === _preferred ? 1 : 0))
    : routes;

  let lastErr: unknown;
  for (const route of ordered) {
    try {
      const text = await httpPost(route.url, body, "application/json", {
        timeoutMs,
        headers: headersFor(cfg, route.auth),
      });
      const content = extractContent(text);
      _preferred = route.url;
      return content.trim();
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(lastErr instanceof Error ? lastErr.message : String(lastErr ?? "LLM unavailable"));
}

/** Strip ```json fences / prose and pull the first JSON object or array. */
function coerceJson(raw: string): unknown {
  let s = raw.trim();
  // Remove code fences.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    /* fall through to bracket extraction */
  }
  // Find the outermost {...} or [...].
  const first = Math.min(
    ...[s.indexOf("{"), s.indexOf("[")].filter((i) => i >= 0).concat(Infinity),
  );
  const lastObj = s.lastIndexOf("}");
  const lastArr = s.lastIndexOf("]");
  const last = Math.max(lastObj, lastArr);
  if (Number.isFinite(first) && last > first) {
    try {
      return JSON.parse(s.slice(first, last + 1));
    } catch {
      /* give up */
    }
  }
  throw new Error("LLM did not return valid JSON");
}

/**
 * Chat, forcing a JSON response, and parse it into T. Tolerant of fenced /
 * prose-wrapped output. Rejects if the model or the parse fails.
 */
export async function chatJson<T>(
  cfg: AppConfig,
  messages: LlmMessage[],
  opts: LlmOptions = {},
): Promise<T> {
  const text = await chat(cfg, messages, { ...opts, json: true });
  return coerceJson(text) as T;
}

/**
 * Lightweight reachability probe (≤ ~2.5s per route). Never throws — returns
 * true if any candidate LLM endpoint's /models list is reachable.
 */
export async function ping(cfg: AppConfig): Promise<boolean> {
  const codex = (cfg.codex_base ?? "").trim().replace(/\/$/, "");
  const vps = (cfg.vps_base ?? "").trim().replace(/\/$/, "");
  const probes: { url: string; auth: boolean }[] = [];
  if (codex) probes.push({ url: `${codex}/models`, auth: true });
  if (vps) probes.push({ url: `${vps}/api/llm/models`, auth: true });
  for (const p of probes) {
    try {
      await httpGet(p.url, { timeoutMs: 2500, headers: headersFor(cfg, p.auth) });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}
