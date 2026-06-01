import { describe, expect, it } from "vitest";

import { buildAgentTraceViewModel } from "@/components/dev/agent-trace-view-model";
import { groupTraceSteps } from "@/components/dev/ai-trace-viewer";
import type { AiTraceStep } from "@/lib/server/dev/ai-trace-store";
import {
  createAgentTraceFixture,
  createAgentResponseWriterMismatchTraceFixture,
  createAgentToolParseFailureTraceFixture,
  createLegacyTraceFixture,
  createTraceStep,
} from "@/tests/fixtures/agent-traces";

describe("AI trace viewer step grouping", () => {
  it("groups architecture trace steps into readable stages and keeps unknown steps visible", () => {
    const groups = groupTraceSteps([
      createStep({ type: "reference_resolution", name: "ReferenceResolver 解析结果" }),
      createStep({ type: "tool_decision", name: "只读工具决策" }),
      createStep({ type: "tool_call", name: "searchArtifacts 受控工具调用" }),
      createStep({ type: "patch_proposal", name: "WorkoutPatch 提出" }),
      createStep({ type: "validation", name: "Patch 边界校验通过" }),
      createStep({ type: "persistence", name: "Patch revision 持久化成功" }),
      createStep({ type: "response_write", name: "聊天回复写入完成" }),
      createStep({ type: "error", name: "未知失败" }),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      "引用解析",
      "只读工具决策",
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

describe("Agent trace view model", () => {
  it("builds an Agent run summary, tool timeline and resource links from structured Agent steps", () => {
    const viewModel = buildAgentTraceViewModel(createAgentTraceFixture());

    expect(viewModel.hasAgentStages).toBe(true);
    expect(viewModel.runSummary.finalResultStatus).toBe("generated");
    expect(viewModel.runSummary.resultKind).toBe("artifact");
    expect(viewModel.runSummary.toolCallCount).toBe(2);
    expect(viewModel.runSummary.userVisibleReply).toContain("已生成");
    expect(viewModel.legacyCompatibility.skippedPaths).toEqual(["intentFirst", "normalize"]);
    expect(viewModel.phaseGroups.map((group) => group.id)).toContain("response_writer");
    expect(viewModel.toolTimeline.map((item) => [item.toolName, item.status])).toEqual([
      ["searchExercises", "success"],
      ["validateRoutineDraft", "success"],
    ]);
    expect(viewModel.resourceLinks.some((link) => (
      link.kind === "candidateSetId" &&
      link.id === "candidate-set-1" &&
      link.producers.length > 0 &&
      link.consumers.length > 0
    ))).toBe(true);
  });

  it("flags missing result, missing decision and orphaned resources without guessing from text", () => {
    const trace = createAgentTraceFixture({
      id: "trace-agent-failure",
      steps: [
        createTraceStep({
          id: "context",
          name: "agent_run_started",
          type: "agent_context",
        }),
        createTraceStep({
          id: "decision-without-result",
          name: "agent_tool_decision",
          type: "agent_tool_decision",
          input: {
            action: "call_tool",
            toolName: "searchExercises",
            input: { goal: "练背" },
          },
          metadata: {
            stepIndex: 0,
          },
        }),
        createTraceStep({
          id: "result-without-decision",
          name: "agent_tool_result",
          type: "agent_tool_result",
          output: {
            status: "success",
            candidateSetId: "orphan-candidate-set",
          },
          metadata: {
            stepIndex: 1,
            toolResultId: "tool-result-orphan",
            candidateSetId: "orphan-candidate-set",
          },
        }),
      ],
    });

    const viewModel = buildAgentTraceViewModel(trace);

    expect(viewModel.toolTimeline.map((item) => item.status)).toEqual([
      "missing_result",
      "missing_decision",
    ]);
    expect(viewModel.diagnosticFindings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["missing_result", "missing_decision", "orphaned_resource"]),
    );
  });

  it("keeps legacy traces readable and does not treat missing Agent stages as business failure", () => {
    const viewModel = buildAgentTraceViewModel(createLegacyTraceFixture());

    expect(viewModel.hasAgentStages).toBe(false);
    expect(viewModel.legacyCompatibility.status).toBe("legacy_trace");
    expect(viewModel.diagnosticFindings).toEqual([
      expect.objectContaining({
        boundary: "legacy_compatibility",
        code: "legacy_trace_without_agent_stages",
        severity: "info",
      }),
    ]);
  });

  it("groups parse failures and Response Writer mismatches by Agent architecture boundary", () => {
    const parseFailure = buildAgentTraceViewModel(createAgentToolParseFailureTraceFixture());
    const mismatch = buildAgentTraceViewModel(createAgentResponseWriterMismatchTraceFixture());

    expect(parseFailure.diagnosticFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          boundary: "tool_decision",
          code: "model_output_invalid",
          severity: "error",
        }),
      ]),
    );
    expect(mismatch.diagnosticFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          boundary: "response_writer",
          code: "response_writer_reference_missing",
          severity: "error",
        }),
      ]),
    );
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
