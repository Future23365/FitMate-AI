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
    const searchSchemaDescriptions = modelVisibleSamples
      .filter((sample) => sample.id.startsWith("searchExerciseResources.input_schema."))
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
    const searchModelVisibleText = [
      searchDescription,
      searchSchemaDescriptions,
    ].join("\n");
    const findings = lintAgentModelVisibleTextSamples(modelVisibleSamples);

    expect(schemaDescriptions).toContain("当前业务 tool call 的用户可见 UI 状态短句");
    expect(schemaDescriptions).toContain("不是调用理由、业务事实、tool output 或最终回答依据");
    expect(schemaDescriptions).not.toContain("reportAgentActivity");
    expect(descriptions).toContain("只读");
    expect(descriptions).toContain("服务端");
    expect(descriptions).toContain("动作候选");
    expect(descriptions).toContain("exerciseNames");
    expect(descriptions).toContain("多 muscles 查询用于获得覆盖多个请求肌群的候选");
    expect(descriptions).toContain('muscleMatchRole = "primary"');
    expect(descriptions).toContain("请求肌群是动作主练目标");
    expect(descriptions).toContain('muscleMatchRole = "any"');
    expect(descriptions).toContain("肌群是否参与、动作会带到哪些肌群、辅助刺激、稳定参与或宽泛相关动作");
    expect(descriptions).toContain("any 不代表候选动作都同等适合作为目标肌群主练推荐");
    expect(descriptions).toContain("不保证每个候选都同等适合作为最终推荐");
    expect(descriptions).toContain("executionProfile 用于选择动作执行场景");
    expect(descriptions).toContain("no_equipment");
    expect(descriptions).toContain("完整无器械口径");
    expect(descriptions).toContain("默认使用 no_equipment 作为低门槛无器械口径");
    expect(descriptions).toContain("仅在用户明确可用椅子、墙面、台阶等常见居家支撑时使用");
    expect(descriptions).toContain("equipmentScope.mode=compatible_with_available");
    expect(descriptions).toContain("equipmentScope.mode=must_use_any");
    expect(descriptions).toContain("impactLimit 和 noiseLimit 是上限筛选");
    expect(descriptions).toContain("candidateGroups[]");
    expect(descriptions).toContain("候选动作可以被选择、跳过或用于后续结构化输出");
    expect(descriptions).toContain("存在能满足当前目标的可选择子集");
    expect(descriptions).toContain("候选池不要求完全纯净，也不要求先排除未选候选");
    expect(descriptions).toContain("本 tool 只返回动作候选事实");
    expect(descriptions).toContain("不返回 prescription、schedule、routine 或 plan");
    expect(descriptions).toContain("缺口是 prescription 或 schedule 时");
    expect(descriptions).toContain("重复查询动作库不会新增该类事实");
    expect(descriptions).toContain("产品可渲染动作资源库");
    expect(descriptions).toContain("不是现实世界训练知识全集");
    expect(descriptions).toContain("不表示现实训练动作或训练知识不存在");
    expect(descriptions).toContain("不要求最终输出使用全部候选");
    expect(descriptions).toContain("candidateCountPerSection");
    expect(descriptions).toContain("不是分页、offset、cursor 或最终展示数量承诺");
    expect(descriptions).toContain("Kind Selection");
    expect(descriptions).toContain("exercise_selection");
    expect(descriptions).toContain("纯主训练动作推荐集合");
    expect(descriptions).toContain("section 必须全部是 training");
    expect(descriptions).toContain("不得包含 prescription 或 schedule");
    expect(descriptions).toContain("单次可执行训练");
    expect(descriptions).toContain("每个 exerciseItems[] 动作项都必须包含 prescription");
    expect(descriptions).toContain("多天或周期训练计划");
    expect(descriptions).toContain("不替模型生成 prescription");
    expect(descriptions).toContain("可以从当前模型可见候选事实中选择子集构造");
    expect(descriptions).toContain("不要求使用候选池中的全部动作");
    expect(descriptions).toContain("不交付组数次数休息或训练日程");
    expect(descriptions).toContain("payload.kind 应选择 exercise_selection");
    expect(descriptions).toContain("不需要获取全部候选");
    expect(descriptions).toContain("不需要扩大候选数量");
    expect(descriptions).toContain("不需要把未选候选排除");
    expect(descriptions).toContain("历史 routine fact 中的 exerciseId、section 和 prescription 可以作为新的 routine 或 plan 的事实来源");
    expect(descriptions).toContain("prescription 可由模型基于本轮用户目标");
    expect(descriptions).toContain("保守训练编排常识生成");
    expect(descriptions).toContain("prescription 不要求来自动作库查询结果");
    expect(descriptions).toContain("必须绑定在对应 exerciseItems[] 动作项上");
    expect(descriptions).toContain("schedule 不要求来自动作库查询结果");
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
    expect(schemaDescriptions).toContain("inspectVisibleTrainingProposals 导入的历史 visibleTrainingProposal 事实");
    expect(schemaDescriptions).toContain("routine / plan 的 prescription 可由模型基于本轮用户目标");
    expect(schemaDescriptions).toContain("候选动作事实和保守训练编排生成");
    expect(schemaDescriptions).toContain("schedule 可由模型基于本轮用户目标");
    expect(schemaDescriptions).toContain("模型需要主训练、热身或拉伸候选时自行选择对应值");
    expect(schemaDescriptions).toContain("每个请求 section 最多返回多少个动作候选");
    expect(schemaDescriptions).toContain("模型已经结构化提取出的点名动作名称数组");
    expect(schemaDescriptions).toContain("肌群匹配角色");
    expect(schemaDescriptions).toContain('默认 "primary"');
    expect(schemaDescriptions).toContain("只匹配 primaryMuscles / primaryMusclesZh");
    expect(schemaDescriptions).toContain("匹配 primaryMuscles / primaryMusclesZh / secondaryMuscles / secondaryMusclesZh");
    expect(systemPrompt).toContain("默认按低门槛无器械条件继续");
    expect(systemPrompt).toContain("动作可在地面或瑜伽垫完成");
    expect(systemPrompt).toContain("不代表用户长期偏好");
    expect(systemPrompt).toContain("不先做无执行场景的宽泛查询");
    expect(systemPrompt).toContain("才把这些条件纳入动作查询口径");
    expect(systemPrompt).toContain("不要因为输出类型从 routine 派生成 plan，就默认重新查询动作");
    expect(systemPrompt).toContain("schedule 是 plan 的日程结构字段，不是动作库查询结果");
    expect(systemPrompt).toContain("prescription 和 schedule 不来自动作库查询结果");
    expect(systemPrompt).toContain("缺少 prescription 或 schedule 不等价于缺少动作候选事实");
    expect(systemPrompt).toContain("保守训练编排构造 prescription / schedule");
    expect(systemPrompt).toContain("产品可渲染动作资源库");
    expect(systemPrompt).toContain("不是现实训练知识全集");
    expect(systemPrompt).toContain("不表示现实训练动作不存在");
    expect(systemPrompt).toContain("不能用通用训练知识编造成数据库资源");
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
    expect(searchModelVisibleText).not.toContain("服务端");
    expect(searchModelVisibleText).not.toContain("数据库筛选");
    expect(searchModelVisibleText).not.toContain("底层");
    expect(searchModelVisibleText).not.toContain("确定性映射");
    expect(searchModelVisibleText).not.toContain("hard filter");
    expect(searchModelVisibleText).not.toContain("support_section");
    expect(searchModelVisibleText).not.toContain("where 条件");
    expect(searchModelVisibleText).not.toContain("全库读取能力");
    expect(descriptions).not.toContain("requiresExternalEquipment=false");
    expect(descriptions).not.toContain("requiredEquipmentTags 表示");
    expect(descriptions).not.toContain("supportRequirementTags 表示");
    expect(descriptions).not.toContain("setupComplexityMax");
    expect(descriptions).not.toContain("impactLevelMax");
    expect(descriptions).not.toContain("noiseLevelMax");
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
    expect(searchTool?.description).toContain("executionProfile");
    expect(searchTool?.description).toContain("no_equipment");
    expect(searchTool?.description).toContain("equipmentScope.tags");
    expect(searchTool?.description).toContain("impactLimit");
    expect(searchTool?.description).toContain("noiseLimit");
    expect(searchTool?.description).not.toContain("requiresExternalEquipment");
    expect(searchTool?.description).not.toContain("supportRequirementTags");
  });

  it("keeps search schema descriptions aligned with default and clarification boundaries", () => {
    const samples = createProductionAgentModelVisibleTextSamples({
      searchExerciseResourcesFacetCatalog: createFacetCatalog(),
    });
    const schemaDescriptions = samples
      .filter((sample) => sample.id.startsWith("searchExerciseResources.input_schema."))
      .map((sample) => sample.text)
      .join("\n");

    expect(schemaDescriptions).toContain("多值查询用于获得覆盖多个请求肌群的候选");
    expect(schemaDescriptions).toContain("动作候选用途查询口径数组，只允许 warmup、training 或 stretch");
    expect(schemaDescriptions).toContain("模型需要主训练、热身或拉伸候选时自行选择对应值");
    expect(schemaDescriptions).toContain("每个请求 section 最多返回多少个动作候选");
    expect(schemaDescriptions).toContain("不是分页、offset、cursor 或最终展示数量承诺");
    expect(schemaDescriptions).toContain("模型已经结构化提取出的点名动作名称数组");
    expect(schemaDescriptions).toContain("该字段与 muscleMatchRole 共同决定匹配主练肌群还是主/辅任意参与肌群");
    expect(schemaDescriptions).toContain("肌群匹配角色");
    expect(schemaDescriptions).toContain('默认 "primary"');
    expect(schemaDescriptions).toContain('"any" 返回的是参与候选');
    expect(schemaDescriptions).toContain("动作执行场景筛选");
    expect(schemaDescriptions).toContain("默认使用 no_equipment 作为低门槛无器械口径");
    expect(schemaDescriptions).toContain("完整无器械口径");
    expect(schemaDescriptions).toContain("仅在用户明确可用椅子、墙面、台阶等常见居家支撑时使用");
    expect(schemaDescriptions).toContain("compatible_with_available");
    expect(schemaDescriptions).toContain("must_use_any");
    expect(schemaDescriptions).toContain("冲击程度上限筛选");
    expect(schemaDescriptions).toContain("噪音程度上限筛选");
    expect(schemaDescriptions).not.toContain("zeroMatchMuscles");
    expect(schemaDescriptions).not.toContain("requiresExternalEquipment");
    expect(schemaDescriptions).not.toContain("requiredEquipmentTags");
    expect(schemaDescriptions).not.toContain("supportRequirementTags");
    expect(schemaDescriptions).not.toContain("setupComplexityMax");
    expect(schemaDescriptions).not.toContain("服务端");
    expect(schemaDescriptions).not.toContain("数据库筛选");
    expect(schemaDescriptions).not.toContain("底层");
    expect(schemaDescriptions).not.toContain("确定性映射");
    expect(schemaDescriptions).not.toContain("hard filter");
    expect(schemaDescriptions).not.toContain("support_section");
  });

  it("exposes only controlled searchExerciseResources input fields", () => {
    const tools = createProductionLangChainToolCatalog({
      searchExerciseResourcesFacetCatalog: createFacetCatalog(),
    });
    const searchTool = tools.find((tool) => tool.name === "searchExerciseResources");
    const inputSchemaJson = JSON.stringify(z.toJSONSchema(searchTool!.inputSchema));

    expect(searchTool?.description).not.toContain("published");
    expect(inputSchemaJson).toContain("\"candidateCountPerSection\"");
    expect(inputSchemaJson).toContain("\"executionProfile\"");
    expect(inputSchemaJson).toContain("\"equipmentScope\"");
    expect(inputSchemaJson).toContain("\"impactLimit\"");
    expect(inputSchemaJson).toContain("\"noiseLimit\"");
    expect(inputSchemaJson).toContain("\"muscleMatchRole\"");
    for (const forbiddenField of [
      "requiresExternalEquipment",
      "requiredEquipmentTags",
      "supportRequirementTags",
      "setupComplexityMax",
      "impactLevelMax",
      "noiseLevelMax",
      "equipment",
      "homeRequirement",
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
      muscleMatchRole: "any",
      candidateCountPerSection: 24,
      executionProfile: "no_equipment",
      impactLimit: "low",
      noiseLimit: "quiet",
      sort: "name_asc",
    }).success).toBe(true);
    expect(searchTool?.inputSchema.safeParse({
      muscles: ["胸部"],
      muscleMatchRole: "secondary",
      sort: "name_asc",
    }).success).toBe(false);
    expect(searchTool?.inputSchema.safeParse({
      muscles: ["胸部"],
      executionProfile: "no_equipment",
      equipmentScope: { mode: "must_use_any", tags: ["dumbbell"] },
      sort: "name_asc",
    }).success).toBe(false);
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
    executionTaxonomy: {
      requiresExternalEquipment: [false, true],
      requiredEquipmentTags: ["dumbbell", "resistance_band"],
      supportRequirementTags: ["none", "floor_or_mat"],
      setupComplexities: ["zero_setup", "floor_or_mat"],
      impactLevels: ["low", "medium"],
      noiseLevels: ["quiet", "normal"],
    },
    goalTags: ["strength"],
    riskTags: [],
    suitabilities: ["training", "warmup", "stretch"],
  };
}
