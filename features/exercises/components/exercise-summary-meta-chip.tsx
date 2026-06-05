import type { ReactNode } from "react";

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

// ExerciseSummaryMetaChip 统一动作条目的属性 chip 视觉，不约束不同卡片的整体布局。
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
