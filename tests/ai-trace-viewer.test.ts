import { describe, expect, it } from "vitest";

import { createTraceLogPayload, groupTraceSteps } from "@/components/dev/ai-trace-viewer";
import type { AiTrace, AiTraceStep } from "@/lib/server/dev/ai-trace-store";

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

  it("groups agent-core text chat runtime events even when registry is empty", () => {
    const groups = groupTraceSteps([
      createStep({
        type: "user_input",
        name: "文本聊天请求输入",
        output: { registry: { toolCount: 0, toolNames: [] } },
      }),
      createStep({
        type: "runtime_event",
        name: "Registry 快照",
        output: { type: "registry_snapshot", toolCount: 0 },
      }),
      createStep({
        type: "validation",
        name: "Action 校验通过",
        output: { type: "validation_result", ok: true },
      }),
      createStep({
        type: "response_write",
        name: "NDJSON 响应写入",
        output: { eventTypes: ["content", "done"], done: true },
      }),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      "请求输入",
      "Runtime 事件",
      "服务端校验",
      "响应写入",
    ]);
    expect(groups[1]).toMatchObject({
      title: "Runtime 事件",
      placement: "main_flow",
      steps: [
        expect.objectContaining({
          output: { type: "registry_snapshot", toolCount: 0 },
        }),
      ],
    });
  });

  it("keeps raw trace payload in full trace log exports", () => {
    const trace: AiTrace = {
      id: "trace-1",
      runId: "run-1",
      route: "/api/chat",
      title: "文本聊天",
      status: "success",
      createdAt: "2026-05-30T08:00:00.000Z",
      steps: [
        createStep({
          type: "runtime_event",
          name: "Registry 快照",
          output: { type: "registry_snapshot", toolCount: 0 },
        }),
      ],
    };
    const groups = groupTraceSteps(trace.steps);

    expect(createTraceLogPayload(trace, groups)).toMatchObject({
      title: "文本聊天",
      trace: {
        id: "trace-1",
        route: "/api/chat",
        steps: [
          expect.objectContaining({
            output: { type: "registry_snapshot", toolCount: 0 },
          }),
        ],
      },
      groupedSteps: [
        {
          id: "runtime_events",
          title: "Runtime 事件",
          stepIds: ["step-runtime_event"],
        },
      ],
    });
  });
});

function createStep(overrides: Pick<AiTraceStep, "type" | "name"> & Partial<AiTraceStep>): AiTraceStep {
  return {
    id: `step-${overrides.type}`,
    name: overrides.name,
    type: overrides.type,
    status: overrides.type === "error" ? "failed" : "success",
    startedAt: "2026-05-30T08:00:00.000Z",
    endedAt: "2026-05-30T08:00:00.010Z",
    durationMs: 10,
    input: overrides.input,
    output: overrides.output,
    metadata: overrides.metadata,
    error: overrides.error,
  };
}
