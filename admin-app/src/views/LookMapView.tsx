/**
 * Look-map tab container.
 *
 * Self-fetches the stable Telemetry sheet (via the Apps Script GET / read-proxy),
 * then renders the attention/dwell heatmap. Seed data is shown ONLY when no real
 * attention telemetry is present (demo passes through to LookMap, which prefers
 * real events whenever any exist).
 */
import { useCallback, useEffect, useState } from "react";
import { Eye, RefreshCw } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchTelemetry, type TelemetryEvent } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";
import { LookMap } from "@/views/analytics/LookMap";

export function LookMapView({ config }: { config: AppConfig }) {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await fetchTelemetry(config));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Eye className="h-4 w-4 text-primary" /> Look map
          </h1>
          <p className="text-xs text-muted-foreground">
            Attention / dwell heatmap — where the cursor and gaze linger per page, weighted by
            time spent. Derived from the stable Telemetry sheet.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {error ? (
        <Empty title="Couldn't load telemetry" hint={error} />
      ) : (
        <LookMap events={events} demo />
      )}
    </div>
  );
}
