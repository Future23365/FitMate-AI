import { describe, expect, it } from "vitest";
import { z } from "zod";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  createProductionAgentModelVisibleTextSamples,
  createProductionLangChainToolCatalog,
  getLangChainToolProviderInputSchema,
  lintAgentModelVisibleTextSamples,
  productionLangChainTools,
} from "@/lib/server/langchain-agent";
import type { ExerciseResourceFacetCatalog } from "@/lib/server/exercises/exercise-repository";

describe("production LangChain tool catalog", () => {
  it("builds the static production tool catalog from centralized config", () => {
    const tools = createProductionLangChainToolCatalog();

    expect(tools.map((tool) => tool.name)).toEqual(agentRuntimeConfig.langChain.toolCatalog.allowedToolNames);
    expect(tools.map((tool) => tool.name)).toEqual([
      "inspectVisibleTrainingProposals",
      "resolveExerciseResourceMentions",
      "searchExerciseResources",
      "submitVisibleTrainingProposal",
    ]);
    expect(tools.map((tool) => tool.name)).not.toContain("readFixture");
    expect(tools.map((tool) => tool.name)).not.toContain("reportAgentActivity");
    expect(tools.map((tool) => tool.timeoutMs)).toEqual([
      agentRuntimeConfig.tools.inspectVisibleTrainingProposals.timeoutMs,
      agentRuntimeConfig.tools.resolveExerciseResourceMentions.timeoutMs,
      agentRuntimeConfig.tools.searchExerciseResources.timeoutMs,
      agentRuntimeConfig.tools.submitVisibleTrainingProposal.timeoutMs,
    ]);
  });

  it("keeps tool descriptions in Chinese without old AgentAction contract terms", () => {
    const descriptions = productionLangChainTools.map((tool) => tool.description).join("\n");
    const modelVisibleSamples = createProductionAgentModelVisibleTextSamples();
    const schemaDescriptions = modelVisibleSamples
      .filter((sample) => sample.kind === "schema_description")
      .map((sample) => sample.text)
      .join("\n");
    const findings = lintAgentModelVisibleTextSamples(modelVisibleSamples);

    expect(schemaDescriptions).toContain("当前业务 tool call 的用户可见 UI 状态短句");
    expect(schemaDescriptions).toContain("不是调用理由、业务事实、tool output 或最终回答依据");
    expect(schemaDescriptions).not.toContain("reportAgentActivity");
    expect(descriptions).toContain("只读");
    expect(descriptions).toContain("服务端");
    expect(descriptions).toContain("动作候选");
    expect(descriptions).toContain("zeroMatchMuscles");
    expect(descriptions).toContain("多 muscles 查询用于获得代表性候选覆盖");
    expect(descriptions).toContain("不是必须继续补查每个肌群的义务");
    expect(descriptions).toContain("只在用户目标、上下文、已验证事实或当前规划确实需要该条件时填写");
    expect(descriptions).toContain("exercise_selection");
    expect(descriptions).toContain("动作推荐集合");
    expect(descriptions).toContain("不包含 prescription 或 schedule");
    expect(descriptions).toContain("不主动输出组数、次数、时长、休息时间、训练频率、日程或等价处方参数");
    expect(descriptions).toContain("validator");
    expect(descriptions).not.toContain("缺少 warmup 或 stretch");
    expect(descriptions).not.toContain("缺 warmup 或 stretch");
    expect(descriptions).not.toContain("support section");
    expect(descriptions).not.toContain("先查询");
    expect(descriptions).not.toContain("必须调用");
    expect(descriptions).not.toContain("nextActionHints");
    expect(descriptions).not.toContain("continue_tool_call");
    expect(descriptions).not.toContain("AgentAction");
    expect(descriptions).not.toContain("ToolRegistry");
    expect(descriptions).not.toContain("PlannerPort");
    expect(descriptions).not.toContain("final_answer");
    expect(descriptions).not.toContain("ask_user");
    expect(descriptions).not.toContain("reportAgentActivity");
    expect(findings).toEqual([]);
  });

  it("exposes runtimeMetadata only through provider-visible business tool schemas", () => {
    const tools = createProductionLangChainToolCatalog();

    for (const tool of tools) {
      const providerSchemaJson = JSON.stringify(z.toJSONSchema(getLangChainToolProviderInputSchema(tool)));

      expect(tool.executionKind ?? "business").toBe("business");
      expect(providerSchemaJson).toContain("runtimeMetadata");
      expect(providerSchemaJson).toContain("activitySummary");
      expect(tool.inputSchema.safeParse({
        runtimeMetadata: { activitySummary: "正在处理当前请求" },
      }).success).toBe(false);
    }
  });

  it("injects search facet catalog into the search tool description without changing the whitelist", () => {
    const tools = createProductionLangChainToolCatalog({
      searchExerciseResourcesFacetCatalog: createFacetCatalog(),
    });
    const searchTool = tools.find((tool) => tool.name === "searchExerciseResources");

    expect(tools.map((tool) => tool.name)).toEqual(agentRuntimeConfig.langChain.toolCatalog.allowedToolNames);
    expect(searchTool?.description).toContain("当前动作库 facet catalog 摘要");
    expect(searchTool?.description).toContain("胸部");
    expect(searchTool?.description).toContain("no_equipment");
  });

  it("keeps search schema descriptions aligned with default and clarification boundaries", () => {
    const samples = createProductionAgentModelVisibleTextSamples({
      searchExerciseResourcesFacetCatalog: createFacetCatalog(),
    });
    const schemaDescriptions = samples
      .filter((sample) => sample.id.startsWith("searchExerciseResources.input_schema."))
      .map((sample) => sample.text)
      .join("\n");

    expect(schemaDescriptions).toContain("多值查询用于获得代表性候选覆盖");
    expect(schemaDescriptions).toContain("不是必须继续补查每个肌群的义务");
    expect(schemaDescriptions).toContain("只在用户目标、上下文、已验证事实或当前规划确实需要环境、场地或支撑条件时填写");
    expect(schemaDescriptions).toContain("省略表示不额外限定环境条件");
  });

  it("does not expose published as searchExerciseResources model input", () => {
    const tools = createProductionLangChainToolCatalog({
      searchExerciseResourcesFacetCatalog: createFacetCatalog(),
    });
    const searchTool = tools.find((tool) => tool.name === "searchExerciseResources");

    expect(searchTool?.description).not.toContain("published");
    expect(searchTool?.inputSchema.safeParse({
      muscles: ["胸部"],
      published: true,
      sort: "name_asc",
    }).success).toBe(false);
  });
});

function createFacetCatalog(): ExerciseResourceFacetCatalog {
  return {
    muscles: ["胸部", "肱三头肌"],
    categories: ["力量"],
    levels: ["beginner"],
    forces: ["push"],
    mechanics: ["compound"],
    equipment: ["自重"],
    homeRequirements: ["none", "地面"],
    goalTags: ["strength"],
    riskTags: [],
    suitabilities: ["training", "warmup", "stretch"],
  };
}
