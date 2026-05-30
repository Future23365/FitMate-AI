import { describe, expect, it } from "vitest";

import { groupTraceSteps } from "@/components/dev/ai-trace-viewer";
import type { AiTraceStep } from "@/lib/server/dev/ai-trace-store";

describe("AI trace viewer step grouping", () => {
  it("groups architecture trace steps into readable stages and keeps unknown steps visible", () => {
    const groups = groupTraceSteps([
      createStep({ type: "reference_resolution", name: "ReferenceResolver 解析结果" }),
      createStep({ type: "tool_call", name: "searchArtifacts 受控工具调用" }),
      createStep({ type: "patch_proposal", name: "WorkoutPatch 提出" }),
      createStep({ type: "validation", name: "Patch 边界校验通过" }),
      createStep({ type: "persistence", name: "Patch revision 持久化成功" }),
      createStep({ type: "response_write", name: "聊天回复写入完成" }),
      createStep({ type: "error", name: "未知失败" }),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      "引用解析",
      "受控工具调用",
      "Patch 提出与应用",
      "服务端校验",
      "持久化",
      "响应写入",
      "异常处理",
    ]);
    expect(groups.every((group) => group.steps.length === 1)).toBe(true);
  });
});

function createStep(overrides: Pick<AiTraceStep, "type" | "name">): AiTraceStep {
  return {
    id: `step-${overrides.type}`,
    name: overrides.name,
    type: overrides.type,
    status: "success",
    startedAt: "2026-05-30T08:00:00.000Z",
    endedAt: "2026-05-30T08:00:00.010Z",
    durationMs: 10,
  };
}
