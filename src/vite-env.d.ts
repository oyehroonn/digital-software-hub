/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** VPS Flask API base, e.g. http://localhost:5051 */
  readonly VITE_API_BASE?: string;
  /** Public Ecommerce/Analytics Apps Script exec URL (telemetry + orders) */
  readonly VITE_ECOMMERCE_API?: string;
  /** Store name stamped on telemetry/order rows (default "DSM") */
  readonly VITE_STORE_NAME?: string;
  /** Same-origin proxy base for the codex-proxy LLM (default "/api/llm") */
  readonly VITE_LLM_PROXY_BASE?: string;
  /** Default LLM model id (default "gpt-5.4") */
  readonly VITE_LLM_MODEL?: string;
  /** Simli health endpoint (default same-origin "/api/simli/health") */
  readonly VITE_SIMLI_HEALTH_URL?: string;
  /** Simli session-proxy base for the TalkingAdvisor (default same-origin "/api/simli") */
  readonly VITE_SIMLI_PROXY_BASE?: string;
  /** Full email-proxy URL (default `{VITE_API_BASE}/api/email`). Forwards to the stable email Apps Script. */
  readonly VITE_EMAIL_PROXY_URL?: string;
  /** Base of the ORIGINAL DSM licensing storefront that license purchases redirect to. FLAG: assumed. */
  readonly VITE_OLD_WEB_BASE?: string;
  /** Calendly (or other) scheduling link for the DSM own-product "book a meeting" flow. FLAG: placeholder. */
  readonly VITE_CALENDLY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace JSX {
  interface IntrinsicElements {
    "model-viewer": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        loading?: "auto" | "lazy" | "eager";
        reveal?: "auto" | "manual";
        "auto-rotate"?: boolean | string;
        "auto-rotate-delay"?: string | number;
        "rotation-per-second"?: string;
        "camera-orbit"?: string;
        "camera-target"?: string;
        "field-of-view"?: string;
        "interaction-prompt"?: "auto" | "none";
        "interaction-prompt-style"?: "basic" | "wiggle";
        "shadow-intensity"?: string | number;
        "shadow-softness"?: string | number;
        exposure?: string | number;
        "environment-image"?: string;
        "touch-action"?: string;
        "disable-zoom"?: boolean | string;
        "camera-controls"?: boolean | string;
        "min-camera-orbit"?: string;
        "max-camera-orbit"?: string;
        "min-field-of-view"?: string;
        "max-field-of-view"?: string;
        ar?: boolean | string;
      },
      HTMLElement
    >;
  }
}
