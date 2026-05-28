"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RightDrawer } from "@/components/app/right-drawer";
import { SymbolIcon } from "@/components/app/symbol-icon";
import type { Exercise } from "@/lib/shared/exercises/types";

interface ExercisePreviewSheetProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: Exercise | null;
  executionTip?: string;
  primaryAction?: {
    icon?: string;
    label: string;
    onClick: () => void;
  };
}

const placeholderImage = "/images/exercise-placeholder.svg";
const autoplayIntervalMs = 1200;
const autoplayImageWaitMs = 120;
type ImageLoadStatus = "loaded" | "failed";
const emptyImageLoadStatus: Record<string, ImageLoadStatus> = {};
type ExerciseImageLoadState = {
  exerciseId: string;
  statusByUrl: Record<string, ImageLoadStatus>;
};

function preloadExerciseImage(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    image.onload = async () => {
      try {
        await image.decode?.();
      } catch {
        // Some browsers resolve onload before decode is available or reliable.
      }
      resolve();
    };
    image.onerror = reject;
    image.src = src;
  });
}

function getNextPlayableImageIndex(
  currentIndex: number,
  images: string[],
  imageLoadStatus: Record<string, ImageLoadStatus>
) {
  for (let offset = 1; offset < images.length; offset += 1) {
    const nextIndex = (currentIndex + offset) % images.length;
    const status = imageLoadStatus[images[nextIndex]];

    if (status !== "failed") {
      return nextIndex;
    }
  }

  return currentIndex;
}

export function ExercisePreviewSheet({
  isOpen,
  onClose,
  exercise,
  executionTip,
  primaryAction,
}: ExercisePreviewSheetProps) {
  const [imageSelection, setImageSelection] = useState({
    exerciseId: "",
    index: 0,
  });
  const [autoPlay, setAutoPlay] = useState({
    exerciseId: "",
    isPlaying: true,
  });
  const [imageLoadState, setImageLoadState] = useState<ExerciseImageLoadState>({
    exerciseId: "",
    statusByUrl: {},
  });

  const images = useMemo(
    () => (exercise?.imageUrls && exercise.imageUrls.length > 0 ? exercise.imageUrls : [placeholderImage]),
    [exercise]
  );
  const exerciseId = exercise?.id ?? "";
  const activeImageIndex =
    imageSelection.exerciseId === exerciseId
      ? Math.min(imageSelection.index, images.length - 1)
      : 0;
  const hasMultipleImages = images.length > 1;
  const isAutoPlaying = autoPlay.exerciseId === exerciseId ? autoPlay.isPlaying : true;
  const imageLoadStatus =
    imageLoadState.exerciseId === exerciseId ? imageLoadState.statusByUrl : emptyImageLoadStatus;
  const activeImageUrl = images[activeImageIndex];

  const setImageStatus = useCallback((nextExerciseId: string, src: string, status: ImageLoadStatus) => {
    setImageLoadState((current) => {
      const statusByUrl = current.exerciseId === nextExerciseId ? current.statusByUrl : {};

      if (statusByUrl[src] === status) {
        return current;
      }

      return {
        exerciseId: nextExerciseId,
        statusByUrl: { ...statusByUrl, [src]: status },
      };
    });
  }, []);

  const markImageLoaded = useCallback(
    (nextExerciseId: string, src: string) => setImageStatus(nextExerciseId, src, "loaded"),
    [setImageStatus]
  );

  const markImageFailed = useCallback(
    (nextExerciseId: string, src: string) => setImageStatus(nextExerciseId, src, "failed"),
    [setImageStatus]
  );

  useEffect(() => {
    if (!isOpen || !exerciseId) {
      return;
    }

    let cancelled = false;

    for (const src of images) {
      preloadExerciseImage(src)
        .then(() => {
          if (!cancelled) {
            markImageLoaded(exerciseId, src);
          }
        })
        .catch(() => {
          if (!cancelled) {
            markImageFailed(exerciseId, src);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [exerciseId, images, isOpen, markImageFailed, markImageLoaded]);

  useEffect(() => {
    if (!isOpen || !exerciseId || !hasMultipleImages || !isAutoPlaying) {
      return;
    }

    const nextIndex = getNextPlayableImageIndex(activeImageIndex, images, imageLoadStatus);
    if (nextIndex === activeImageIndex) {
      return;
    }

    const nextImageUrl = images[nextIndex];
    const isNextImageLoaded = imageLoadStatus[nextImageUrl] === "loaded";
    const delay = isNextImageLoaded ? autoplayIntervalMs : autoplayImageWaitMs;

    const timer = window.setTimeout(() => {
      if (!isNextImageLoaded) {
        return;
      }

      setImageSelection((current) => {
        const currentIndex = current.exerciseId === exerciseId ? current.index : 0;

        return {
          exerciseId,
          index: getNextPlayableImageIndex(currentIndex, images, imageLoadStatus),
        };
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [activeImageIndex, exerciseId, hasMultipleImages, imageLoadStatus, images, isAutoPlaying, isOpen]);

  function selectImage(index: number) {
    setImageSelection({
      exerciseId: exercise?.id ?? "",
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
    <RightDrawer
      ariaLabel="动作详情"
      bodyClassName="custom-scrollbar flex-1 space-y-md overflow-y-auto p-md"
      footer={
        primaryAction && exercise ? (
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
        ) : null
      }
      footerClassName="shrink-0"
      header={
        exercise ? (
          <div className="flex items-center justify-between border-b border-slate-100 bg-white px-lg py-md shadow-sm">
              <div className="flex items-center gap-xs">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <SymbolIcon className="text-[20px]">fitness_center</SymbolIcon>
                </span>
                <div>
                  <h3 className="font-title-md text-title-md font-bold text-slate-800 leading-snug">
                    {exercise.nameZh || "动作详情"}
                  </h3>
                  <p className="font-label-xs text-label-xs text-slate-400">
                    {exercise.nameEn}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:scale-95 transition-all border border-slate-100"
                type="button"
                aria-label="关闭"
              >
                <SymbolIcon className="text-[20px]">close</SymbolIcon>
              </button>
            </div>
        ) : null
      }
      headerClassName="shrink-0"
      isOpen={isOpen && Boolean(exercise)}
      onClose={onClose}
      panelClassName="bg-slate-50"
      widthClassName="sm:w-[460px]"
    >
      {exercise ? (
        <>
              {/* 卡片一：动作视觉演示 (步骤图轮播 + 快切大按钮) */}
              <div className="bg-white shadow-sm rounded-2xl p-md border border-slate-100/60">
                <h4 className="mb-sm flex items-center gap-xs font-label-sm text-label-sm font-bold text-slate-700">
                  <SymbolIcon className="text-primary text-[16px]">visibility</SymbolIcon>
                  动作视频与图解演示
                </h4>

                {/* 大图展示区域 */}
                <div className="group relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-white">
                  <Image
                    alt={`${exercise.nameZh} 演示图`}
                    className="object-cover"
                    fill
                    onError={() => markImageFailed(exerciseId, activeImageUrl)}
                    onLoad={() => markImageLoaded(exerciseId, activeImageUrl)}
                    sizes="(min-width: 640px) 428px, calc(100vw - 32px)"
                    src={activeImageUrl}
                  />

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
      ) : null}
    </RightDrawer>
  );
}
