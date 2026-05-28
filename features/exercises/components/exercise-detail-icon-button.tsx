"use client";

import { SymbolIcon } from "@/components/app/symbol-icon";

type ExerciseDetailIconButtonProps = {
  onClick: () => void;
};

// 聊天动作卡片统一的详情入口：只负责右上角 hover/focus 展示和打开详情，不承载业务状态。
export function ExerciseDetailIconButton({ onClick }: ExerciseDetailIconButtonProps) {
  return (
    <button
      aria-label="查看动作详情"
      className="absolute right-sm top-sm z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-primary/15 bg-white/95 text-primary opacity-0 shadow-sm transition-all duration-200 hover:border-primary/35 hover:bg-primary-soft focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 group-hover/exercise-card:opacity-100"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title="查看动作详情"
      type="button"
    >
      <SymbolIcon className="text-[18px]">info</SymbolIcon>
    </button>
  );
}
