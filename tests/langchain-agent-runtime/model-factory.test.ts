import { describe, expect, it } from "vitest";

import {
  createLangChainDeepSeekModel,
} from "@/lib/server/langchain-agent";

describe("LangChain DeepSeek model factory", () => {
  it("creates ChatDeepSeek from centralized env resolution and config defaults", () => {
    const result = createLangChainDeepSeekModel({
      env: {
        DEEPSEEK_API_KEY: "test-key",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      modelName: "deepseek-v4-flash",
      endpoint: "https://api.deepseek.com",
    });
  });

  it("returns a stable config error without an api key", () => {
    const result = createLangChainDeepSeekModel({
      env: {
        DEEPSEEK_API_KEY: "",
      },
    });

    expect(result).toEqual({
      ok: false,
      code: "config_missing",
      message: "DEEPSEEK_API_KEY is required to create the LangChain DeepSeek model.",
      retryable: false,
    });
  });
});
