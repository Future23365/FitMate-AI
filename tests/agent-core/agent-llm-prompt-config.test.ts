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
    expect(systemPrompt).toContain("exerciseId");
    expect(systemPrompt).toContain("schedule.assignments");
    expect(systemPrompt).toContain("schemaVersion = \"1\"");
    expect(systemPrompt).not.toContain("schemaVersion = 1");
    expect(systemPrompt).not.toContain("schemaVersion: 1");
    expect(systemPrompt).toContain("setRestSeconds");
    expect(systemPrompt).toContain("transitionRestSeconds");
    expect(systemPrompt).toContain("mode 只能是 reps 或 duration");
    expect(systemPrompt).toContain("当前 run 可见、可作为训练推送事实消费的发布态动作来源");
    expect(systemPrompt).toContain("searchExerciseResources 返回的 satisfied 动作查询 observation 中 groups.<section>.exercises 的 exerciseId");
    expect(systemPrompt).toContain("resolveExerciseResourceMentions 这类只做身份解析的 observation 不能直接作为 visibleTrainingProposal 动作来源");
    expect(systemPrompt).toContain("必须先把 matched exerciseId 传给 searchExerciseResources.requiredExerciseIds");
    expect(systemPrompt).toContain("服务端会在渲染和保存前基于数据库复核 exerciseId、发布态和 allowedSections");
    expect(systemPrompt).not.toContain("只能复制本轮 satisfied searchExerciseResources observation");
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
