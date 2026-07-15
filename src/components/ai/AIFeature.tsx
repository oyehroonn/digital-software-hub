/**
 * <AIFeature> — graceful-degradation wrapper for every AI feature.
 *
 * Runs a bounded health check (≤2.5s) against the given UNSTABLE backend and
 * renders `children` ONLY if it is healthy. On failure it renders `fallback`
 * (or nothing) AND fires an `ai_outage` telemetry event via reportAiOutage.
 *
 * While the check is in flight it renders NOTHING — no spinner, no error — so
 * an AI feature never blocks or visibly breaks the page (resilience contract).
 *
 *   <AIFeature backend="codex" feature="quote-genie" fallback={<StaticQuoteForm/>}>
 *     <InstantQuoteGenie />
 *   </AIFeature>
 */

import { useEffect, useRef, useState } from 'react';
import { checkBackend } from '@/lib/health';
import { reportAiOutage, type AiBackend } from '@/lib/telemetry';

type Status = 'checking' | 'healthy' | 'unhealthy';

export interface AIFeatureProps {
  /** which unstable backend this feature needs */
  backend: AiBackend;
  /**
   * Feature name for telemetry (e.g. "quote-genie"). Defaults to the backend
   * name if omitted.
   */
  feature?: string;
  /** rendered when the backend is unhealthy; nothing rendered if omitted */
  fallback?: React.ReactNode;
  /** health-check timeout in ms (default 2500) */
  timeoutMs?: number;
  /**
   * Optional periodic re-check interval in ms. When set, the wrapper keeps
   * polling so a feature can recover (or disappear) as the backend flaps.
   */
  recheckMs?: number;
  children: React.ReactNode;
}

export default function AIFeature({
  backend,
  feature,
  fallback = null,
  timeoutMs = 2500,
  recheckMs,
  children,
}: AIFeatureProps) {
  const [status, setStatus] = useState<Status>('checking');
  const featureName = feature || backend;
  // Ensure we only report a given outage once per unhealthy transition.
  const reportedRef = useRef(false);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const result = await checkBackend(backend, timeoutMs);
      if (!active) return;

      if (result.ok) {
        reportedRef.current = false;
        setStatus('healthy');
      } else {
        setStatus('unhealthy');
        if (!reportedRef.current) {
          reportedRef.current = true;
          reportAiOutage(backend, featureName, result.error);
        }
      }
    };

    void run();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (recheckMs && recheckMs > 0) {
      interval = setInterval(() => void run(), recheckMs);
    }

    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, featureName, timeoutMs, recheckMs]);

  if (status === 'healthy') return <>{children}</>;
  if (status === 'unhealthy') return <>{fallback}</>;
  // 'checking' → render nothing
  return null;
}
