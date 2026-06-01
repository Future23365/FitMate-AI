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

  return (
    <div
      aria-live="polite"
      className="agent-activity-indicator px-xs py-[2px] font-label-sm text-label-sm font-bold text-primary/80 motion-safe:animate-pulse"
      role="status"
    >
      {display.label}
    </div>
  );
}

