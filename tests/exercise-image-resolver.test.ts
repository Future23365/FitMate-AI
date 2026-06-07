import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearExerciseImageResolverCache,
  resolveExerciseImageUrls,
} from "@/lib/server/exercise-images/exercise-image-resolver";

import { createExercise } from "./fixtures/domain";

describe("exercise image resolver", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitmate-exercise-images-"));
    clearExerciseImageResolverCache();
  });

  afterEach(() => {
    clearExerciseImageResolverCache();
    fs.rmSync(rootDir, { force: true, recursive: true });
  });

  it("uses manifest records and keeps multi-step image order", () => {
    writeImage("assets/push-up/0.jpg");
    writeImage("assets/push-up/1.jpg");
    writeManifest([
      manifestRecord({ exerciseId: "push-up", stepIndex: 1, sourceImagePath: "push-up/1.jpg" }),
      manifestRecord({ exerciseId: "push-up", stepIndex: 0, sourceImagePath: "push-up/0.jpg" }),
    ]);

    const urls = resolveExerciseImageUrls(
      createExercise({
        id: "push-up",
        images: ["push-up/0.jpg", "push-up/1.jpg"],
        imageUrls: [
          "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/push-up/0.jpg",
          "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/push-up/1.jpg",
        ],
      }),
      testConfig(),
    );

    expect(urls).toEqual([
      "/api/exercise-images/push-up/0.jpg",
      "/api/exercise-images/push-up/1.jpg",
    ]);
  });

  it("supports external public base URL without requiring local files to exist", () => {
    writeManifest([
      manifestRecord({ exerciseId: "push-up", stepIndex: 0, sourceImagePath: "push-up/0.jpg" }),
    ]);

    const urls = resolveExerciseImageUrls(
      createExercise({ id: "push-up", images: ["push-up/0.jpg"], imageUrls: [] }),
      testConfig({ publicBaseUrl: "https://cdn.example.com/exercises/" }),
    );

    expect(urls).toEqual(["https://cdn.example.com/exercises/push-up/0.jpg"]);
  });

  it("falls back to source paths when the manifest is missing", () => {
    writeImage("assets/pull-up/0.jpg");

    const urls = resolveExerciseImageUrls(
      createExercise({ id: "pull-up", images: ["pull-up/0.jpg"], imageUrls: [] }),
      testConfig(),
    );

    expect(urls).toEqual(["/api/exercise-images/pull-up/0.jpg"]);
  });

  it("returns an empty list when local resources are missing and no fallback is configured", () => {
    writeManifest([
      manifestRecord({ exerciseId: "missing-push-up", stepIndex: 0, sourceImagePath: "missing-push-up/0.jpg" }),
    ]);

    const urls = resolveExerciseImageUrls(
      createExercise({ id: "missing-push-up", images: ["missing-push-up/0.jpg"], imageUrls: [] }),
      testConfig(),
    );

    expect(urls).toEqual([]);
  });

  it("keeps existing non-GitHub display URLs when no local resource is available", () => {
    const urls = resolveExerciseImageUrls(
      createExercise({ id: "legacy-push-up", images: [], imageUrls: ["/push-up.png"] }),
      testConfig(),
    );

    expect(urls).toEqual(["/push-up.png"]);
  });

  it("extracts local path structure from raw GitHub image URLs", () => {
    writeImage("assets/sit-up/0.jpg");

    const urls = resolveExerciseImageUrls(
      createExercise({
        id: "sit-up",
        images: [],
        imageUrls: ["https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/sit-up/0.jpg"],
      }),
      testConfig(),
    );

    expect(urls).toEqual(["/api/exercise-images/sit-up/0.jpg"]);
  });

  function testConfig(overrides: { publicBaseUrl?: string } = {}) {
    return {
      rootDir,
      localDir: "assets",
      ...overrides,
    };
  }

  function writeImage(relativePath: string) {
    const filePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "image");
  }

  function writeManifest(images: Array<ReturnType<typeof manifestRecord>>) {
    const manifestPath = path.join(rootDir, "assets", "_manifest.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ images }, null, 2));
    clearExerciseImageResolverCache();
  }

  function manifestRecord(input: {
    exerciseId: string;
    stepIndex: number;
    sourceImagePath: string;
  }) {
    return {
      exerciseId: input.exerciseId,
      nameZh: input.exerciseId,
      stepIndex: input.stepIndex,
      sourceUrl: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${input.sourceImagePath}`,
      sourceImagePath: input.sourceImagePath,
      localPath: path.join("assets", input.sourceImagePath),
      status: "downloaded",
      bytes: 5,
      contentType: "image/jpeg",
      error: null,
    };
  }
});
