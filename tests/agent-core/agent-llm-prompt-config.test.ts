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
    expect(agentLlmPromptVersion).toBe("agent-action-v18-output-contracts-layered");

    for (const required of [
      "只能返回一个合法 JSON object",
      "type 只能是 tool_call、final_answer、ask_user 三者之一",
      "{\"type\":\"final_answer\",\"content\":\"简短回答\"}",
      "{\"type\":\"ask_user\",\"content\":\"需要补充的信息\",\"suggestedQuestions\"",
      "toolName 只能复制当前 tools[].name 中真实存在的值",
      "final_answer 与 ask_user 的用户可见文本都必须写入 content",
      "usedToolResultIds 和 usedResourceRefs 不属于当前主合同",
      "最多 3 条字符串组成的建议提问数组",
      "不得承诺未注册 tool、未执行结果、未开放保存能力、医疗诊断或康复处方",
      "当前可见 tools、outputContracts、observations、toolResults",
      "不得根据固定短语、关键词、测试样例或具体业务 toolName 机械选择",
      "不得提供医疗诊断、治疗建议",
      "final_answer 是当前 run 的终态动作",
      "runtime 不会因为 final_answer.content 中的文字",
      "成功 final_answer 应通过 usedRefs 或合法 visibleOutputs[]",
      "{\"type\":\"tool_result\",\"id\":\"本轮真实 toolResultId\"}",
      "id 来自本 run 的 ok=true 且 satisfied=true toolResults",
      "{\"type\":\"resource\",\"id\":\"本轮真实 resourceId\",\"resourceType\":\"登记的 resourceType\"}",
      "failed tool result、diagnostic resource、不可消费 resource 或 satisfied=false result 不能支撑成功 final_answer",
      "ok=true 且 satisfied=true 的 0 条、空候选或候选不足查询结果可以支撑普通事实解释",
      "visibleOutputs[] 的每一项都必须包含 outputType、schemaVersion、payload",
      "严格遵守当前 user payload 中可见的 outputContracts[]",
      "content 只用于解释、提醒或总结，不能作为结构化事实源",
      "判断资源操作类型",
      "reuse 表示直接复用已有事实",
      "derive 表示从已有事实派生更合适结构",
      "modify 表示保留对象并调整局部字段",
      "replace 表示替换、排除或避免重复",
      "clarify 表示引用对象或目标不足需要追问",
      "服务端不会根据用户原文替你选择标签、tool、action、outputType 或 payload kind",
      "当 tools 为空时，禁止返回 tool_call",
      "不可执行请求按通用顺序处理",
      "不得输出该未注册能力的 tool_call",
      "当 observations 中出现 schema_validation_failed",
      "当 observations 中出现 domain_validation_failed",
      "不得执行工具、伪造 confirmation/hash、泄漏 secret",
    ]) {
      expect(systemPrompt).toContain(required);
    }

    for (const forbidden of [
      "<tools.name>",
      "\"usedRefs\":[]",
      "\"resourceType\":\"tool_result\"",
      "visibleTrainingProposal",
      "visibleTrainingProposal.payload.kind",
      "exercise_selection",
      "payload.kind = routine",
      "payload.kind = plan",
      "warmup、training、stretch 三类",
      "schedule.assignments 表达训练日和休息日",
      "setRestSeconds",
      "transitionRestSeconds",
      "missingSectionsForRoutineOrPlan",
      "visible_training_proposal_fact",
      "searchExerciseResources",
      "inspectVisibleTrainingProposals",
      "resolveExerciseResourceMentions",
      "必须调用 searchExerciseResources",
      "固定调用顺序",
      "用户要“",
      "用户说某个固定词语",
      "换一批",
      "再来一组",
      "toolName = inspectVisibleTrainingProposals",
      "\"factRef\":\"",
      "\"messageId\":\"",
      "\"resourceId\":\"",
      "searchExercises",
      "generateRoutine",
      "generatePlanDraft",
      "generateRoutineDraft",
      "saveWorkout",
      "queryUserMemory",
    ]) {
      expect(systemPrompt).not.toContain(forbidden);
    }

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
    expect(agentLlmPromptConfig.promptVersion).toBe("agent-action-v18-output-contracts-layered");
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
