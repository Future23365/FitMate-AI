import { getAgentActivityDisplay } from "@/features/chat/lib/agent-activity";
import type { AgentProgressPayload } from "@/features/chat/types";

type AgentActivityIndicatorPayload = AgentProgressPayload & {
  activityRound?: number;
};

export function AgentActivityIndicator({
  activity,
}: {
  activity: AgentActivityIndicatorPayload | null;
}) {
  if (!activity) {
    return null;
  }

  const display = getAgentActivityDisplay(activity);
  const toneClass = display.toneClass === "text-error" ? "text-error" : "text-primary/80";
  const roundLabel = typeof activity.activityRound === "number" && Number.isFinite(activity.activityRound)
    ? `#${Math.max(1, activity.activityRound)}`
    : null;

  return (
    <div
      aria-live="polite"
      className={`agent-activity-indicator flex items-center gap-xs px-xs py-[2px] font-label-sm text-label-sm font-bold ${toneClass} motion-safe:animate-pulse motion-reduce:animate-none`}
      role="status"
    >
      {roundLabel ? (
        <span className="shrink-0 font-mono text-[11px] leading-none text-primary/55">{roundLabel}</span>
      ) : null}
      <span>{display.label}</span>
    </div>
  );
}
