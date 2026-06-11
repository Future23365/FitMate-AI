import { describe, expect, it } from "vitest";

import {
  agentRuntimeConfig,
  resolveLangChainDeepSeekProviderConfig,
} from "@/lib/server/config";

describe("LangChain Agent runtime config", () => {
  it("centralizes DeepSeek native tool calling defaults", () => {
    expect(agentRuntimeConfig.langChain.runtimeVersion).toBe("langchain-agent-runtime-v1");
    expect(agentRuntimeConfig.langChain.model).toMatchObject({
      provider: "deepseek",
      integrationPackage: "@langchain/deepseek",
      defaultModel: "deepseek-v4-flash",
      defaultEndpoint: "https://api.deepseek.com",
      temperature: 0,
      toolCalling: {
        enabled: true,
        toolChoice: "auto",
        strictMode: false,
      },
      thinking: {
        type: "disabled",
      },
    });
  });

  it("keeps production tool catalog static and free of fixture tools", () => {
    expect(agentRuntimeConfig.langChain.toolCatalog.allowedToolNames).toEqual([
      "inspectVisibleTrainingProposals",
      "resolveExerciseResourceMentions",
      "searchExerciseResources",
      "submitVisibleTrainingProposal",
    ]);
    expect(agentRuntimeConfig.langChain.toolCatalog.allowedToolNames).not.toContain("readFixture");
  });

  it("resolves DeepSeek deployment env without route-level parsing", () => {
    expect(resolveLangChainDeepSeekProviderConfig({
      DEEPSEEK_API_KEY: " test-key ",
    })).toEqual({
      ok: true,
      config: {
        apiKey: "test-key",
        endpoint: agentRuntimeConfig.langChain.model.defaultEndpoint,
        model: agentRuntimeConfig.langChain.model.defaultModel,
      },
    });

    expect(resolveLangChainDeepSeekProviderConfig({
      DEEPSEEK_API_KEY: "test-key",
      DEEPSEEK_API_URL: " https://example.test ",
      DEEPSEEK_MODEL: " deepseek-v4-pro ",
    })).toEqual({
      ok: true,
      config: {
        apiKey: "test-key",
        endpoint: "https://example.test",
        model: "deepseek-v4-pro",
      },
    });
  });

  it("returns a stable configuration error when DeepSeek api key is absent", () => {
    expect(resolveLangChainDeepSeekProviderConfig({ DEEPSEEK_API_KEY: " " })).toEqual({
      ok: false,
      code: "missing_deepseek_api_key",
      message: "DEEPSEEK_API_KEY is required to create the LangChain DeepSeek model.",
    });
  });
});
