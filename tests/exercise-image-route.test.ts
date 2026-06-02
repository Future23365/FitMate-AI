import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exerciseImageRoute = await import("@/app/api/exercise-images/[...path]/route");

describe("exercise image route", () => {
  let rootDir: string;
  let imageDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitmate-exercise-image-route-"));
    imageDir = path.join(rootDir, "images");
    vi.stubEnv("EXERCISE_IMAGE_LOCAL_DIR", imageDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(rootDir, { force: true, recursive: true });
  });

  it("reads legal local images with content type and cache headers", async () => {
    writeImage("push-up/0.jpg", "image");

    const response = await exerciseImageRoute.GET(request("push-up/0.jpg"), routeParams("push-up", "0.jpg"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    await expect(response.arrayBuffer()).resolves.toHaveProperty("byteLength", 5);
  });

  it("rejects path traversal before reading files", async () => {
    const response = await exerciseImageRoute.GET(request("../secret.jpg"), routeParams("..", "secret.jpg"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_image_path" });
  });

  it("rejects non-image extensions", async () => {
    writeImage("push-up/readme.txt", "text");

    const response = await exerciseImageRoute.GET(request("push-up/readme.txt"), routeParams("push-up", "readme.txt"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "unsupported_image_type" });
  });

  it("returns 404 for missing images", async () => {
    const response = await exerciseImageRoute.GET(request("push-up/missing.jpg"), routeParams("push-up", "missing.jpg"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "image_not_found" });
  });

  function writeImage(relativePath: string, content: string) {
    const filePath = path.join(imageDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  function request(pathname: string) {
    return new Request(`http://localhost/api/exercise-images/${pathname}`);
  }

  function routeParams(...segments: string[]) {
    return {
      params: Promise.resolve({ path: segments }),
    };
  }
});
