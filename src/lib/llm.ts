/**
 * Browser-safe LLM client for the codex-proxy (OpenAI-compatible).
 *
 * SECURITY: the codex-proxy API key MUST NEVER appear in the frontend bundle.
 * This client only ever talks to a SAME-ORIGIN proxy route on the site's own
 * backend. That route is responsible for attaching `Authorization: Bearer
 * <key>` and forwarding to `https://open.techrealm.ai/v1`.
 *
 * ── Proxy route contract (server must implement) ────────────────────────────
 * Base path: `VITE_LLM_PROXY_BASE` (default `/api/llm`, relative → same origin).
 *
 *   GET  {base}/models
 *        → forwards to codex-proxy GET /v1/models. Used for health checks.
 *
 *   POST {base}/chat/completions
 *        Body: OpenAI chat-completions payload
 *              { model?, messages, temperature?, max_tokens?, stream? }
 *        The server:
 *          1. injects Authorization: Bearer <CODEX_PROXY_KEY>   (from server env)
 *          2. defaults `model` to `gpt-5.4` when omitted
 *          3. forwards to POST https://open.techrealm.ai/v1/chat/completions
 *          4. streams back verbatim (SSE) when stream:true
 *
 * The key lives ONLY in the server's environment (e.g. CODEX_PROXY_KEY), never
 * in Vite env (VITE_* is public) and never committed.
 */

import { LLM_PROXY_BASE } from './health';

export const DEFAULT_MODEL = import.meta.env.VITE_LLM_MODEL || 'gpt-5.4';

/** Default cap so a hung proxy can't wedge an AI feature. */
export const DEFAULT_LLM_TIMEOUT_MS = 20000;

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** abort the request after this many ms (default 20s) */
  timeoutMs?: number;
  /** caller-supplied signal, merged with the timeout */
  signal?: AbortSignal;
}

// Minimal shape of the OpenAI chat-completions response we consume.
interface ChatCompletionResponse {
  choices?: Array<{
    message?: { role?: string; content?: string };
    delta?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string } | string;
}

export class LLMError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LLMError';
    this.status = status;
  }
}

function proxyUrl(path: string): string {
  return `${LLM_PROXY_BASE.replace(/\/$/, '')}${path}`;
}

/** Merge an optional external signal with an internal timeout signal. */
function withTimeout(timeoutMs: number, external?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

/**
 * Non-streaming chat completion. Returns the assistant's text.
 * Throws {@link LLMError} on any failure — callers inside <AIFeature> should
 * catch and degrade gracefully.
 */
export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<string> {
  const { signal, cleanup } = withTimeout(
    opts.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
    opts.signal
  );

  try {
    const res = await fetch(proxyUrl('/chat/completions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        messages,
        temperature: opts.temperature ?? 0.4,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        stream: false,
      }),
      signal,
    });

    if (!res.ok) {
      throw new LLMError(`LLM proxy returned HTTP ${res.status}`, res.status);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    if (data.error) {
      const msg = typeof data.error === 'string' ? data.error : data.error.message;
      throw new LLMError(msg || 'LLM proxy error');
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new LLMError('LLM proxy returned no content');
    return content;
  } catch (err) {
    if (err instanceof LLMError) throw err;
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    throw new LLMError(aborted ? 'LLM request timed out' : (err as Error)?.message || 'LLM request failed');
  } finally {
    cleanup();
  }
}

/**
 * Streaming chat completion. Invokes `onToken` with each text delta as it
 * arrives (OpenAI SSE format) and resolves with the full concatenated text.
 */
export async function chatStream(
  messages: ChatMessage[],
  onToken: (token: string) => void,
  opts: ChatOptions = {}
): Promise<string> {
  const { signal, cleanup } = withTimeout(
    opts.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
    opts.signal
  );

  try {
    const res = await fetch(proxyUrl('/chat/completions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        messages,
        temperature: opts.temperature ?? 0.4,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        stream: true,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      throw new LLMError(`LLM proxy returned HTTP ${res.status}`, res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return full;
        try {
          const json = JSON.parse(payload) as ChatCompletionResponse;
          const token = json.choices?.[0]?.delta?.content;
          if (token) {
            full += token;
            onToken(token);
          }
        } catch {
          /* skip malformed keep-alive / partial chunk */
        }
      }
    }
    return full;
  } catch (err) {
    if (err instanceof LLMError) throw err;
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    throw new LLMError(aborted ? 'LLM stream timed out' : (err as Error)?.message || 'LLM stream failed');
  } finally {
    cleanup();
  }
}
