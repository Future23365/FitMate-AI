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
      "searchExerciseResources",
      "submitVisibleTrainingProposal",
    ]);
    expect(tools.map((tool) => tool.name)).not.toContain("readFixture");
    expect(tools.map((tool) => tool.name)).not.toContain("reportAgentActivity");
    expect(tools.map((tool) => tool.timeoutMs)).toEqual([
      agentRuntimeConfig.tools.inspectVisibleTrainingProposals.timeoutMs,
      agentRuntimeConfig.tools.searchExerciseResources.timeoutMs,
      agentRuntimeConfig.tools.submitVisibleTrainingProposal.timeoutMs,
    ]);
  });

  it("keeps tool descriptions in Chinese without old AgentAction contract terms", () => {
    const descriptions = productionLangChainTools.map((tool) => tool.description).join("\n");
    const searchDescription = productionLangChainTools.find((tool) => tool.name === "searchExerciseResources")?.description ?? "";
    const modelVisibleSamples = createProductionAgentModelVisibleTextSamples();
    const systemPrompt = modelVisibleSamples
      .filter((sample) => sample.kind === "system_prompt")
      .map((sample) => sample.text)
      .join("\n");
    const schemaDescriptions = modelVisibleSamples
      .filter((sample) => sample.kind === "schema_description")
      .map((sample) => sample.text)
      .join("\n");
    const finalizationDescriptions = modelVisibleSamples
      .filter((sample) => sample.kind === "finalization_tool_description")
      .map((sample) => sample.text)
      .join("\n");
    const modelVisibleText = [
      systemPrompt,
      descriptions,
      schemaDescriptions,
      finalizationDescriptions,
    ].join("\n");
    const findings = lintAgentModelVisibleTextSamples(modelVisibleSamples);

    expect(schemaDescriptions).toContain("当前业务 tool call 的用户可见 UI 状态短句");
    expect(schemaDescriptions).toContain("不是调用理由、业务事实、tool output 或最终回答依据");
    expect(schemaDescriptions).not.toContain("reportAgentActivity");
    expect(descriptions).toContain("只读");
    expect(descriptions).toContain("服务端");
    expect(descriptions).toContain("动作候选");
    expect(descriptions).toContain("exerciseNames");
    expect(descriptions).toContain("多 muscles 查询用于获得代表性候选覆盖");
    expect(descriptions).toContain("不提供精确匹配数量、截断状态、过滤执行细节或下一步固定 workflow");
    expect(descriptions).toContain("只在用户目标、上下文、已验证事实或当前规划确实需要该条件时填写");
    expect(descriptions).toContain("candidateGroups[]");
    expect(descriptions).toContain("candidateCountPerSection");
    expect(descriptions).toContain("不是分页、offset、cursor、全库读取能力或最终展示数量承诺");
    expect(descriptions).toContain("Kind Selection");
    expect(descriptions).toContain("exercise_selection");
    expect(descriptions).toContain("纯主训练动作推荐集合");
    expect(descriptions).toContain("section 必须全部是 training");
    expect(descriptions).toContain("不得包含 prescription 或 schedule");
    expect(descriptions).toContain("单次可执行训练");
    expect(descriptions).toContain("每个 exerciseItems[] 动作项都必须包含 prescription");
    expect(descriptions).toContain("多天或周期训练计划");
    expect(descriptions).toContain("不替模型生成 prescription");
    expect(descriptions).toContain("suitabilities 可声明 warmup、training、stretch");
    expect(descriptions).toContain("候选用途查询口径，不是最终训练编排命令");
    expect(descriptions).toContain("candidateGroups[].suitability 只表示该组候选来自哪个 suitabilities 查询口径");
    expect(descriptions).toContain("validator");
    expect(schemaDescriptions).toContain("Kind Selection");
    expect(schemaDescriptions).toContain("exercise_selection 只用于纯主训练动作推荐集合");
    expect(schemaDescriptions).toContain("routine 用于单次可执行训练");
    expect(schemaDescriptions).toContain("plan 用于多天或周期训练计划");
    expect(schemaDescriptions).toContain("kind=exercise_selection 时不得填写");
    expect(schemaDescriptions).toContain("kind=routine 或 kind=plan 时每个动作项都必须填写");
    expect(schemaDescriptions).toContain("kind=plan 时必须填写");
    expect(schemaDescriptions).toContain("模型需要主训练、热身或拉伸候选时自行选择对应值");
    expect(schemaDescriptions).toContain("每个请求 section 最多返回多少个动作候选");
    expect(schemaDescriptions).toContain("模型已经结构化提取出的点名动作名称数组");
    expect(finalizationDescriptions).toContain("补齐未覆盖 section 的用户消息");
    expect(systemPrompt).not.toContain("缺少 warmup");
    expect(systemPrompt).not.toContain("缺少 stretch");
    expect(systemPrompt).not.toContain("warmup、training、stretch");
    expect(descriptions).not.toContain("缺少 warmup 或 stretch");
    expect(descriptions).not.toContain("缺 warmup 或 stretch");
    expect(searchDescription).not.toContain("sectionSummary");
    expect(searchDescription).not.toContain("availableSections");
    expect(searchDescription).not.toContain("missingSections");
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
    expect(descriptions).not.toContain("resolveExerciseResourceMentions");
    expect(modelVisibleText).not.toContain("fulfillment.satisfied");
    expect(modelVisibleText).not.toContain("supportsSuccessfulVisibleOutputs");
    expect(modelVisibleText).not.toContain("finalAnswerSupport");
    expect(modelVisibleText).not.toContain("nextActionHints");
    expect(modelVisibleText).not.toContain("resolveExerciseResourceMentions");
    expect(modelVisibleText).not.toContain("zeroMatchMuscles");
    expect(schemaDescriptions).not.toContain("\"q\"");
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
    expect(schemaDescriptions).toContain("不回显各肌群零命中桶、精确命中数或截断状态");
    expect(schemaDescriptions).toContain("动作候选用途查询口径数组，只允许 warmup、training 或 stretch");
    expect(schemaDescriptions).toContain("模型需要主训练、热身或拉伸候选时自行选择对应值");
    expect(schemaDescriptions).toContain("服务端不根据用户原文分流");
    expect(schemaDescriptions).toContain("每个请求 section 最多返回多少个动作候选");
    expect(schemaDescriptions).toContain("不是分页、offset、cursor、全库读取能力或最终展示数量承诺");
    expect(schemaDescriptions).toContain("模型已经结构化提取出的点名动作名称数组");
    expect(schemaDescriptions).toContain("只在用户目标、上下文、已验证事实或当前规划确实需要环境、场地或支撑条件时填写");
    expect(schemaDescriptions).toContain("省略表示不额外限定环境条件");
    expect(schemaDescriptions).not.toContain("zeroMatchMuscles");
  });

  it("exposes only controlled searchExerciseResources input fields", () => {
    const tools = createProductionLangChainToolCatalog({
      searchExerciseResourcesFacetCatalog: createFacetCatalog(),
    });
    const searchTool = tools.find((tool) => tool.name === "searchExerciseResources");
    const inputSchemaJson = JSON.stringify(z.toJSONSchema(searchTool!.inputSchema));

    expect(searchTool?.description).not.toContain("published");
    expect(inputSchemaJson).toContain("\"candidateCountPerSection\"");
    for (const forbiddenField of [
      "limit",
      "page",
      "pageSize",
      "offset",
      "take",
      "cursor",
      "maxReturned",
      "published",
      "q",
    ]) {
      expect(inputSchemaJson).not.toContain(`"${forbiddenField}"`);
    }
    expect(searchTool?.inputSchema.safeParse({
      muscles: ["胸部"],
      published: true,
      sort: "name_asc",
    }).success).toBe(false);
    expect(searchTool?.inputSchema.safeParse({
      q: "俯卧撑",
      sort: "name_asc",
    }).success).toBe(false);
    expect(searchTool?.inputSchema.safeParse({
      muscles: ["胸部"],
      candidateCountPerSection: 24,
      sort: "name_asc",
    }).success).toBe(true);
    expect(searchTool?.inputSchema.safeParse({
      muscles: ["胸部"],
      candidateCountPerSection: 25,
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
