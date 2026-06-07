import { getAgentActivityDisplay } from "@/features/chat/lib/agent-activity";
import type { VisibleAgentActivity } from "@/features/chat/lib/agent-activity";

// AgentActivityIndicator 只负责展示当前请求的安全活动文案，轮次缺省时用首轮保持视觉稳定。
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
    : "#1";

  return (
    <div
      aria-live="polite"
      className={`agent-activity-indicator inline-flex min-h-[18px] min-w-0 max-w-[min(34rem,100%)] items-baseline gap-[2px] overflow-hidden py-[2px] pl-0 pr-xs font-label-sm text-label-sm font-bold leading-[16px] ${toneClass} transition-colors duration-200 motion-safe:animate-pulse motion-reduce:animate-none`}
      role="status"
    >
      <span
        className="inline-block w-[1.375rem] shrink-0 text-left font-mono text-label-sm leading-[16px] tabular-nums text-primary/55"
      >
        {roundLabel}
      </span>
      <span className="block min-w-0 truncate leading-[16px]">{display.label}</span>
    </div>
  );
}
