import { describe, expect, it } from "vitest";

import {
  agentRuntimeConfig,
  resolveLangChainDeepSeekProviderConfig,
} from "@/lib/server/config";
import { resolveLangChainGraphRecursionLimit } from "@/lib/server/langchain-agent";

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
      "searchExerciseResources",
      "submitVisibleTrainingProposal",
    ]);
    expect(agentRuntimeConfig.langChain.toolCatalog.allowedToolNames).not.toContain("readFixture");
  });

  it("centralizes searchExerciseResources candidate count limits", () => {
    expect(agentRuntimeConfig.tools.searchExerciseResources).toMatchObject({
      timeoutMs: 2_000,
      defaultCandidateCountPerSection: 8,
      maxCandidateCountPerSection: 24,
    });
  });

  it("keeps LangChain run budgets synchronized with graph recursion semantics", () => {
    expect(agentRuntimeConfig.langChain.runBudget).toMatchObject({
      maxModelCalls: 21,
      maxToolCalls: 20,
      maxToolCallsPerTool: 2,
      overallTimeoutMs: 40_000,
    });
    expect(resolveLangChainGraphRecursionLimit(agentRuntimeConfig.langChain.runBudget)).toBe(63);
    expect(agentRuntimeConfig.langChain.runBudget.maxModelCalls).toBe(
      agentRuntimeConfig.langChain.runBudget.maxToolCalls + 1,
    );
    expect("maxActivityReports" in agentRuntimeConfig.langChain.runBudget).toBe(false);
    expect(agentRuntimeConfig.langChain.runtimeActivity).toMatchObject({
      maxSummaryLength: 80,
      maxMetadataEvents: 20,
      defaultSummary: "正在处理当前请求",
    });
    expect("maxIterations" in agentRuntimeConfig.langChain.runBudget).toBe(false);
    expect("structuredOutputValidationTimeoutMs" in agentRuntimeConfig.langChain.runBudget).toBe(false);
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
