import { describe, expect, it } from "vitest";

import {
  canExercisePreviewAutoPlay,
  createExercisePreviewImageSetKey,
  exercisePreviewPlaceholderImage,
  normalizeExercisePreviewImages,
} from "@/features/exercises/lib/exercise-preview-images";

describe("exercise preview image state", () => {
  it("uses the shared placeholder when an exercise has no usable images", () => {
    expect(normalizeExercisePreviewImages([])).toEqual([exercisePreviewPlaceholderImage]);
    expect(normalizeExercisePreviewImages(["", "  "])).toEqual([exercisePreviewPlaceholderImage]);
    expect(normalizeExercisePreviewImages(["  /exercise/a.jpg  "])).toEqual(["/exercise/a.jpg"]);
  });

  it("creates a different image set key when the same exercise receives full detail images", () => {
    const previewKey = createExercisePreviewImageSetKey(["/preview/a.jpg"]);
    const detailKey = createExercisePreviewImageSetKey(["/detail/a-0.jpg", "/detail/a-1.jpg"]);

    expect(detailKey).not.toBe(previewKey);
  });

  it("allows autoplay only after every preview image has loaded", () => {
    const images = ["/exercises/a/0.jpg", "/exercises/a/1.jpg"];

    expect(canExercisePreviewAutoPlay(images, {})).toBe(false);
    expect(canExercisePreviewAutoPlay(images, { [images[0]]: "loaded" })).toBe(false);
    expect(
      canExercisePreviewAutoPlay(images, {
        [images[0]]: "loaded",
        [images[1]]: "failed",
      })
    ).toBe(false);
    expect(
      canExercisePreviewAutoPlay(images, {
        [images[0]]: "loaded",
        [images[1]]: "loaded",
      })
    ).toBe(true);
  });
});
