export type ExercisePreviewImageLoadStatus = "loaded" | "failed";

export type ExercisePreviewImageLoadState = {
  exerciseId: string;
  imageSetKey: string;
  statusByUrl: Record<string, ExercisePreviewImageLoadStatus>;
};

// 抽屉图片延迟加载时长与 RightDrawer 的 0.5s 入场动画保持一致，避免动画中抢先加载旧图。
export const exercisePreviewImageLoadDelayMs = 500;
export const exercisePreviewAutoplayIntervalMs = 1200;

export const emptyExercisePreviewImageLoadStatus: Record<string, ExercisePreviewImageLoadStatus> = {};

// normalizeExercisePreviewImages 只保留可展示图片；缺图时返回空集合，由展示层渲染空白状态。
export function normalizeExercisePreviewImages(imageUrls: readonly string[] | null | undefined) {
  return (imageUrls ?? []).flatMap((url) => {
    const normalizedUrl = url.trim();

    return normalizedUrl ? [normalizedUrl] : [];
  });
}

// createExercisePreviewImageSetKey 标识同一个动作下的图片来源版本，用于完整详情替换预览详情时重置旧图。
export function createExercisePreviewImageSetKey(images: readonly string[]) {
  return images.join("\n");
}

// areExercisePreviewImagesLoaded 是自动轮播的确定性闸门：所有演示图 ready 后才允许切换。
export function areExercisePreviewImagesLoaded(
  images: readonly string[],
  imageLoadStatus: Record<string, ExercisePreviewImageLoadStatus>
) {
  return images.length > 0 && images.every((src) => imageLoadStatus[src] === "loaded");
}

// canExercisePreviewAutoPlay 收敛默认轮播条件，避免只有一张图或图片未加载完成时切换。
export function canExercisePreviewAutoPlay(
  images: readonly string[],
  imageLoadStatus: Record<string, ExercisePreviewImageLoadStatus>
) {
  return images.length > 1 && areExercisePreviewImagesLoaded(images, imageLoadStatus);
}
