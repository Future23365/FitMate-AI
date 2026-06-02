"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { RightDrawer } from "@/components/app/right-drawer";
import { SymbolIcon } from "@/components/app/symbol-icon";
import type { Exercise } from "@/lib/shared/exercises/types";

type LazyExercisePreviewSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  exercise: Exercise | null;
  executionTip?: string;
  isLoading?: boolean;
  errorMessage?: string;
  primaryAction?: {
    icon?: string;
    label: string;
    onClick: () => void;
  };
};

const DynamicExercisePreviewSheet = dynamic(
  () => import("@/features/exercises/components/exercise-preview-sheet").then((module) => module.ExercisePreviewSheet),
  {
    ssr: false,
    loading: () => <ExercisePreviewSheetFallback />,
  },
);

// LazyExercisePreviewSheet 是动作详情 Sheet 的按需加载边界，避免编排页和训练页首屏同步加载重交互面板。
export function LazyExercisePreviewSheet({
  errorMessage,
  exercise,
  executionTip,
  isLoading = false,
  isOpen,
  onClose,
  primaryAction,
}: LazyExercisePreviewSheetProps) {
  if (isOpen && (isLoading || errorMessage)) {
    return (
      <ExercisePreviewShell
        body={
          errorMessage ? (
            <div className="rounded-xl border border-error-container bg-error-container/30 p-md text-on-error-container">
              <p className="font-label-md text-label-md font-bold">动作详情加载失败</p>
              <p className="mt-xs font-body-sm text-body-sm">{errorMessage}</p>
            </div>
          ) : (
            <ExercisePreviewLoadingBody />
          )
        }
        onClose={onClose}
      />
    );
  }

  return (
    <DynamicExercisePreviewSheet
      exercise={exercise}
      executionTip={executionTip}
      isOpen={isOpen}
      onClose={onClose}
      primaryAction={primaryAction}
    />
  );
}

function ExercisePreviewSheetFallback() {
  return <ExercisePreviewShell body={<ExercisePreviewLoadingBody />} onClose={() => undefined} />;
}

function ExercisePreviewShell({
  body,
  onClose,
}: {
  body: ReactNode;
  onClose: () => void;
}) {
  return (
    <RightDrawer
      ariaLabel="动作详情"
      bodyClassName="custom-scrollbar flex-1 overflow-y-auto p-md"
      header={
        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-lg py-md shadow-sm">
          <div className="flex items-center gap-xs">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <SymbolIcon className="text-[20px]">fitness_center</SymbolIcon>
            </span>
            <div>
              <h3 className="font-title-md text-title-md font-bold leading-snug text-slate-800">
                动作详情
              </h3>
              <p className="font-label-xs text-label-xs text-slate-400">正在准备内容</p>
            </div>
          </div>
          <button
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-100 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            type="button"
          >
            <SymbolIcon className="text-[20px]">close</SymbolIcon>
          </button>
        </div>
      }
      headerClassName="shrink-0"
      isOpen
      onClose={onClose}
      panelClassName="bg-slate-50"
      widthClassName="sm:w-[460px]"
    >
      {body}
    </RightDrawer>
  );
}

function ExercisePreviewLoadingBody() {
  return (
    <div className="space-y-md">
      <div className="aspect-[4/3] animate-pulse rounded-2xl bg-surface-container" />
      <div className="rounded-2xl border border-line bg-white p-md shadow-sm">
        <div className="mb-sm h-4 w-1/2 animate-pulse rounded bg-surface-container" />
        <div className="space-y-xs">
          <div className="h-3 w-full animate-pulse rounded bg-surface-container" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-surface-container" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-container" />
        </div>
      </div>
    </div>
  );
}
