"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RightDrawer } from "@/components/app/right-drawer";
import { SymbolIcon } from "@/components/app/symbol-icon";
import {
  ExercisePreviewFooter,
  ExercisePreviewHeader,
  type ExercisePreviewPrimaryAction,
} from "@/features/exercises/components/exercise-preview-sheet-parts";
import {
  canExercisePreviewAutoPlay,
  createExercisePreviewImageSetKey,
  emptyExercisePreviewImageLoadStatus,
  exercisePreviewAutoplayIntervalMs,
  exercisePreviewImageLoadDelayMs,
  normalizeExercisePreviewImages,
  type ExercisePreviewImageLoadState,
  type ExercisePreviewImageLoadStatus,
} from "@/features/exercises/lib/exercise-preview-images";
import type { Exercise } from "@/lib/shared/exercises/types";

interface ExercisePreviewSheetProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: Exercise | null;
  executionTip?: string;
  primaryAction?: ExercisePreviewPrimaryAction;
}

type ExerciseImageSelection = {
  exerciseId: string;
  imageSetKey: string;
  index: number;
};

type ExerciseImageLoadGate = {
  exerciseId: string;
  imageSetKey: string;
  canLoad: boolean;
};

type ExerciseImageAutoplayState = {
  exerciseId: string;
  imageSetKey: string;
  isPlaying: boolean;
};

export function ExercisePreviewSheet({
  isOpen,
  onClose,
  exercise,
  executionTip,
  primaryAction,
}: ExercisePreviewSheetProps) {
  const isDrawerOpen = isOpen && Boolean(exercise);

  return (
    <RightDrawer
      ariaLabel="动作详情"
      bodyClassName="custom-scrollbar flex-1 space-y-md overflow-y-auto p-md"
      footer={
        <ExercisePreviewFooter
          exercise={exercise}
          primaryAction={primaryAction}
        />
      }
      footerClassName="shrink-0"
      header={<ExercisePreviewHeader exercise={exercise} onClose={onClose} />}
      headerClassName="shrink-0"
      isOpen={isDrawerOpen}
      onClose={onClose}
      panelClassName="bg-slate-50"
      widthClassName="sm:w-[460px]"
    >
      {exercise ? (
        <ExercisePreviewSheetBody
          exercise={exercise}
          executionTip={executionTip}
          isActive={isDrawerOpen}
        />
      ) : null}
    </RightDrawer>
  );
}

// ExercisePreviewSheetBody 承载动作图片、参数和步骤详情，供完整 Sheet 与懒加载抽屉共用。
export function ExercisePreviewSheetBody({
  exercise,
  executionTip,
  isActive = true,
}: {
  exercise: Exercise;
  executionTip?: string;
  isActive?: boolean;
}) {
  const images = useMemo(
    () => normalizeExercisePreviewImages(exercise.imageUrls),
    [exercise.imageUrls]
  );
  const imageSetKey = useMemo(() => createExercisePreviewImageSetKey(images), [images]);

  return (
    <ExercisePreviewSheetContent
      key={`${exercise.id}:${imageSetKey}:${isActive ? "active" : "inactive"}`}
      exercise={exercise}
      executionTip={executionTip}
      imageSetKey={imageSetKey}
      images={images}
      isActive={isActive}
    />
  );
}

