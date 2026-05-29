import * as React from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type NumberStepperProps = Omit<React.ComponentProps<"div">, "onChange"> & {
  label: string;
  max?: number;
  min?: number;
  onValueChange: (value: number) => void;
  step?: number;
  stopPropagation?: boolean;
  suffix?: string;
  value: number;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// NumberStepper 组合 Button 与 Input，承载训练编排中的小范围数字步进输入。
function NumberStepper({
  className,
  label,
  max = 999,
  min = 1,
  onValueChange,
  step = 1,
  stopPropagation = false,
  suffix = "",
  value,
  ...props
}: NumberStepperProps) {
  const stopCardClick = (event: React.SyntheticEvent) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
  };
  const commitValue = (nextValue: number) => {
    onValueChange(clampNumber(nextValue, min, max));
  };

  return (
    <div className={cn("flex h-14 w-[88px] flex-col justify-center text-center", className)} {...props}>
      <p className="mb-xs truncate text-[10px] font-medium leading-none text-outline">{label}</p>
      <div className="grid h-8 grid-cols-[26px_1fr_26px] overflow-hidden rounded-[10px] border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]">
        <Button
          aria-label={`减少${label}`}
          className="flex h-full w-full min-w-0 items-center justify-center rounded-none border-r border-line bg-transparent p-0 text-muted hover:bg-primary-soft hover:text-primary disabled:bg-transparent"
          disabled={value <= min}
          onClick={(event) => {
            stopCardClick(event);
            commitValue(value - step);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Minus aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.4} />
        </Button>
        <div className="relative flex h-full min-w-0 items-center justify-center bg-white">
          <Input
            aria-label={label}
            className={cn(
              "h-full min-w-0 rounded-none border-0 bg-transparent p-0 text-center text-[11px] font-semibold leading-8 text-ink focus-visible:ring-0",
              suffix ? "pr-2" : "",
            )}
            inputMode="numeric"
            onClick={stopCardClick}
            onChange={(event) => {
              const numericValue = Number(event.target.value.replace(/\D/g, "")) || min;
              commitValue(numericValue);
            }}
            value={value}
          />
          {suffix ? (
            <span className="pointer-events-none absolute right-1 text-[10px] font-semibold text-muted">
              {suffix}
            </span>
          ) : null}
        </div>
        <Button
          aria-label={`增加${label}`}
          className="flex h-full w-full min-w-0 items-center justify-center rounded-none border-l border-line bg-transparent p-0 text-muted hover:bg-primary-soft hover:text-primary disabled:bg-transparent"
          disabled={value >= max}
          onClick={(event) => {
            stopCardClick(event);
            commitValue(value + step);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Plus aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.4} />
        </Button>
      </div>
    </div>
  );
}

export { NumberStepper };
