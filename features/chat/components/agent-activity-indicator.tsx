import { SymbolIcon } from "@/components/app/symbol-icon";
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
      className="agent-activity-indicator overflow-hidden rounded-xl border border-primary/15 bg-white/90 px-md py-sm text-on-surface shadow-[0_10px_28px_rgba(16,24,40,0.08)] backdrop-blur"
      role="status"
    >
      <div className="flex min-h-8 items-center gap-sm">
        <span
          aria-hidden="true"
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft ${display.toneClass}`}
        >
          <span className="absolute inset-0 rounded-full bg-primary/10 motion-safe:animate-ping motion-reduce:animate-none" />
          <SymbolIcon className="relative text-[18px] motion-safe:animate-pulse motion-reduce:animate-none">
            {display.icon}
          </SymbolIcon>
        </span>
        <span className="min-w-0 flex-1 truncate font-label-md text-label-md font-bold">
          {display.label}
        </span>
        <span className="flex shrink-0 items-center gap-[4px]" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-bounce motion-reduce:animate-none [animation-delay:-0.2s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-bounce motion-reduce:animate-none [animation-delay:-0.1s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-bounce motion-reduce:animate-none" />
        </span>
      </div>
      <div
        aria-hidden="true"
        className="mt-xs h-[2px] overflow-hidden rounded-full bg-primary/10"
      >
        <div className="h-full w-1/2 rounded-full bg-primary/45 motion-safe:animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  );
}
