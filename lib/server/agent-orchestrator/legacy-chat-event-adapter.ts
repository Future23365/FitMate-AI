import "server-only";

import type { AgentExecutionResult, AgentToolResultRecord } from "./contracts";

export type LegacyAssistantActionKind =
  | "answer"
  | "ask_clarification"
  | "workout_generated"
  | "workout_patched"
  | "completed_operation"
  | "blocked"
  | "failed";

export type LegacyChatEventProjection = {
  derived: true;
  exitCondition: "remove_when_agent_execution_result_stream_is_supported";
  assistantAction: {
    action: LegacyAssistantActionKind;
    artifactId?: string;
    revisionId?: string;
    operationResultId?: string;
    blockingReason?: string;
  };
  resolvedIntent: {
    source: "agent_execution_result";
    status: AgentExecutionResult["status"];
    usedToolResultIds: string[];
  };
};

export type LegacyChatEventAdapterInput = {
  result: AgentExecutionResult;
  toolResults?: AgentToolResultRecord[];
};

export const legacyChatEventExitConditions = [
  "前端可直接消费 AgentExecutionResult stream event。",
  "黑盒报告已从 AgentExecutionResult、artifact/patch/suggestion 事件和 done metadata 推导结果。",
  "开发 trace 已能展示 legacy path skip 和 Agent dependency graph。",
] as const;

// LegacyChatEventAdapter is one-way only: Agent result in, compatibility fields out.
export class LegacyChatEventAdapter {
  project(input: LegacyChatEventAdapterInput): LegacyChatEventProjection {
    const usedToolResultIds = collectUsedToolResultIds(input.result, input.toolResults ?? []);
    return {
      derived: true,
      exitCondition: "remove_when_agent_execution_result_stream_is_supported",
      assistantAction: projectAssistantAction(input.result),
      resolvedIntent: {
        source: "agent_execution_result",
        status: input.result.status,
        usedToolResultIds,
      },
    };
  }
}

// createLegacyChatEventAdapter gives later chat-service integration an injectable adapter.
export function createLegacyChatEventAdapter() {
  return new LegacyChatEventAdapter();
}

function projectAssistantAction(result: AgentExecutionResult): LegacyChatEventProjection["assistantAction"] {
  switch (result.status) {
    case "answered":
      return { action: "answer" };
    case "needs_clarification":
      return { action: "ask_clarification", blockingReason: result.blockingReasons.join("; ") };
    case "generated":
      return {
        action: "workout_generated",
        artifactId: result.artifact.artifactId,
        revisionId: result.revisionId,
      };
    case "patched":
      return {
        action: "workout_patched",
        artifactId: result.artifact.artifactId,
        revisionId: result.revisionId,
      };
    case "completed_operation":
      return {
        action: "completed_operation",
        operationResultId: result.operationResultId,
      };
    case "blocked":
      return { action: "blocked", blockingReason: result.blockReason };
    case "failed":
      return { action: "failed", blockingReason: result.failureCode };
  }
}

function collectUsedToolResultIds(
  result: AgentExecutionResult,
  toolResults: AgentToolResultRecord[],
) {
  if ("usedToolResultIds" in result) {
    return result.usedToolResultIds;
  }

  return toolResults
    .filter((toolResult) => toolResult.status === "success")
    .map((toolResult) => toolResult.toolResultId);
}
