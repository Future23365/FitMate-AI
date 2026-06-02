import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

describe("next image config", () => {
  it("uses the Next image optimizer for local exercise image URLs", () => {
    expect(nextConfig.images).toMatchObject({
      unoptimized: false,
      formats: expect.arrayContaining(["image/avif", "image/webp"]),
      imageSizes: expect.arrayContaining([48, 96, 256]),
    });
  });
});
