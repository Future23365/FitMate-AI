import { describe, expect, it } from "vitest";

import { groupTraceSteps } from "@/components/dev/ai-trace-viewer";
import type { AiTraceStep } from "@/lib/server/dev/ai-trace-store";

describe("AI trace viewer step grouping", () => {
  it("groups generic trace steps without requiring removed Agent runtime events", () => {
    const groups = groupTraceSteps([
      createStep({ type: "user_input", name: "用户输入" }),
      createStep({ type: "reference_resolution", name: "引用解析" }),
      createStep({ type: "tool_call", name: "动作查询" }),
      createStep({ type: "validation", name: "校验结果" }),
      createStep({ type: "persistence", name: "保存结果" }),
      createStep({ type: "response_write", name: "响应写入" }),
      createStep({ type: "error", name: "失败" }),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      "请求输入",
      "引用解析",
      "领域查询",
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
    status: overrides.type === "error" ? "failed" : "success",
    startedAt: "2026-05-30T08:00:00.000Z",
    endedAt: "2026-05-30T08:00:00.010Z",
    durationMs: 10,
  };
}