function ExercisePreviewSheetContent({
  exercise,
  executionTip,
  imageSetKey,
  images,
  isActive = true,
}: {
  exercise: Exercise;
  executionTip?: string;
  imageSetKey: string;
  images: string[];
  isActive?: boolean;
}) {
  const exerciseId = exercise.id;
  const [imageSelection, setImageSelection] = useState<ExerciseImageSelection>({
    exerciseId,
    imageSetKey,
    index: 0,
  });
  const [autoPlay, setAutoPlay] = useState<ExerciseImageAutoplayState>({
    exerciseId,
    imageSetKey,
    isPlaying: true,
  });
  const [imageLoadState, setImageLoadState] = useState<ExercisePreviewImageLoadState>({
    exerciseId,
    imageSetKey,
    statusByUrl: {},
  });
  const [imageLoadGate, setImageLoadGate] = useState<ExerciseImageLoadGate>({
    exerciseId: "",
    imageSetKey: "",
    canLoad: false,
  });

  const activeImageIndex =
    imageSelection.exerciseId === exerciseId && imageSelection.imageSetKey === imageSetKey
      ? Math.min(imageSelection.index, images.length - 1)
      : 0;
  const hasMultipleImages = images.length > 1;
  const isAutoPlaying =
    autoPlay.exerciseId === exerciseId && autoPlay.imageSetKey === imageSetKey ? autoPlay.isPlaying : true;
  const imageLoadStatus =
    imageLoadState.exerciseId === exerciseId && imageLoadState.imageSetKey === imageSetKey
      ? imageLoadState.statusByUrl
      : emptyExercisePreviewImageLoadStatus;
  const canLoadImages =
    isActive &&
    imageLoadGate.exerciseId === exerciseId &&
    imageLoadGate.imageSetKey === imageSetKey &&
    imageLoadGate.canLoad;
  const canAutoSwitchImages = canLoadImages && canExercisePreviewAutoPlay(images, imageLoadStatus);
  const activeImageUrl = images[activeImageIndex];
  const activeImageStatus = imageLoadStatus[activeImageUrl];
  const didActiveImageFail = canLoadImages && activeImageStatus === "failed";
  const shouldShowImagePlaceholder = !canLoadImages || activeImageStatus !== "loaded";

  const setImageStatus = useCallback((
    nextExerciseId: string,
    nextImageSetKey: string,
    src: string,
    status: ExercisePreviewImageLoadStatus
  ) => {
    setImageLoadState((current) => {
      if (current.exerciseId !== nextExerciseId || current.imageSetKey !== nextImageSetKey) {
        return current;
      }

      if (current.statusByUrl[src] === status) {
        return current;
      }

      return {
        exerciseId: nextExerciseId,
        imageSetKey: nextImageSetKey,
        statusByUrl: { ...current.statusByUrl, [src]: status },
      };
    });
  }, []);

  const markImageLoaded = useCallback(
    (nextExerciseId: string, nextImageSetKey: string, src: string) =>
      setImageStatus(nextExerciseId, nextImageSetKey, src, "loaded"),
    [setImageStatus]
  );

  const markImageFailed = useCallback(
    (nextExerciseId: string, nextImageSetKey: string, src: string) =>
      setImageStatus(nextExerciseId, nextImageSetKey, src, "failed"),
    [setImageStatus]
  );

  useEffect(() => {
    if (!isActive || !exerciseId) {
      return;
    }

    const timer = window.setTimeout(() => {
      setImageLoadGate({
        exerciseId,
        imageSetKey,
        canLoad: true,
      });
    }, exercisePreviewImageLoadDelayMs);

    return () => window.clearTimeout(timer);
  }, [exerciseId, imageSetKey, isActive]);

  useEffect(() => {
    if (!isActive || !exerciseId || !hasMultipleImages || !isAutoPlaying || !canAutoSwitchImages) {
      return;
    }

    const timer = window.setTimeout(() => {
      setImageSelection((current) => {
        const currentIndex =
          current.exerciseId === exerciseId && current.imageSetKey === imageSetKey ? current.index : 0;

        return {
          exerciseId,
          imageSetKey,
          index: currentIndex >= images.length - 1 ? 0 : currentIndex + 1,
        };
      });
    }, exercisePreviewAutoplayIntervalMs);

    return () => window.clearTimeout(timer);
  }, [
    activeImageIndex,
    canAutoSwitchImages,
    exerciseId,
    hasMultipleImages,
    imageSetKey,
    images.length,
    isActive,
    isAutoPlaying,
  ]);

  function selectImage(index: number) {
    setImageSelection({
      exerciseId: exercise?.id ?? "",
      imageSetKey,
      index,
    });
  }

  const handlePrevImage = () => {
    selectImage(activeImageIndex === 0 ? images.length - 1 : activeImageIndex - 1);
  };

  const handleNextImage = () => {
    selectImage(activeImageIndex === images.length - 1 ? 0 : activeImageIndex + 1);
  };

  return (
    <>
              {/* 卡片一：动作视觉演示 (步骤图轮播 + 快切大按钮) */}
              <div className="bg-white shadow-sm rounded-2xl p-md border border-slate-100/60">
                <h4 className="mb-sm flex items-center gap-xs font-label-sm text-label-sm font-bold text-slate-700">
                  <SymbolIcon className="text-primary text-[16px]">visibility</SymbolIcon>
                  动作视频与图解演示
                </h4>

                {/* 大图展示区域 */}
                <div className="group relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-white">
                  {canLoadImages
                    ? images.map((imageUrl, imageIndex) => {
                        const isActiveImage = imageIndex === activeImageIndex;
                        const imageStatus = imageLoadStatus[imageUrl];
                        const shouldShowImage = isActiveImage && imageStatus === "loaded";

                        return (
                          <Image
                            key={`${exerciseId}:${imageSetKey}:${imageUrl}`}
                            alt={isActiveImage ? `${exercise.nameZh} 演示图 ${imageIndex + 1}` : ""}
                            aria-hidden={!isActiveImage}
                            className={`object-cover transition-opacity duration-200 ${
                              shouldShowImage ? "z-10 opacity-100" : "z-0 opacity-0"
                            }`}
                            fill
                            loading="eager"
                            onError={() => markImageFailed(exerciseId, imageSetKey, imageUrl)}
                            onLoad={() => markImageLoaded(exerciseId, imageSetKey, imageUrl)}
                            sizes="(min-width: 640px) 428px, calc(100vw - 32px)"
                            src={imageUrl}
                          />
                        );
                      })
                    : null}

                  {shouldShowImagePlaceholder ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-xs bg-slate-50 text-slate-400">
                      <SymbolIcon className="text-[28px]">
                        {didActiveImageFail ? "broken_image" : "image"}
                      </SymbolIcon>
                      <span className="font-label-xs text-label-xs font-semibold">
                        {didActiveImageFail ? "图片加载失败" : "图片加载中..."}
                      </span>
                    </div>
                  ) : null}

                  {/* 左右翻页按钮 */}
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={handlePrevImage}
                        className="absolute left-sm top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md text-slate-700 hover:bg-white hover:scale-105 active:scale-95 transition-all opacity-0 group-hover:opacity-100"
                        type="button"
                      >
                        <SymbolIcon className="text-[18px]">chevron_left</SymbolIcon>
                      </button>
                      <button
                        onClick={handleNextImage}
                        className="absolute right-sm top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md text-slate-700 hover:bg-white hover:scale-105 active:scale-95 transition-all opacity-0 group-hover:opacity-100"
                        type="button"
                      >
                        <SymbolIcon className="text-[18px]">chevron_right</SymbolIcon>
                      </button>
                      <button
                        aria-label={isAutoPlaying ? "暂停自动切换图片" : "自动切换图片"}
                        className="absolute right-sm top-sm flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md transition-all hover:scale-105 hover:bg-white active:scale-95"
                        onClick={() =>
                          setAutoPlay({
                            exerciseId: exercise.id,
                            imageSetKey,
                            isPlaying: !isAutoPlaying,
                          })
                        }
                        title={isAutoPlaying ? "暂停自动切换图片" : "自动切换图片"}
                        type="button"
                      >
                        <SymbolIcon className="text-[18px]">
                          {isAutoPlaying ? "pause" : "play_arrow"}
                        </SymbolIcon>
                      </button>
                    </>
                  )}

                  {/* 步骤角标 */}
                  <div className="absolute right-sm bottom-sm bg-black/60 backdrop-blur-sm text-white rounded-full px-sm py-[2px] font-label-xs text-label-xs font-semibold">
                    {activeImageIndex + 1} / {images.length}
                  </div>
                </div>

                {/* 一键快切步骤点按指示器 */}
                {images.length > 1 && (
                  <div className="mt-sm flex justify-center gap-xs">
                    {images.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectImage(idx)}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          activeImageIndex === idx ? "w-6 bg-primary" : "w-1.5 bg-slate-200 hover:bg-slate-300"
                        }`}
                        type="button"
                        aria-label={`切换到步骤图片 ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 卡片二：核心参数与发力肌群 (舒展轻灰色网格 + 主/辅肌群徽章) */}
              <div className="bg-white shadow-sm rounded-2xl p-md border border-slate-100/60">
                <h4 className="mb-sm flex items-center gap-xs font-label-sm text-label-sm font-bold text-slate-700">
                  <SymbolIcon className="text-primary text-[16px]">tune</SymbolIcon>
                  核心参数与发力肌群
                </h4>

                {/* 参数网格 */}
                <div className="grid grid-cols-3 gap-xs mb-md">
                  <div className="rounded-xl bg-slate-50/70 p-xs text-center border border-slate-100/50">
                    <span className="block font-label-xs text-label-xs text-slate-400 font-semibold">动作难度</span>
                    <span className="mt-[2px] block font-body-sm text-body-sm font-bold text-slate-700">
                      {exercise.levelZh || "初级"}
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50/70 p-xs text-center border border-slate-100/50">
                    <span className="block font-label-xs text-label-xs text-slate-400 font-semibold">推荐器械</span>
                    <span className="mt-[2px] block font-body-sm text-body-sm font-bold text-slate-700 truncate" title={exercise.equipmentZh || "自重"}>
                      {exercise.equipmentZh || "自重"}
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50/70 p-xs text-center border border-slate-100/50">
                    <span className="block font-label-xs text-label-xs text-slate-400 font-semibold">动力类型</span>
                    <span className="mt-[2px] block font-body-sm text-body-sm font-bold text-slate-700">
                      {exercise.forceZh || "向心"}
                    </span>
                  </div>
                </div>

                {/* 肌群徽章排版 */}
                <div className="space-y-sm">
                  <div>
                    <span className="inline-flex items-center gap-[2px] font-label-xs text-label-xs font-semibold text-slate-500 mb-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      主导发力肌群
                    </span>
                    <div className="flex flex-wrap gap-xs">
                      {exercise.primaryMusclesZh && exercise.primaryMusclesZh.length > 0 ? (
                        exercise.primaryMusclesZh.map((muscle) => (
                          <span key={muscle} className="inline-flex items-center rounded-full bg-primary/10 px-sm py-[2px] font-label-xs text-label-xs font-bold text-primary border border-primary/10">
                            {muscle}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 font-label-xs text-label-xs">暂无明确主肌群</span>
                      )}
                    </div>
                  </div>

                  {exercise.secondaryMusclesZh && exercise.secondaryMusclesZh.length > 0 && (
                    <div>
                      <span className="inline-flex items-center gap-[2px] font-label-xs text-label-xs font-semibold text-slate-500 mb-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                        辅助发力肌群
                      </span>
                      <div className="flex flex-wrap gap-xs">
                        {exercise.secondaryMusclesZh.map((muscle) => (
                          <span key={muscle} className="inline-flex items-center rounded-full bg-slate-100 px-sm py-[2px] font-label-xs text-label-xs font-bold text-slate-600 border border-slate-200/50">
                            {muscle}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 卡片三：标准动作要领 (大圆形数字序列引导) */}
              <div className="bg-white shadow-sm rounded-2xl p-md border border-slate-100/60">
                <h4 className="mb-sm flex items-center gap-xs font-label-sm text-label-sm font-bold text-slate-700">
                  <SymbolIcon className="text-primary text-[16px]">menu_book</SymbolIcon>
                  标准动作步骤与要领
                </h4>

                {exercise.instructionsZh && exercise.instructionsZh.length > 0 ? (
                  <ol className="space-y-sm">
                    {exercise.instructionsZh.map((step, idx) => (
                      <li key={idx} className="flex gap-sm items-start">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary font-black text-[10px] text-white shadow-sm mt-[2px]">
                          {idx + 1}
                        </span>
                        <p className="font-body-sm text-body-sm text-slate-600 leading-relaxed">
                          {step}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-slate-400 font-label-xs text-label-xs text-center py-md">
                    暂无中文动作说明，请结合动作视频或图片参考。
                  </p>
                )}

              </div>

              {executionTip ? (
                <div className="rounded-2xl border border-primary/10 bg-primary/5 p-md shadow-sm">
                  <h4 className="mb-xs flex items-center gap-xs font-label-sm text-label-sm font-bold text-primary">
                    <SymbolIcon className="text-[16px]">tips_and_updates</SymbolIcon>
                    执行提示
                  </h4>
                  <p className="font-body-sm text-body-sm leading-relaxed text-slate-700">
                    {executionTip}
                  </p>
                </div>
              ) : null}
    </>
  );
}
