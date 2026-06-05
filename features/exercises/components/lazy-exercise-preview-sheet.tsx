"use client";

import dynamic from "next/dynamic";

import { RightDrawer } from "@/components/app/right-drawer";
import {
  ExercisePreviewFooter,
  ExercisePreviewHeader,
  type ExercisePreviewPrimaryAction,
} from "@/features/exercises/components/exercise-preview-sheet-parts";
import type { Exercise } from "@/lib/shared/exercises/types";

type LazyExercisePreviewSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  exercise: Exercise | null;
  executionTip?: string;
  isLoading?: boolean;
  errorMessage?: string;
  primaryAction?: ExercisePreviewPrimaryAction;
};

const DynamicExercisePreviewSheetBody = dynamic(
  () => import("@/features/exercises/components/exercise-preview-sheet").then((module) => module.ExercisePreviewSheetBody),
  {
    ssr: false,
    loading: () => <ExercisePreviewLoadingBody />,
  },
);

// LazyExercisePreviewSheet 统一持有动作详情抽屉外壳，只懒加载重交互内容，避免 fallback 重建抽屉导致闪烁。
export function LazyExercisePreviewSheet({
  errorMessage,
  exercise,
  executionTip,
  isLoading = false,
  isOpen,
  onClose,
  primaryAction,
}: LazyExercisePreviewSheetProps) {
  const isDetailReady = isOpen && !isLoading && !errorMessage && Boolean(exercise);

  if (!isOpen && !exercise && !isLoading && !errorMessage) {
    return null;
  }

  return (
    <RightDrawer
      ariaLabel="动作详情"
      bodyClassName="custom-scrollbar flex-1 space-y-md overflow-y-auto p-md"
      footer={
        isDetailReady ? (
          <ExercisePreviewFooter
            exercise={exercise}
            primaryAction={primaryAction}
          />
        ) : null
      }
      footerClassName="shrink-0"
      header={
        <ExercisePreviewHeader
          exercise={isDetailReady ? exercise : null}
          onClose={onClose}
        />
      }
      headerClassName="shrink-0"
      isOpen={isOpen}
      onClose={onClose}
      panelClassName="bg-slate-50"
      widthClassName="sm:w-[460px]"
    >
      {errorMessage ? (
        <div className="rounded-xl border border-error-container bg-error-container/30 p-md text-on-error-container">
          <p className="font-label-md text-label-md font-bold">动作详情加载失败</p>
          <p className="mt-xs font-body-sm text-body-sm">{errorMessage}</p>
        </div>
      ) : isDetailReady && exercise ? (
        <DynamicExercisePreviewSheetBody
          exercise={exercise}
          executionTip={executionTip}
          isActive={isOpen}
        />
      ) : (
        <ExercisePreviewLoadingBody />
      )}
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
