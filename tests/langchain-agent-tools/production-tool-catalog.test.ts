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
    const submitDescription = productionLangChainTools.find((tool) => tool.name === "submitVisibleTrainingProposal")?.description ?? "";
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
    expect(searchDescription).toContain("Purpose");
    expect(searchDescription).toContain("Use When");
    expect(searchDescription).toContain("Do Not Use When");
    expect(searchDescription).toContain("Input Source");
    expect(searchDescription).toContain("Output Meaning");
    expect(searchDescription).toContain("Grounding Rules");
    expect(descriptions).toContain("只读");
    expect(descriptions).toContain("动作候选");
    expect(descriptions).toContain("exerciseNames");
    expect(descriptions).toContain("多 muscles 查询用于获得覆盖多个请求肌群的候选");
    expect(searchDescription).toContain("一次 routine 或 plan 同时需要热身、主训练和拉伸候选时");
    expect(searchDescription).toContain("可以在同一次调用中传入多个 suitabilities");
    expect(searchDescription).toContain("不要为了完整 inventory、所有肌群或更纯净候选池继续拆分查询");
    expect(descriptions).toContain("Input Source：muscles 只能来自用户明确指定的目标肌群");
    expect(descriptions).toContain("不要把宽泛目标、常规训练知识或未指定肌群扩展成全身肌群清单");
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
    expect(descriptions).toContain("candidateGroups[].exercises 是可消费动作候选事实");
    expect(descriptions).toContain("候选动作可以被选择、跳过或用于后续结构化输出");
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
    expect(descriptions).toContain("Plan Composition");
    expect(descriptions).toContain("payload.kind=plan 表示一套可重复 routine template 加周期 schedule");
    expect(descriptions).toContain("exerciseItems[] 承载同一套 warmup / training / stretch 编排和 prescription");
    expect(descriptions).toContain("schedule.assignments 只表达该 routine template 在周期内的 training / rest 日");
    expect(descriptions).toContain("不为每天内嵌不同完整 exerciseItems");
    expect(descriptions).toContain("fitmate_final_response.content 只解释已校验 plan");
    expect(descriptions).toContain("prescription 可由模型基于本轮用户目标");
    expect(descriptions).toContain("保守训练编排常识生成");
    expect(descriptions).toContain("prescription 不要求来自动作库查询结果");
    expect(descriptions).toContain("必须绑定在对应 exerciseItems[] 动作项上");
    expect(descriptions).toContain("schedule 不要求来自动作库查询结果");
    expect(descriptions).toContain("suitabilities 可声明 warmup、training、stretch");
    expect(descriptions).toContain("候选用途查询口径，不是最终训练编排命令");
    expect(descriptions).toContain("candidateGroups[].suitability 只表示该组候选来自哪个 suitabilities 查询口径");
    expect(descriptions).toContain("validator");
    expect(descriptions).toContain("training 候选用于支撑主训练动作选择");
    expect(descriptions).toContain("warmup / stretch 候选用于支撑辅助阶段选择");
    expect(descriptions).toContain("辅助阶段不要求每个目标肌群都有 primary 候选");
    expect(submitDescription).toContain("Composition Boundary");
    expect(submitDescription).toContain("当前可见候选已经能组成 training 主体");
    expect(submitDescription).toContain("应从候选池选择子集提交 routine 或 plan");
    expect(submitDescription).toContain("逐个目标肌群补齐辅助候选");
    expect(submitDescription).toContain("未指定具体肌群的 routine 不要求覆盖所有主要肌群");
    expect(submitDescription).toContain("当前候选能组成受时长约束的可执行训练主体时");
    expect(schemaDescriptions).toContain("Kind Selection");
    expect(schemaDescriptions).toContain("exercise_selection 只用于纯主训练动作推荐集合");
    expect(schemaDescriptions).toContain("routine 用于单次可执行训练");
    expect(schemaDescriptions).toContain("plan 用于多天或周期训练计划");
    expect(schemaDescriptions).toContain("exerciseItems[] 表示同一套可重复 routine template");
    expect(schemaDescriptions).toContain("schedule 是该 template 的周期安排");
    expect(schemaDescriptions).toContain("schedule.assignments 只表达周期内 training / rest 日");
    expect(schemaDescriptions).toContain("不为每天内嵌不同完整 exerciseItems");
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
    expect(schemaDescriptions).toContain("字段来源只能是用户明确指定的目标肌群、已验证上下文中的目标肌群");
    expect(schemaDescriptions).toContain("模型为当前可执行训练课收敛出的少量必要目标");
    expect(schemaDescriptions).toContain("不要把未指定肌群、宽泛训练目标或常规训练知识展开成全身肌群清单");
    expect(schemaDescriptions).toContain('默认 "primary"');
    expect(schemaDescriptions).toContain("只匹配 primaryMuscles / primaryMusclesZh");
    expect(schemaDescriptions).toContain("匹配 primaryMuscles / primaryMusclesZh / secondaryMuscles / secondaryMusclesZh");
    expect(systemPrompt).toContain("DeepSeek native tool calling");
    expect(systemPrompt).toContain("本次 provider request 实际暴露的 tools schema");
    expect(systemPrompt).toContain("最终回答必须通过 LangChain 结构化终态工具提交");
    expect(systemPrompt).toContain("具体 Markdown 边界以 fitmate_final_response.content schema description 为准");
    expect(systemPrompt).not.toContain("训练请求范围判定");
    expect(systemPrompt).not.toContain("训练结构化交付前，必须先做模型自检");
    expect(systemPrompt).not.toContain("A. 缺数据库动作事实");
    expect(systemPrompt).not.toContain("B. 缺训练编排字段");
    expect(systemPrompt).not.toContain("训练编排候选消费边界");
    expect(systemPrompt).not.toContain("适合聊天正文的 Markdown 子集");
    expect(systemPrompt).not.toContain("raw HTML、Markdown 水平分割线");
    expect(searchDescription).toContain("产品可渲染动作资源库");
    expect(searchDescription).toContain("不是现实世界训练知识全集");
    expect(systemPrompt).toContain("不要把未经校验的模型想象当作数据库动作事实或处方参数");
    expect(finalizationDescriptions).toContain("不要输出未校验 JSON、NDJSON event 或工具调用参数");
    expect(finalizationDescriptions).toContain("content 只解释、提醒或总结已校验结构");
    expect(finalizationDescriptions).toContain("不要把正文当作结构化训练 payload");
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
    expect(schemaDescriptions).toContain("字段来源只能是用户明确指定的目标肌群、已验证上下文中的目标肌群");
    expect(schemaDescriptions).toContain("模型为当前可执行训练课收敛出的少量必要目标");
    expect(schemaDescriptions).toContain("不要把未指定肌群、宽泛训练目标或常规训练知识展开成全身肌群清单");
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
      candidateCountPerSection: agentRuntimeConfig.tools.searchExerciseResources.maxCandidateCountPerSection,
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
      candidateCountPerSection: agentRuntimeConfig.tools.searchExerciseResources.maxCandidateCountPerSection + 1,
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
