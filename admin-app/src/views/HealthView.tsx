import { useEffect, useState } from "react";
import { RefreshCw, Trash2, UploadCloud } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { ServiceStatus } from "@/lib/health";
import {
  getQueue,
  pushQueue,
  removeItem,
  subscribe,
  type QueueItem,
} from "@/lib/offlineQueue";
import { StatusDot } from "@/components/StatusDot";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/Empty";
import { timeAgo } from "@/lib/utils";

export function HealthView({
  config,
  statuses,
  onRefresh,
}: {
  config: AppConfig;
  statuses: ServiceStatus[];
  onRefresh: () => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>(getQueue());
  const [pushing, setPushing] = useState(false);

  useEffect(() => subscribe(setQueue), []);

  async function push() {
    setPushing(true);
    try {
      await pushQueue(config);
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Health board</h1>
          <p className="text-xs text-muted-foreground">
            Stable vs unstable backends + the offline edit queue.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw /> Check now
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {statuses.length === 0 && <Empty title="Running first health check…" />}
        {statuses.map((s) => (
          <Card key={s.key}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <StatusDot health={s.health} pulse={s.kind === "unstable"} />
                  {s.label}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Badge variant={s.kind === "stable" ? "muted" : s.kind === "local" ? "muted" : "default"}>
                    {s.kind}
                  </Badge>
                  <span className="truncate" title={s.detail}>
                    {s.detail}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={
                    "text-sm font-semibold " +
                    (s.health === "up" ? "text-ok" : s.health === "down" ? "text-down" : "")
                  }
                >
                  {s.health.toUpperCase()}
                </div>
                {s.latencyMs != null && (
                  <div className="text-[11px] tabular-nums text-muted-foreground">{s.latencyMs}ms</div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Pending edit queue ({queue.length})</CardTitle>
          <Button size="sm" onClick={push} disabled={pushing || queue.length === 0}>
            <UploadCloud className={pushing ? "animate-pulse" : ""} /> Push now
          </Button>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Queue is empty — all edits are synced.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {queue.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant={it.type === "regen" ? "default" : "muted"}>{it.type}</Badge>
                      <span className="truncate font-medium">
                        {it.productName ?? `#${String(it.productId)}`}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {it.type === "edit" && it.changes
                        ? Object.entries(it.changes)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(", ")
                        : "trigger 3D box regen"}
                      {" · "}
                      {timeAgo(it.createdAt)}
                      {it.lastError ? ` · error: ${it.lastError}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        it.status === "failed" ? "down" : it.status === "pushing" ? "warn" : "muted"
                      }
                    >
                      {it.status}
                    </Badge>
                    <button
                      onClick={() => removeItem(it.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Discard"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
