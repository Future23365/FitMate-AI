import { getAgentActivityDisplay } from "@/features/chat/lib/agent-activity";
import type { AgentActivityPayload } from "@/features/chat/types";

export function AgentActivityIndicator({
  activity,
}: {
  activity: AgentActivityPayload | null;
}) {
  if (!activity) {
    return null;
  }

  const display = getAgentActivityDisplay(activity);
  const toneClass = display.toneClass === "text-error" ? "text-error" : "text-primary/80";

  return (
    <div
      aria-live="polite"
      className={`agent-activity-indicator flex items-center gap-xs px-xs py-[2px] font-label-sm text-label-sm font-bold ${toneClass} motion-safe:animate-pulse motion-reduce:animate-none`}
      role="status"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-base leading-none">
        {display.icon}
      </span>
      <span>{display.label}</span>
    </div>
  );
}
