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
      className={`agent-activity-indicator flex min-h-[18px] items-baseline gap-xs py-[2px] pl-0 pr-xs font-label-sm text-label-sm font-bold leading-[16px] ${toneClass} transition-colors duration-200`}
      role="status"
    >
      <span
        aria-hidden={roundLabel ? undefined : true}
        className="inline-block min-w-[1.75rem] shrink-0 text-left font-mono text-label-sm leading-[16px] tabular-nums text-primary/55"
      >
        {roundLabel ?? ""}
      </span>
      <span className="block leading-[16px]">{display.label}</span>
    </div>
  );
}
