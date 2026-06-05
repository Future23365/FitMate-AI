import { describe, expect, it } from "vitest";

import {
  agentRuntimeConfig,
  agentLlmPromptConfig,
  agentLlmPromptVersion,
  buildAgentActionSystemPrompt,
  buildTerminalFailureFinalizerSystemPrompt,
  terminalFailureFinalizerPromptConfig,
  terminalFailureFinalizerPromptVersion,
  type AgentLlmPromptConfig,
} from "@/lib/server/config";

describe("agent LLM prompt configuration", () => {
  it("exposes a layered default AgentAction prompt and version", () => {
    const systemPrompt = buildAgentActionSystemPrompt();

    expect(agentLlmPromptConfig.promptVersion).toBe(agentLlmPromptVersion);
    expect(agentLlmPromptVersion).toBe("agent-action-v17-streamlined-model-visible-contract");
    expect(systemPrompt).toContain("只能返回一个合法 JSON object");
    expect(systemPrompt).toContain("type 只能是 tool_call、final_answer、ask_user 三者之一");
    expect(systemPrompt).toContain("{\"type\":\"final_answer\",\"content\":\"简短回答\"}");
    expect(systemPrompt).toContain("{\"type\":\"ask_user\",\"content\":\"需要补充的信息\",\"suggestedQuestions\"");
    expect(systemPrompt).toContain("toolName 只能复制当前 tools[].name 中真实存在的值");
    expect(systemPrompt).not.toContain("<tools.name>");
    expect(systemPrompt).not.toContain("\"usedRefs\":[]");
    expect(systemPrompt).toContain("final_answer 与 ask_user 的用户可见文本都必须写入 content");
    expect(systemPrompt).toContain("usedToolResultIds 和 usedResourceRefs 不属于当前主合同");
    expect(systemPrompt).toContain("final_answer 和 ask_user 都可以在适合时可选输出 suggestedQuestions");
    expect(systemPrompt).toContain("最多 3 条字符串组成的建议提问数组");
    expect(systemPrompt).toContain("点击后会作为下一轮普通用户消息直接发送");
    expect(systemPrompt).toContain("不得承诺未注册 tool、未执行结果、未开放保存能力、医疗诊断或康复处方");
    expect(systemPrompt).toContain("不得要求固定输出某个业务 toolName、固定 action 或固定训练结构");
    expect(systemPrompt).toContain("AI 健身助手");
    expect(systemPrompt).toContain("基于当前可见 tools、observations 和 toolResults 自主决定 tool_call、final_answer 或 ask_user");
    expect(systemPrompt).toContain("不得根据固定短语、关键词或测试样例机械选择");
    expect(systemPrompt).toContain("不得提供医疗诊断、治疗建议");
    expect(systemPrompt).toContain("伤病判断或康复处方");
    expect(systemPrompt).toContain("final_answer 是当前 run 的终态动作");
    expect(systemPrompt).toContain("runtime 不会因为 final_answer.content 中的文字");
    expect(systemPrompt).toContain("本轮回复后继续自动调用 tool");
    expect(systemPrompt).toContain("不得用 final_answer.content 承诺尚未执行的查询、生成、保存、等待、稍后继续或后续内部动作");
    expect(systemPrompt).toContain("必须返回当前可见且合法的 tool_call");
    expect(systemPrompt).toContain("使用 ask_user 澄清必要信息");
    expect(systemPrompt).toContain("明确说明当前事实不足而失败收口");
    expect(systemPrompt).toContain("当前 run 已经有 tool result 后，final_answer 应通过 usedRefs 或合法 visibleOutputs[]");
    expect(systemPrompt).toContain("{\"type\":\"tool_result\",\"id\":\"本轮真实 toolResultId\"}");
    expect(systemPrompt).toContain("id 来自本 run 的 ok=true toolResults");
    expect(systemPrompt).toContain("{\"type\":\"resource\",\"id\":\"本轮真实 resourceId\",\"resourceType\":\"登记的 resourceType\"}");
    expect(systemPrompt).toContain("id 来自本 run 的 producedResources");
    expect(systemPrompt).toContain("resourceType 只属于 type = \"resource\" 的引用项");
    expect(systemPrompt).toContain("不要用 resourceType 表示 tool_result 引用类型");
    expect(systemPrompt).not.toContain("\"resourceType\":\"tool_result\"");
    expect(systemPrompt).toContain("不要把业务对象 id、历史 messageId、factRef、示例 id 或正文里的 id 当作 resourceId");
    expect(systemPrompt).toContain("ok=true 且返回 0 条、候选不足或诊断摘要的 tool result 可以支撑普通事实回答");
    expect(systemPrompt).toContain("failed tool result 不能支撑 final_answer");
    expect(systemPrompt).toContain("fulfillment.satisfied 只作为诊断摘要，不是普通 final_answer grounding gate");
    expect(systemPrompt).toContain("outputType、schemaVersion、payload");
    expect(systemPrompt).toContain("visibleTrainingProposal");
    expect(systemPrompt).toContain("判断资源操作类型");
    expect(systemPrompt).toContain("reuse 表示直接复用已有事实");
    expect(systemPrompt).toContain("derive 表示从已有事实派生更合适的结构");
    expect(systemPrompt).toContain("modify 表示保留对象并调整顺序、处方、schedule 或局部字段");
    expect(systemPrompt).toContain("replace 表示替换、排除或避免重复");
    expect(systemPrompt).toContain("clarify 表示引用对象或目标不足需要追问");
    expect(systemPrompt).toContain("这些只是模型推理标签，不是 AgentAction 字段");
    expect(systemPrompt).toContain("服务端不会根据用户原文替你选择标签、tool、action 或 payload.kind");
    expect(systemPrompt).toContain("requiredExerciseIds 作为正向锚点查询受控动作事实");
    expect(systemPrompt).toContain("exercise_selection");
    expect(systemPrompt).toContain("routine");
    expect(systemPrompt).toContain("plan");
    expect(systemPrompt).toContain("这三类是最终训练输出的结构能力");
    expect(systemPrompt).toContain("根据用户目标、上下文、当前可见 tools、observations 和 tool results 自主选择");
    expect(systemPrompt).toContain("服务端只校验你声明的结构、权限和数据库事实");
    expect(systemPrompt).toContain("不会根据用户原文替你改写 kind");
    expect(systemPrompt).toContain("visibleTrainingProposal.payload.kind 的选择边界");
    expect(systemPrompt).toContain("exercise_selection 只表示一批可选 training 动作事实");
    expect(systemPrompt).toContain("不表示一次可直接照做的训练");
    expect(systemPrompt).toContain("routine 表示一次可执行训练编排");
    expect(systemPrompt).toContain("plan 表示多天或周期安排");
    expect(systemPrompt).toContain("schedule.assignments 表达训练日和休息日");
    expect(systemPrompt).toContain("若同一目标同时包含单次编排和多天、频次或周期安排，应优先考虑 plan");
    expect(systemPrompt).toContain("不要因为当前 run 先拿到的事实只支持 training");
    expect(systemPrompt).toContain("新输出 visibleTrainingProposal 前，必须先确认当前对话、metadata、observations、toolResults 或 consumable resource");
    expect(systemPrompt).toContain("已提供足够解释该训练输出的目标和关键约束");
    expect(systemPrompt).toContain("信息不足时应返回 ask_user，或使用不带 visibleOutputs 的 final_answer");
    expect(systemPrompt).toContain("不要为了满足笼统训练意图而推送不可解释的默认训练卡片");
    expect(systemPrompt).toContain("payload.kind = exercise_selection 至少需要当前可见上下文中存在训练目标、身体部位、动作类别、器械限制、场地限制、目标标签、点名动作或其他可解释筛选条件之一");
    expect(systemPrompt).toContain("缺少这些条件时，不得输出随机动作卡片");
    expect(systemPrompt).toContain("payload.kind = exercise_selection 表达一批可选 training 动作事实");
    expect(systemPrompt).toContain("仅用于目标只需要动作选择或普通动作事实推荐的场景");
    expect(systemPrompt).toContain("payload.kind = routine 表达一次可执行训练编排结构");
    expect(systemPrompt).toContain("routine 需要当前可见上下文中已有足以解释单次编排的训练目标、身体部位、训练形式、单次时长、可用器械或场地等关键约束");
    expect(systemPrompt).toContain("不得推送默认 routine 卡片");
    expect(systemPrompt).toContain("payload.kind = plan 表达多天安排结构");
    expect(systemPrompt).toContain("先确认或使用当前可见的训练目标、限制、器械、时间和难度");
    expect(systemPrompt).toContain("plan 需要当前可见上下文中已有足以解释长期安排的长期目标、训练频率或周期、单次时长、可用器械或场地等关键约束");
    expect(systemPrompt).toContain("不得推送空泛 plan 卡片");
    expect(systemPrompt).toContain("当前 run 可见 visibleTrainingProposal");
    expect(systemPrompt).toContain("让新的 exerciseItems 与用户已看到动作产生可解释差异");
    expect(systemPrompt).toContain("如果引用对象不可确认，不得宣称已经刷新、替换或调整");
    expect(systemPrompt).toContain("不要把某个自然语言表达映射成固定 tool、固定 action、固定 payload.kind 或服务端分流");
    expect(systemPrompt).toContain("可替代候选不足，可以复用部分已展示动作");
    expect(systemPrompt).toContain("必须在 content 中说明原因、询问是否放宽条件或只输出当前事实可支撑的结构");
    expect(systemPrompt).toContain("不要在未说明原因时把重复旧动作称为已经完成刷新");
    expect(systemPrompt).toContain("exerciseId");
    expect(systemPrompt).toContain("schedule.assignments");
    expect(systemPrompt).toContain("schedule 只表达周期内 training/rest 日");
    expect(systemPrompt).toContain("不得内嵌每天不同的完整动作编排");
    expect(systemPrompt).toContain("schemaVersion = \"1\"");
    expect(systemPrompt).not.toContain("schemaVersion = 1");
    expect(systemPrompt).not.toContain("schemaVersion: 1");
    expect(systemPrompt).toContain("setRestSeconds");
    expect(systemPrompt).toContain("transitionRestSeconds");
    expect(systemPrompt).toContain("mode 只能是 reps 或 duration");
    expect(systemPrompt).toContain("final_answer.visibleOutputs[] 中 payload.kind = routine 或 plan 的前置条件");
    expect(systemPrompt).toContain("当前 run 已具备 warmup、training、stretch 三类可消费动作事实");
    expect(systemPrompt).toContain("exerciseItems[*].exerciseId 和 exerciseItems[*].section 必须由当前 run 可见动作事实支撑");
    expect(systemPrompt).toContain("当当前 run 只有 training");
    expect(systemPrompt).toContain("missingSectionsForRoutineOrPlan 非空");
    expect(systemPrompt).toContain("不得输出 final_answer.visibleOutputs[] 中 payload.kind = \"routine\" 或 \"plan\"");
    expect(systemPrompt).toContain("不得在 content 中解释缺少热身、拉伸或其他 section 后仍提交不完整的 routine 或 plan");
    expect(systemPrompt).toContain("这个禁止只约束 routine / plan 的结构化输出");
    expect(systemPrompt).toContain("不阻止普通事实解释");
    expect(systemPrompt).toContain("不阻止输出当前事实可支撑的 exercise_selection");
    expect(systemPrompt).toContain("如果模型判断最终目标需要 routine 或 plan");
    expect(systemPrompt).toContain("当前可见事实不足以支撑 warmup、training、stretch 三类 section");
    expect(systemPrompt).toContain("可以继续调用当前可见且合法的 tool 获取缺失 section 的动作事实");
    expect(systemPrompt).toContain("使用 ask_user 澄清必要约束");
    expect(systemPrompt).toContain("不输出 visibleOutputs 并在 content 中说明当前事实不足或失败收口");
    expect(systemPrompt).toContain("不得因为只查到 training 动作事实就输出 payload.kind = exercise_selection 来替代 routine 或 plan");
    expect(systemPrompt).toContain("不得让用户自行组合 training 动作列表");
    expect(systemPrompt).toContain("routine 和 plan 需要 warmup、training、stretch 三类 section 的当前 run 可消费动作事实");
    expect(systemPrompt).toContain("exerciseItems[*].section 必须被对应动作事实的 allowedSections 支撑");
    expect(systemPrompt).toContain("只有 training 动作事实时，不得伪造 warmup 或 stretch");
    expect(systemPrompt).toContain("如果最终结构需要当前可见事实未覆盖的 section、动作、prescription 或 schedule");
    expect(systemPrompt).toContain("继续查询、澄清、失败收口或只输出当前事实可支撑的结构");
    expect(systemPrompt).toContain("当本轮用户请求是省略表达、续问、替换、调整、继续或引用最近内容时");
    expect(systemPrompt).toContain("结合 run.messages、metadata、observations 和 toolResults 判断被引用的上一轮、当前可见、已生成或已选择对象是否真实存在且可继续操作");
    expect(systemPrompt).toContain("引用型请求和独立生成请求是两个不同目标");
    expect(systemPrompt).toContain("必须先确认该对象在当前可见上下文、tool result 或 consumable resource 中真实存在且可操作");
    expect(systemPrompt).toContain("不得改写成相邻的新生成目标");
    expect(systemPrompt).toContain("不得输出结构化结果声称已经完成替换、刷新或调整");
    expect(systemPrompt).toContain("只有当用户已经提供足够独立生成所需的目标和约束时，才可作为新请求处理");
    expect(systemPrompt).toContain("content 必须明确这是按新目标生成，而不是对不可见已有对象的继续操作");
    expect(systemPrompt).toContain("历史 assistant 消息只能作为上下文参考，不能当作本轮回复模板重复输出，除非用户明确要求复述");
    expect(systemPrompt).toContain("不要编造对象、动作、方案或 tool result");
    expect(systemPrompt).toContain("自然说明缺少可继续操作的上下文，并给出可恢复下一步");
    expect(systemPrompt).toContain("当本轮存在新的 observations 或 toolResults 时，terminal action 应将这些最新事实纳入推理");
    expect(systemPrompt).toContain("自主选择继续 tool_call、final_answer 或 ask_user");
    expect(systemPrompt).toContain("不要固定调用某个业务 tool、固定输出某个 payload.kind，或固定引用某个 tool result/resource");
    expect(systemPrompt).toContain("exerciseId 和 section 必须同时来自当前 run 可见、ok=true");
    expect(systemPrompt).toContain("section-scoped 动作事实会暴露 allowedSections");
    expect(systemPrompt).toContain("只做身份解析、索引查询、diagnostic 或 failed 的结果不能直接作为 visibleTrainingProposal 动作来源");
    expect(systemPrompt).toContain("服务端会在渲染和保存前基于数据库复核 exerciseId、发布态和 allowedSections");
    expect(systemPrompt).not.toContain("searchExerciseResources");
    expect(systemPrompt).not.toContain("inspectVisibleTrainingProposals");
    expect(systemPrompt).not.toContain("resolveExerciseResourceMentions");
    expect(systemPrompt).not.toContain("必须调用 searchExerciseResources");
    expect(systemPrompt).not.toContain("必须调用 inspectVisibleTrainingProposals");
    expect(systemPrompt).not.toContain("固定调用顺序");
    expect(systemPrompt).not.toContain("validation failure 后必须调用 searchExerciseResources");
    expect(systemPrompt).not.toContain("只能复制本轮 satisfied searchExerciseResources observation");
    expect(systemPrompt).not.toContain("动作查询 observation 中 groups.<section>.exercises");
    expect(systemPrompt).not.toContain("用户要“");
    expect(systemPrompt).not.toContain("用户说某个固定词语");
    expect(systemPrompt).not.toContain("换一批");
    expect(systemPrompt).not.toContain("再来一组");
    expect(systemPrompt).not.toContain("factCount = 0");
    expect(systemPrompt).not.toContain("facts=[]");
    expect(systemPrompt).not.toContain("toolName = inspectVisibleTrainingProposals");
    expect(systemPrompt).not.toContain("readRecentVisibleTrainingProposal");
    expect(systemPrompt).toContain("visible_training_proposal_fact");
    expect(systemPrompt).not.toContain("\"factRef\":\"");
    expect(systemPrompt).not.toContain("\"messageId\":\"");
    expect(systemPrompt).not.toContain("\"resourceId\":\"");
    expect(systemPrompt).toContain("当 tools 为空时，禁止返回 tool_call");
    expect(systemPrompt).toContain("用户询问你能做什么或当前能力边界时");
    expect(systemPrompt).toContain("不得承诺直接执行未注册工具");
    expect(systemPrompt).toContain("当 observations 中出现 schema_validation_failed");
    expect(systemPrompt).toContain("target.kind、schemaId、toolName、outputType 和 variant");
    expect(systemPrompt).toContain("errors[].path、errors[].code、expected、actual、allowedFields、requiredFields 和 allowedValues");
    expect(systemPrompt).toContain("服务端不会在 repair feedback 中替你映射旧字段、补齐参数、选择 tool 或解释字段业务语义");
    expect(systemPrompt).toContain("当 observations 中出现 domain_validation_failed");
    expect(systemPrompt).toContain("facts[] 只表示服务端 validator 已确定的数据库、资源、grounding 或可见输出事实错误");
    expect(systemPrompt).toContain("facts[] 不是服务端指定的下一步业务流程");
    expect(systemPrompt).toContain("不会替代下一轮 schema、resource、policy、grounding 或 terminal visible output 校验");
    expect(systemPrompt).toContain("不得重复 answered、final_result、assistant_action");
    expect(systemPrompt).toContain("不得执行工具、伪造 confirmation/hash、泄漏 secret");
    expect(systemPrompt).not.toContain("searchExercises");
    expect(systemPrompt).not.toContain("generateRoutine");
    expect(systemPrompt).not.toContain("generatePlanDraft");
    expect(systemPrompt).not.toContain("generateRoutineDraft");
    expect(systemPrompt).not.toContain("saveWorkout");
    expect(systemPrompt).not.toContain("queryUserMemory");
    expect(agentLlmPromptConfig.requestDefaults).toEqual({
      temperature: agentRuntimeConfig.llm.temperature,
      maxTokens: agentRuntimeConfig.llm.maxTokens,
    });
  });

  it("builds custom system prompts without mutating the default prompt config", () => {
    const customConfig: AgentLlmPromptConfig = {
      promptVersion: "agent-action-test",
      systemPromptInstructions: [
        "返回测试专用 AgentAction JSON object。",
        "这个测试只期望 final_answer。",
      ],
      requestDefaults: {
        temperature: 0.2,
        maxTokens: 321,
      },
    };

    expect(buildAgentActionSystemPrompt(customConfig)).toBe(
      "返回测试专用 AgentAction JSON object。 这个测试只期望 final_answer。",
    );
    expect(buildAgentActionSystemPrompt()).toContain("tool_call、final_answer、ask_user");
    expect(agentLlmPromptConfig.promptVersion).toBe("agent-action-v17-streamlined-model-visible-contract");
  });

  it("exposes a dedicated terminal failure finalizer prompt and budget config", () => {
    const systemPrompt = buildTerminalFailureFinalizerSystemPrompt();

    expect(terminalFailureFinalizerPromptConfig.promptVersion).toBe(terminalFailureFinalizerPromptVersion);
    expect(terminalFailureFinalizerPromptVersion).toBe("terminal-failure-finalizer-v1");
    expect(systemPrompt).toContain("主 Agent 已经耗尽内部修复机会");
    expect(systemPrompt).toContain("本轮没有满足用户需求");
    expect(systemPrompt).toContain("只能输出一个 JSON object");
    expect(systemPrompt).toContain("字段只允许 `content` 和可选 `suggestedQuestions`");
    expect(systemPrompt).toContain("不得输出 `AgentAction`、`tool_call`、`visibleOutputs`");
    expect(systemPrompt).toContain("最多 3 条");
    expect(systemPrompt).not.toContain("toolName 只能复制当前 tools[].name");
    expect(systemPrompt).not.toContain("tools 清单");
    expect(agentRuntimeConfig.terminalFailureFinalizer).toEqual({
      enabled: true,
      maxCallsPerRun: 1,
      timeoutMs: 3000,
      maxTokens: 500,
      temperature: 0.2,
      maxSuggestedQuestions: 3,
      deepSeek: {
        thinkingType: "disabled",
      },
    });
  });
});
