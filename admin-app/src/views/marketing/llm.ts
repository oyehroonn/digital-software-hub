/**
 * codex-proxy (OpenAI-compatible) copy generator for the Marketing area — powers
 * the "draft with AI" buttons in the blast composer and A/B test manager.
 *
 * The proxy is an UNSTABLE backend: it may 500, time out, or be unconfigured.
 * Callers must treat a null return as "AI unavailable" and degrade to manual
 * entry — never block the UI on it.
 */
import { httpPost } from "@/lib/rpc";
import type { AppConfig } from "@/lib/config";

export interface CopyOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** Returns the model's text, or null if the proxy is unconfigured/unavailable. */
export async function generateCopy(
  cfg: AppConfig,
  prompt: string,
  opts: CopyOptions = {},
): Promise<string | null> {
  if (!cfg.codex_base || !cfg.codex_key) return null;
  const body = JSON.stringify({
    model: cfg.codex_model || "gpt-5.4",
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 500,
    messages: [
      {
        role: "system",
        content:
          opts.system ??
          "You are a senior B2B SaaS copywriter for DSM, a precision 3D software company. Write concise, outcome-led marketing copy. No emojis, no hype, plain English.",
      },
      { role: "user", content: prompt },
    ],
  });

  try {
    const text = await httpPost(`${cfg.codex_base}/chat/completions`, body, "application/json", {
      timeoutMs: opts.timeoutMs ?? 20000,
      headers: { Authorization: `Bearer ${cfg.codex_key}` },
    });
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
  } catch {
    return null;
  }
}
