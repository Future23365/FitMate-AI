import { useEffect, useState, useRef } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { getAgentActivityDisplay } from "@/features/chat/lib/agent-activity";
import type { AgentActivityPayload } from "@/features/chat/types";

// 设定工具实质状态的最小展示时间，消除极短时间内“正在理解需求”来回闪烁切换的尴尬
const MIN_DURATION_MS = 800;

// 我们需要防抖和锁定的实质性工具步骤阶段
const SUBSTANTIVE_STAGES = [
  "querying_exercises",
  "reading_artifacts",
  "generating_workout",
  "validating_result",
  "saving_result",
];

export function AgentActivityIndicator({
  activity,
}: {
  activity: AgentActivityPayload | null;
}) {
  const [displayedActivity, setDisplayedActivity] = useState<AgentActivityPayload | null>(activity);
  const lastSwitchTimeRef = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 每次传入新事件时，先清理未执行完的延时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // 1. 如果 stream 结束或出错，立即清除状态让组件淡出，保证收尾绝对敏捷
    if (!activity) {
      setDisplayedActivity(null);
      return;
    }

    // 2. 如果当前没有展示状态，立即同步展示并记录时间
    if (!displayedActivity) {
      setDisplayedActivity(activity);
      lastSwitchTimeRef.current = Date.now();
      return;
    }

    const now = Date.now();
    const timeElapsed = now - lastSwitchTimeRef.current;

    // 3. 判断是否是从具体的实质工具动作，倒退回通用的大模型思考（analyzing_request）
    const isReturningToGeneric = activity.stage === "analyzing_request";
    const wasSubstantive = SUBSTANTIVE_STAGES.includes(displayedActivity.stage);

    if (isReturningToGeneric && wasSubstantive && timeElapsed < MIN_DURATION_MS) {
      // 延时回退：保证实质性动作至少在屏幕上停留满设定时长
      const remainingTime = MIN_DURATION_MS - timeElapsed;
      timeoutRef.current = setTimeout(() => {
        setDisplayedActivity(activity);
        lastSwitchTimeRef.current = Date.now();
      }, remainingTime);
    } else {
      // 4. 其他情况（往前推进到新工具阶段，或已展示足够长），立即同步更新
      setDisplayedActivity(activity);
      lastSwitchTimeRef.current = now;
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [activity, displayedActivity]);

  if (!displayedActivity) {
    return null;
  }

  const display = getAgentActivityDisplay(displayedActivity);
  const toneClass = display.toneClass === "text-error" ? "text-error" : "text-primary/80";

  return (
    <div
      aria-live="polite"
      className={`agent-activity-indicator flex items-center gap-xs px-xs py-[2px] font-label-sm text-label-sm font-bold ${toneClass} motion-safe:animate-pulse motion-reduce:animate-none`}
      role="status"
    >
      <SymbolIcon aria-hidden className="text-[16px]">{display.icon}</SymbolIcon>
      <span>{display.label}</span>
    </div>
  );
}
