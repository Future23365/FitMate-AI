"use client";

import { SymbolIcon } from "@/components/app/symbol-icon";
import type { Exercise } from "@/lib/shared/exercises/types";

export type ExercisePreviewPrimaryAction = {
  icon?: string;
  label: string;
  onClick: () => void;
};

// ExercisePreviewHeader 只承载动作详情抽屉顶部信息，保证懒加载和完整详情共用同一外壳。
export function ExercisePreviewHeader({
  exercise,
  onClose,
}: {
  exercise?: Exercise | null;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 bg-white px-lg py-md shadow-sm">
      <div className="flex items-center gap-xs">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <SymbolIcon className="text-[20px]">fitness_center</SymbolIcon>
        </span>
        <div>
          <h3 className="font-title-md text-title-md font-bold leading-snug text-slate-800">
            {exercise?.nameZh || "动作详情"}
          </h3>
          <p className="font-label-xs text-label-xs text-slate-400">
            {exercise?.nameEn || "正在准备内容"}
          </p>
        </div>
      </div>
      <button
        aria-label="关闭"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-100 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 active:scale-95"
        onClick={onClose}
        type="button"
      >
        <SymbolIcon className="text-[20px]">close</SymbolIcon>
      </button>
    </div>
  );
}

// ExercisePreviewFooter 承载详情抽屉底部主操作，避免懒加载 fallback 和真实内容各自维护按钮样式。
export function ExercisePreviewFooter({
  exercise,
  primaryAction,
}: {
  exercise?: Exercise | null;
  primaryAction?: ExercisePreviewPrimaryAction;
}) {
  if (!primaryAction || !exercise) {
    return null;
  }

  return (
    <div className="shrink-0 border-t border-slate-100 bg-white p-md shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
      <button
        className="flex w-full items-center justify-center gap-xs rounded-xl bg-primary px-md py-sm font-label-md text-label-md font-bold text-white transition-colors hover:bg-primary-deep"
        onClick={primaryAction.onClick}
        type="button"
      >
        {primaryAction.icon ? (
          <SymbolIcon className="text-[18px]">{primaryAction.icon}</SymbolIcon>
        ) : null}
        {primaryAction.label}
      </button>
    </div>
  );
}
