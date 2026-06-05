import { getAgentActivityDisplay } from "@/features/chat/lib/agent-activity";
import type { VisibleAgentActivity } from "@/features/chat/lib/agent-activity";

export function AgentActivityIndicator({
  activity,
}: {
  activity: VisibleAgentActivity | null;
}) {
  if (!activity?.activityStage) {
    return null;
  }

  const display = getAgentActivityDisplay(activity.activityStage);
  const toneClass = display.toneClass === "text-error" ? "text-error" : "text-primary/80";
  const roundLabel = typeof activity.loopTurn === "number" && Number.isSafeInteger(activity.loopTurn) && activity.loopTurn > 0
    ? `#${activity.loopTurn}`
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
