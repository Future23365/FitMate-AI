"use client";

import { useEffect, useMemo, useState } from "react";

import { getAgentActivityDisplay } from "@/features/chat/lib/agent-activity";
import type { VisibleAgentActivity } from "@/features/chat/lib/agent-activity";

type AgentActivitySnapshot = {
  key: string;
  label: string;
  roundLabel: string;
  toneClass: string;
};

// AgentActivityIndicator 只负责展示当前请求的安全活动文案，轮次缺省时用首轮保持视觉稳定。
export function AgentActivityIndicator({
  activity,
}: {
  activity: VisibleAgentActivity | null;
}) {
  if (!activity?.activityStage) {
    return null;
  }

  return <AgentActivityScroller activity={activity} activityStage={activity.activityStage} />;
}

function AgentActivityScroller({
  activity,
  activityStage,
}: {
  activity: VisibleAgentActivity;
  activityStage: NonNullable<VisibleAgentActivity["activityStage"]>;
}) {
  const display = getAgentActivityDisplay(activityStage);
  const toneClass = display.toneClass === "text-error" ? "text-error" : "text-primary/80";
  const roundLabel = typeof activity.loopTurn === "number" && Number.isSafeInteger(activity.loopTurn) && activity.loopTurn > 0
    ? `#${activity.loopTurn}`
    : "#1";
  const nextSnapshot = useMemo(() => ({
    key: `${roundLabel}:${display.label}:${toneClass}`,
    label: display.label,
    roundLabel,
    toneClass,
  }), [
    display.label,
    roundLabel,
    toneClass,
  ]);
  const [animationState, setAnimationState] = useState<{
    current: AgentActivitySnapshot;
    previous: AgentActivitySnapshot | null;
  }>({
    current: nextSnapshot,
    previous: null,
  });

  useEffect(() => {
    setAnimationState((currentState) => {
      if (currentState.current.key === nextSnapshot.key) {
        return currentState;
      }

      return {
        current: nextSnapshot,
        previous: currentState.current,
      };
    });
  }, [nextSnapshot]);

  useEffect(() => {
    if (!animationState.previous) {
      return;
    }

    const timer = window.setTimeout(() => {
      setAnimationState((currentState) => (
        currentState.current.key === animationState.current.key
          ? { ...currentState, previous: null }
          : currentState
      ));
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    animationState.current.key,
    animationState.previous,
  ]);

  return (
    <div
      aria-live="polite"
      className="agent-activity-indicator relative inline-flex h-[20px] min-w-0 max-w-[min(34rem,100%)] items-baseline gap-[2px] overflow-hidden py-[2px] pl-0 pr-xs font-label-sm text-label-sm font-bold leading-[16px] transition-colors duration-200 motion-reduce:animate-none"
      role="status"
    >
      {animationState.previous ? (
        <AgentActivityLine
          ariaHidden
          className="agent-activity-roll-previous absolute left-0 right-0 top-[2px]"
          snapshot={animationState.previous}
        />
      ) : null}
      <AgentActivityLine
        className={animationState.previous ? "agent-activity-roll-current relative" : "relative"}
        snapshot={animationState.current}
      />
    </div>
  );
}

function AgentActivityLine({
  ariaHidden = false,
  className,
  snapshot,
}: {
  ariaHidden?: boolean;
  className: string;
  snapshot: AgentActivitySnapshot;
}) {
  return (
    <span
      aria-hidden={ariaHidden || undefined}
      className={`inline-flex min-w-0 max-w-full items-baseline gap-[2px] ${snapshot.toneClass} ${className}`}
    >
      <span
        className="inline-block w-[1.375rem] shrink-0 text-left font-mono text-label-sm leading-[16px] tabular-nums text-primary/55"
      >
        {snapshot.roundLabel}
      </span>
      <span className="block min-w-0 truncate leading-[16px]">{snapshot.label}</span>
    </span>
  );
}
