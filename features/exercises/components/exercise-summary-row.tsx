"use client";

import type { ReactNode } from "react";

import { ExerciseDetailIconButton } from "@/features/exercises/components/exercise-detail-icon-button";

type ExerciseSummaryRowTitleElement = "h4" | "h5" | "p";

type ExerciseSummaryRowProps = {
  className?: string;
  footer?: ReactNode;
  footerClassName?: string;
  meta?: ReactNode;
  onOpenPreview: () => void;
  thumbnail: ReactNode;
  thumbnailBusy?: boolean;
  thumbnailClassName?: string;
  thumbnailLabel: string;
  title: string;
  titleClassName?: string;
  titleElement?: ExerciseSummaryRowTitleElement;
};

type ExerciseSummaryMetaChipProps = {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "outline" | "primary";
};

const metaChipToneClassNames: Record<NonNullable<ExerciseSummaryMetaChipProps["tone"]>, string> = {
  neutral: "border border-line bg-panel-soft text-ink",
  outline: "border border-line bg-white text-muted",
  primary: "border border-primary/15 bg-primary-soft text-primary",
};

// ExerciseSummaryRow 统一聊天卡片中动作条目的图片、标题和元信息锚点。
export function ExerciseSummaryRow({
  className = "",
  footer,
  footerClassName = "",
  meta,
  onOpenPreview,
  thumbnail,
  thumbnailBusy = false,
  thumbnailClassName = "",
  thumbnailLabel,
  title,
  titleClassName = "",
  titleElement: TitleElement = "p",
}: ExerciseSummaryRowProps) {
  return (
    <div
      className={`group/exercise-card relative grid w-full min-w-0 grid-cols-[64px_minmax(0,1fr)] items-start gap-md rounded-xl border border-line bg-white p-sm pr-xl text-left transition-all duration-200 hover:border-primary/35 hover:bg-panel-soft/60 hover:shadow-sm ${className}`}
    >
      <ExerciseDetailIconButton onClick={onOpenPreview} />
      <button
        aria-busy={thumbnailBusy}
        aria-label={thumbnailLabel}
        className={`relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-line bg-panel-soft transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${thumbnailClassName}`}
        onClick={onOpenPreview}
        type="button"
      >
        {thumbnail}
      </button>

      <div className="min-w-0 pt-[1px]">
        <TitleElement
          className={`truncate font-body-md text-body-md font-extrabold leading-tight text-on-surface ${titleClassName}`}
        >
          {title}
        </TitleElement>

        {meta ? (
          <div className="mt-xs flex min-w-0 flex-wrap items-center gap-xs">
            {meta}
          </div>
        ) : null}

        {footer ? (
          <div className={`mt-xs min-w-0 ${footerClassName}`}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ExerciseSummaryMetaChip 表达动作条目的稳定属性，避免不同卡片重复拼接 chip 样式。
export function ExerciseSummaryMetaChip({
  children,
  className = "",
  tone = "neutral",
}: ExerciseSummaryMetaChipProps) {
  return (
    <span
      className={`inline-flex max-w-[150px] shrink-0 items-center rounded-md px-xs py-[2px] font-label-xs text-label-xs font-bold leading-none ${metaChipToneClassNames[tone]} ${className}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
