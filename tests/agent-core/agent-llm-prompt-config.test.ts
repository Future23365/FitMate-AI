import { describe, expect, it } from "vitest";

import {
  agentRuntimeConfig,
  agentLlmPromptConfig,
  agentLlmPromptVersion,
  buildAgentActionSystemPrompt,
  type AgentLlmPromptConfig,
} from "@/lib/server/config";

describe("agent LLM prompt configuration", () => {
  it("exposes a stable default AgentAction prompt and version", () => {
    const systemPrompt = buildAgentActionSystemPrompt();

    expect(agentLlmPromptConfig.promptVersion).toBe(agentLlmPromptVersion);
    expect(agentLlmPromptVersion).toBe("agent-action-v9");
    expect(systemPrompt).toContain("只能返回一个合法 JSON object");
    expect(systemPrompt).toContain("type 只能是 tool_call、final_answer、ask_user 三者之一");
    expect(systemPrompt).toContain("AI 健身助手");
    expect(systemPrompt).toContain("动作推荐和训练计划编排");
    expect(systemPrompt).toContain("不得提供医疗诊断、治疗建议");
    expect(systemPrompt).toContain("伤病判断或康复处方");
    expect(systemPrompt).toContain("普通聊天、概念解释、能力说明");
    expect(systemPrompt).toContain("都必须用 final_answer");
    expect(systemPrompt).toContain("visibleOutputs[]");
    expect(systemPrompt).toContain("visibleTrainingProposal");
    expect(systemPrompt).toContain("判断资源操作类型");
    expect(systemPrompt).toContain("reuse 表示直接复用已有事实");
    expect(systemPrompt).toContain("derive 表示从已有事实派生更合适的结构");
    expect(systemPrompt).toContain("modify 表示保留对象并调整顺序、处方、schedule 或局部字段");
    expect(systemPrompt).toContain("replace 表示替换、排除或避免重复");
    expect(systemPrompt).toContain("clarify 表示引用对象或目标不足需要追问");
    expect(systemPrompt).toContain("这些只是模型推理标签，不是 AgentAction 字段");
    expect(systemPrompt).toContain("服务端不会根据用户原文替你选择标签、tool、action 或 payload.kind");
    expect(systemPrompt).toContain("reuse、derive 和 modify 应优先把可消费资源作为正向事实来源");
    expect(systemPrompt).toContain("replace 才适合把当前 run 可见且用户已经看到或明确要求排除的 exerciseId 作为 excludeExerciseIds");
    expect(systemPrompt).toContain("requiredExerciseIds 作为正向锚点查询受控动作事实");
    expect(systemPrompt).toContain("payload.kind");
    expect(systemPrompt).toContain("exercise_selection");
    expect(systemPrompt).toContain("routine");
    expect(systemPrompt).toContain("plan");
    expect(systemPrompt).toContain("这三类是最终训练输出的结构能力");
    expect(systemPrompt).toContain("根据用户目标、上下文、当前可见 tools、observations 和 tool results 自主选择");
    expect(systemPrompt).toContain("服务端只校验你声明的结构、权限和数据库事实");
    expect(systemPrompt).toContain("不会根据用户原文替你改写 kind");
    expect(systemPrompt).toContain("目标需要周期、多天、频次、训练日 / 休息日安排或跨天训练计划时，应优先使用 payload.kind = plan");
    expect(systemPrompt).toContain("这是一条训练输出结构选择规则，不是固定词语触发规则");
    expect(systemPrompt).toContain("payload.kind = exercise_selection 表达一批可选 training 动作事实");
    expect(systemPrompt).toContain("仅用于目标只需要动作选择或普通动作事实推荐的场景");
    expect(systemPrompt).toContain("payload.kind = routine 表达一次可执行训练编排结构");
    expect(systemPrompt).toContain("payload.kind = plan 表达多天安排结构");
    expect(systemPrompt).toContain("先确认或使用当前可见的训练目标、限制、器械、时间和难度");
    expect(systemPrompt).toContain("再查询或复用 training 动作事实作为主训练来源");
    expect(systemPrompt).toContain("缺少可消费 warmup 或 stretch 动作事实时，应优先使用可见 tool 查询缺失 section");
    expect(systemPrompt).toContain("把 warmup/training/stretch 组成同一套带 prescription 的编排");
    expect(systemPrompt).toContain("刷新可见训练方案");
    expect(systemPrompt).toContain("保留原训练目标、器械、难度、居家条件、时长、section 和计划约束");
    expect(systemPrompt).toContain("优先让新的 exerciseItems 与上一套用户已看到动作产生实质差异");
    expect(systemPrompt).toContain("routine 或 plan 的刷新不应只按原始需求和同一排序重新生成重复动作");
    expect(systemPrompt).toContain("如果需要替换动作，应基于当前 run 可见事实自主决定读取上一套事实、查询替代动作、澄清或失败收口");
    expect(systemPrompt).toContain("不要把某个自然语言表达映射成固定 tool、固定 action、固定 payload.kind 或服务端分流");
    expect(systemPrompt).toContain("如果用户只是调整组数、时长、顺序、休息或难度，应优先保留已选动作");
    expect(systemPrompt).toContain("调整 prescription、order、schedule 或相关结构字段");
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
    expect(systemPrompt).toContain("如果模型判断最终目标需要 routine 或 plan");
    expect(systemPrompt).toContain("当前 run 只具备 training 动作事实");
    expect(systemPrompt).toContain("应优先补齐 warmup/stretch");
    expect(systemPrompt).toContain("不得因为只查到 training 动作就输出 payload.kind = exercise_selection 来替代 routine 或 plan");
    expect(systemPrompt).toContain("routine 和 plan 需要 warmup、training、stretch 三类 section 的当前 run 可消费动作事实");
    expect(systemPrompt).toContain("exerciseItems[*].section 必须被对应动作事实的 allowedSections 支撑");
    expect(systemPrompt).toContain("只有 training 动作事实时，不得伪造 warmup 或 stretch");
    expect(systemPrompt).toContain("tool 不可用、事实仍不足或用户目标缺少必要约束");
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
    expect(systemPrompt).toContain("exerciseId 和 section 必须同时来自当前 run 可见、fulfillment.satisfied=true");
    expect(systemPrompt).toContain("exerciseItems[*].section 应与该 group key 对应");
    expect(systemPrompt).toContain("该动作的 allowedSections 必须包含该 section");
    expect(systemPrompt).toContain("allowedSections 是服务端校验 exerciseItems[*].section 的确定性动作事实字段");
    expect(systemPrompt).toContain("searchExerciseResources 返回的 satisfied 动作查询 observation 中 groups.<section>.exercises 的 exerciseId");
    expect(systemPrompt).toContain("resolveExerciseResourceMentions 这类只做身份解析的 observation 不能直接作为 visibleTrainingProposal 动作来源");
    expect(systemPrompt).toContain("需要把 matched exerciseId 传给 searchExerciseResources.requiredExerciseIds");
    expect(systemPrompt).toContain("服务端会在渲染和保存前基于数据库复核 exerciseId、发布态和 allowedSections");
    expect(systemPrompt).not.toContain("必须调用 searchExerciseResources");
    expect(systemPrompt).not.toContain("必须调用 inspectVisibleTrainingProposals");
    expect(systemPrompt).not.toContain("固定调用顺序");
    expect(systemPrompt).not.toContain("validation failure 后必须调用 searchExerciseResources");
    expect(systemPrompt).not.toContain("只能复制本轮 satisfied searchExerciseResources observation");
    expect(systemPrompt).not.toContain("用户说某个固定词语");
    expect(systemPrompt).not.toContain("换一批");
    expect(systemPrompt).not.toContain("再来一组");
    expect(systemPrompt).not.toContain("factCount = 0");
    expect(systemPrompt).not.toContain("facts=[]");
    expect(systemPrompt).not.toContain("toolName = inspectVisibleTrainingProposals");
    expect(systemPrompt).toContain("recentVisibleTrainingProposals 和 inspectVisibleTrainingProposals(operation = \"list_recent\") 只提供 factRef/messageId");
    expect(systemPrompt).toContain("inspectVisibleTrainingProposals(operation = \"read_recent\")");
    expect(systemPrompt).toContain("inspectVisibleTrainingProposals(operation = \"list_recent\")");
    expect(systemPrompt).not.toContain("readRecentVisibleTrainingProposal");
    expect(systemPrompt).toContain("visible_training_proposal_fact");
    expect(systemPrompt).not.toContain("run metadata.recentVisibleTrainingProposals / visible_training_proposal_fact 中真实存在的 exerciseId");
    expect(systemPrompt).not.toContain("关键词");
    expect(systemPrompt).not.toContain("正则");
    expect(systemPrompt).not.toContain("同义词");
    expect(systemPrompt).toContain("当 tools 为空时，禁止返回 tool_call");
    expect(systemPrompt).toContain("用户询问你能做什么或当前能力边界时");
    expect(systemPrompt).toContain("不得承诺直接执行未注册工具");
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
    expect(agentLlmPromptConfig.promptVersion).toBe("agent-action-v9");
  });
});
