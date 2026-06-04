import { describe, expect, it } from "vitest";

import {
  agentLlmPromptConfig,
  agentLlmPromptVersion,
  buildAgentActionSystemPrompt,
  type AgentLlmPromptConfig,
} from "@/lib/server/agent-planners/prompts/agent-llm-prompt-config";

describe("agent LLM prompt configuration", () => {
  it("exposes a stable default AgentAction prompt and version", () => {
    const systemPrompt = buildAgentActionSystemPrompt();

    expect(agentLlmPromptConfig.promptVersion).toBe(agentLlmPromptVersion);
    expect(agentLlmPromptVersion).toBe("agent-action-v5");
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
    expect(systemPrompt).toContain("payload.kind");
    expect(systemPrompt).toContain("exercise_selection");
    expect(systemPrompt).toContain("routine");
    expect(systemPrompt).toContain("plan");
    expect(systemPrompt).toContain("这三类是最终训练输出的结构能力");
    expect(systemPrompt).toContain("根据用户目标、上下文、当前可见 tools、observations 和 tool results 自主选择");
    expect(systemPrompt).toContain("服务端只校验你声明的结构、权限和数据库事实");
    expect(systemPrompt).toContain("payload.kind = exercise_selection 表达一批可选 training 动作事实");
    expect(systemPrompt).toContain("payload.kind = routine 表达一次可执行训练编排结构");
    expect(systemPrompt).toContain("payload.kind = plan 表达多天安排结构");
    expect(systemPrompt).toContain("exerciseId");
    expect(systemPrompt).toContain("schedule.assignments");
    expect(systemPrompt).toContain("schemaVersion = \"1\"");
    expect(systemPrompt).not.toContain("schemaVersion = 1");
    expect(systemPrompt).not.toContain("schemaVersion: 1");
    expect(systemPrompt).toContain("setRestSeconds");
    expect(systemPrompt).toContain("transitionRestSeconds");
    expect(systemPrompt).toContain("mode 只能是 reps 或 duration");
    expect(systemPrompt).toContain("如果最终结构需要当前可见事实未覆盖的 section、动作、prescription 或 schedule");
    expect(systemPrompt).toContain("继续查询、澄清、失败收口或只输出当前事实可支撑的结构");
    expect(systemPrompt).toContain("exerciseId 和 section 必须同时来自当前 run 可见、fulfillment.satisfied=true");
    expect(systemPrompt).toContain("exerciseItems[*].section 应与该 group key 对应");
    expect(systemPrompt).toContain("该动作的 allowedSections 必须包含该 section");
    expect(systemPrompt).toContain("allowedSections 是服务端校验 exerciseItems[*].section 的确定性动作事实字段");
    expect(systemPrompt).toContain("searchExerciseResources 返回的 satisfied 动作查询 observation 中 groups.<section>.exercises 的 exerciseId");
    expect(systemPrompt).toContain("resolveExerciseResourceMentions 这类只做身份解析的 observation 不能直接作为 visibleTrainingProposal 动作来源");
    expect(systemPrompt).toContain("需要把 matched exerciseId 传给 searchExerciseResources.requiredExerciseIds");
    expect(systemPrompt).toContain("服务端会在渲染和保存前基于数据库复核 exerciseId、发布态和 allowedSections");
    expect(systemPrompt).not.toContain("必须调用 searchExerciseResources");
    expect(systemPrompt).not.toContain("validation failure 后必须调用 searchExerciseResources");
    expect(systemPrompt).not.toContain("只能复制本轮 satisfied searchExerciseResources observation");
    expect(systemPrompt).not.toContain("当用户只需要一批可选训练动作时");
    expect(systemPrompt).not.toContain("当用户需要一次可执行训练流程时");
    expect(systemPrompt).not.toContain("当用户需要多天安排时");
    expect(systemPrompt).not.toContain("用户说某个固定词语");
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
      temperature: 0,
      maxTokens: 1_200,
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
    expect(agentLlmPromptConfig.promptVersion).toBe("agent-action-v5");
  });
});
