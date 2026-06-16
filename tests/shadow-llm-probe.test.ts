import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createSubmitVisibleTrainingProposalLangChainTool,
  defineLangChainToolWrapper,
  type LangChainToolWrapper,
} from "@/lib/server/langchain-agent";
import {
  createShadowLlmProbeFileStore,
  continueShadowLlmProbeRun,
  generateShadowLlmProbeReport,
  runShadowLlmProbeCli,
  startShadowLlmProbeRun,
} from "@/lib/server/dev/shadow-llm-probe";
import type { VisibleTrainingProposalExerciseFactLoader } from "@/lib/server/visible-training-proposals/visible-training-proposal-exercise-facts";
import { ShadowLlmProbeInputSchema } from "@/lib/shared/shadow-llm-probe/schema";

describe("Codex Shadow LLM Probe", () => {
  it("starts a dev-only run with whitelisted model-visible input and sourceRefs", async () => {
    const cwd = await createTempCwd();
    const result = await startShadowLlmProbeRun({
      cwd,
      message: "今天我想练胸，给我几个动作",
      toolWrappers: [createSearchFixtureTool()],
    });
    const input = ShadowLlmProbeInputSchema.parse(JSON.parse(await readFile(result.inputPath, "utf8")));

    expect(result.runId).toMatch(/^shadow-\d{4}-\d{2}-\d{2}-\d{4}-[a-f0-9]{8}$/);
    expect(input.systemPrompt).toContain("FitMate");
    expect(input.messages).toEqual([{ role: "user", content: "今天我想练胸，给我几个动作" }]);
    expect(input.tools.map((tool) => tool.name)).toEqual(["searchExerciseResources"]);
    expect(input.finalizationTool.name).toBe("fitmate_final_response");
    expect(input.budget.remainingToolCalls).toBeGreaterThan(0);
    expect(input.sourceRefs.map((ref) => ref.path)).toContain("$.systemPrompt");
    expect(JSON.stringify(input)).not.toContain("debug-only");
    expect(JSON.stringify(input)).not.toContain("Prisma");
    expect(JSON.stringify(input)).not.toContain("DEEPSEEK_API_KEY");
  });

  it("rejects unavailable tools and invalid tool input without rewriting Codex decisions", async () => {
    const cwd = await createTempCwd();
    const started = await startShadowLlmProbeRun({
      cwd,
      message: "找几个训练动作",
      toolWrappers: [createSearchFixtureTool()],
    });
    const store = createShadowLlmProbeFileStore(cwd);
    await writeDecision(store.decisionPath(started.runId, "round-001"), {
      runId: started.runId,
      roundId: "round-001",
      decision: "call_tool",
      toolName: "missingTool",
      toolInput: {},
    });

    const unavailable = await continueShadowLlmProbeRun({
      cwd,
      runId: started.runId,
      toolWrappers: [createSearchFixtureTool()],
    });

    expect(unavailable).toMatchObject({
      status: "decision_validation_failed",
      message: "tool_not_available: missingTool",
    });

    const second = await startShadowLlmProbeRun({
      cwd,
      message: "找几个训练动作",
      toolWrappers: [createSearchFixtureTool()],
    });
    await writeDecision(store.decisionPath(second.runId, "round-001"), {
      runId: second.runId,
      roundId: "round-001",
      decision: "call_tool",
      toolName: "searchExerciseResources",
      toolInput: { suitabilities: ["invalid"] },
    });

    const invalidInput = await continueShadowLlmProbeRun({
      cwd,
      runId: second.runId,
      toolWrappers: [createSearchFixtureTool()],
    });

    expect(invalidInput.status).toBe("decision_validation_failed");
    expect(invalidInput.message).toContain("tool_schema_invalid");

    const third = await startShadowLlmProbeRun({
      cwd,
      message: "找几个训练动作",
      toolWrappers: [createSearchFixtureTool()],
    });
    await writeDecision(store.decisionPath(third.runId, "round-001"), {
      runId: third.runId,
      roundId: "round-001",
      decision: "call_tool",
      toolName: "searchExerciseResources",
      toolInput: {
        suitabilities: ["training"],
        runtimeMetadata: { activitySummary: "正在查询训练动作" },
        unexpectedBusinessField: true,
      },
    });

    const unknownBusinessField = await continueShadowLlmProbeRun({
      cwd,
      runId: third.runId,
      toolWrappers: [createSearchFixtureTool()],
    });

    expect(unknownBusinessField.status).toBe("decision_validation_failed");
    expect(unknownBusinessField.message).toContain("tool_schema_invalid");
  });

  it("executes a legal searchExerciseResources decision and generates the next round input", async () => {
    const cwd = await createTempCwd();
    const tool = createSearchFixtureTool();
    const started = await startShadowLlmProbeRun({
      cwd,
      message: "找几个无器械训练动作",
      toolWrappers: [tool],
    });
    const store = createShadowLlmProbeFileStore(cwd);

    await writeDecision(store.decisionPath(started.runId, "round-001"), {
      runId: started.runId,
      roundId: "round-001",
      decision: "call_tool",
      toolName: "searchExerciseResources",
      toolInput: { suitabilities: ["training"] },
    });

    const continued = await continueShadowLlmProbeRun({
      cwd,
      runId: started.runId,
      toolWrappers: [tool],
    });

    expect(continued).toMatchObject({ status: "active", runId: started.runId });
    expect(continued).toHaveProperty("inputPath");

    const nextInput = JSON.parse(await readFile(String(continued.inputPath), "utf8"));
    expect(nextInput.roundId).toBe("round-002");
    expect(nextInput.toolResultSummaries).toEqual([
      expect.objectContaining({
        roundId: "round-001",
        toolName: "searchExerciseResources",
        status: "succeeded",
      }),
    ]);
    expect(nextInput.messages.at(-1)).toMatchObject({
      role: "tool",
      name: "searchExerciseResources",
    });
  });

  it("accepts runtimeMetadata in shadow decisions while keeping handlers business-only", async () => {
    const cwd = await createTempCwd();
    const handlerInputs: unknown[] = [];
    const tool = createSearchFixtureTool((input) => {
      handlerInputs.push(input);
    });
    const started = await startShadowLlmProbeRun({
      cwd,
      message: "找几个无器械训练动作",
      toolWrappers: [tool],
    });
    const store = createShadowLlmProbeFileStore(cwd);

    await writeDecision(store.decisionPath(started.runId, "round-001"), {
      runId: started.runId,
      roundId: "round-001",
      decision: "call_tool",
      toolName: "searchExerciseResources",
      toolInput: {
        suitabilities: ["training"],
        runtimeMetadata: { activitySummary: "正在查询训练动作" },
      },
    });

    const continued = await continueShadowLlmProbeRun({
      cwd,
      runId: started.runId,
      toolWrappers: [tool],
    });

    expect(continued).toMatchObject({ status: "active", runId: started.runId });
    expect(handlerInputs).toEqual([{ suitabilities: ["training"] }]);
    expect(JSON.stringify(handlerInputs[0])).not.toContain("runtimeMetadata");

    const toolResult = JSON.parse(await readFile(store.toolResultPath(started.runId, "round-001"), "utf8"));
    expect(toolResult.executionRecord.runtimeActivity).toMatchObject({
      activitySummary: "正在查询训练动作",
      source: "model",
    });
  });

  it("runs submitVisibleTrainingProposal through validator path without persistence callbacks", async () => {
    const cwd = await createTempCwd();
    let persisted = false;
    const tool = createSubmitVisibleTrainingProposalLangChainTool({
      loadExerciseRecordsByIds: createExerciseFactLoader(),
    });
    const started = await startShadowLlmProbeRun({
      cwd,
      message: "把这个动作做成动作卡片",
      toolWrappers: [tool],
    });
    const store = createShadowLlmProbeFileStore(cwd);

    await writeDecision(store.decisionPath(started.runId, "round-001"), {
      runId: started.runId,
      roundId: "round-001",
      decision: "call_tool",
      toolName: "submitVisibleTrainingProposal",
      toolInput: {
        outputType: "visibleTrainingProposal",
        schemaVersion: "1",
        payload: {
          kind: "exercise_selection",
          exerciseItems: [
            { exerciseId: "push-up", section: "training", order: 1 },
          ],
        },
      },
    });

    const result = await continueShadowLlmProbeRun({
      cwd,
      runId: started.runId,
      toolWrappers: [tool],
    });
    const toolResult = JSON.parse(await readFile(store.toolResultPath(started.runId, "round-001"), "utf8"));

    expect(result.status).toBe("active");
    expect(toolResult.status).toBe("succeeded");
    expect(toolResult.modelVisibleSummary).toContain("\"status\":\"accepted\"");
    expect(persisted).toBe(false);

    persisted = true;
    expect(persisted).toBe(true);
  });

  it("records final_answer, generates reports without re-executing tools, and exposes CLI status", async () => {
    const cwd = await createTempCwd();
    let executionCount = 0;
    const tool = createSearchFixtureTool(() => {
      executionCount += 1;
    });
    const started = await startShadowLlmProbeRun({
      cwd,
      message: "解释俯卧撑注意事项",
      toolWrappers: [tool],
    });
    const store = createShadowLlmProbeFileStore(cwd);

    await writeDecision(store.decisionPath(started.runId, "round-001"), {
      runId: started.runId,
      roundId: "round-001",
      decision: "final_answer",
      toolName: null,
      toolInput: null,
      finalAnswer: {
        content: "可以直接说明俯卧撑动作要点。",
        suggestedQuestions: [],
        rationale: "用户只问动作注意事项，不需要产品动作卡片。",
      },
    });

    const final = await continueShadowLlmProbeRun({
      cwd,
      runId: started.runId,
      toolWrappers: [tool],
    });
    const report = await generateShadowLlmProbeReport({ cwd, runId: started.runId });
    const cliStatus = await runShadowLlmProbeCli(["--status", started.runId], cwd);

    expect(final.status).toBe("final_answer");
    expect(executionCount).toBe(0);
    const reportMarkdown = await readFile(report.reportMarkdownPath, "utf8");
    expect(reportMarkdown).toContain("## 诊断结论");
    expect(reportMarkdown).toContain("## Shadow 决策报告");
    expect(reportMarkdown).toContain("prompt_conflict: 未命中");
    expect(cliStatus.exitCode).toBe(0);
    expect(cliStatus.stdout).toContain(started.runId);
  });

  it("marks tool execution failures as incomplete developer diagnosis", async () => {
    const cwd = await createTempCwd();
    const started = await startShadowLlmProbeRun({
      cwd,
      message: "找几个无器械训练动作",
      toolWrappers: [createFailingSearchFixtureTool()],
    });
    const store = createShadowLlmProbeFileStore(cwd);

    await writeDecision(store.decisionPath(started.runId, "round-001"), {
      runId: started.runId,
      roundId: "round-001",
      decision: "call_tool",
      toolName: "searchExerciseResources",
      toolInput: { suitabilities: ["training"] },
    });

    const continued = await continueShadowLlmProbeRun({
      cwd,
      runId: started.runId,
      toolWrappers: [createFailingSearchFixtureTool()],
    });
    const report = await generateShadowLlmProbeReport({ cwd, runId: started.runId });
    const reportJson = JSON.parse(await readFile(report.reportJsonPath, "utf8"));
    const reportMarkdown = await readFile(report.reportMarkdownPath, "utf8");

    expect(continued.status).toBe("tool_execution_failed");
    expect(reportJson.developerDiagnosis.included).toBe(true);
    expect(reportJson.developerDiagnosis.runBlocker.kind).toBe("tool_execution_failed");
    expect(reportJson.developerDiagnosis.unavailableChecks).toContain(
      "tool result summary 是否投影关键事实：不可判断，因为 tool 未成功返回 summary。",
    );
    expect(reportMarkdown).toContain("诊断未完成");
    expect(reportMarkdown).toContain("真实 dev-safe tool 执行失败");
    expect(reportMarkdown).toContain("finalization tool 完成条件是否清楚：不可判断");
  });

  it("keeps production chat chain isolated from shadow runner imports", async () => {
    const route = await readFile(path.resolve(process.cwd(), "app/api/chat/route.ts"), "utf8");
    const service = await readFile(path.resolve(process.cwd(), "lib/server/chat/langchain-agent-text-chat-service.ts"), "utf8");
    const runtime = await readFile(path.resolve(process.cwd(), "lib/server/langchain-agent/runtime.ts"), "utf8");

    expect(route).not.toContain("shadow-llm-probe");
    expect(service).not.toContain("shadow-llm-probe");
    expect(runtime).not.toContain("shadow-llm-probe");
  });
});

async function createTempCwd() {
  return mkdtemp(path.join(tmpdir(), "aitest-shadow-probe-"));
}

async function writeDecision(filePath: string, partial: Record<string, unknown>) {
  const decision = {
    finalAnswer: null,
    evidence: [
      {
        source: "messages",
        path: "$.messages[0].content",
        summary: "用户消息提供当前任务。",
      },
    ],
    fieldRationale: [],
    missingFacts: [],
    contractConcerns: [],
    contaminationAudit: {
      usedOnlyShadowInput: true,
      suspectedExternalKnowledge: [],
      notes: [],
    },
    ...partial,
  };

  await writeFile(filePath, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
}

function createSearchFixtureTool(onExecute?: (input: { suitabilities?: Array<"training"> }) => void): LangChainToolWrapper {
  return defineLangChainToolWrapper({
    name: "searchExerciseResources",
    description: "Purpose：只读查询动作候选事实。Use When：需要展示具体数据库动作条目时使用。",
    inputSchema: z.object({
      suitabilities: z.array(z.enum(["training"])).optional(),
    }).strict(),
    outputSchema: z.object({
      status: z.literal("succeeded"),
      candidateGroups: z.array(z.object({
        suitability: z.literal("training"),
        exercises: z.array(z.object({
          exerciseId: z.string(),
          nameZh: z.string(),
        })),
      })),
    }).strict(),
    handler: async (input) => {
      onExecute?.(input);
      return {
        status: "succeeded",
        candidateGroups: [
          {
            suitability: "training",
            exercises: [{ exerciseId: "push-up", nameZh: "俯卧撑" }],
          },
        ],
      };
    },
    toModelVisibleSummary: (output) => ({
      status: output.status,
      factLevel: "candidate",
      candidateGroups: output.candidateGroups,
    }),
  });
}

function createFailingSearchFixtureTool(): LangChainToolWrapper {
  return defineLangChainToolWrapper({
    name: "searchExerciseResources",
    description: "Purpose：只读查询动作候选事实。Use When：需要展示具体数据库动作条目时使用。",
    inputSchema: z.object({
      suitabilities: z.array(z.enum(["training"])).optional(),
    }).strict(),
    outputSchema: z.object({
      status: z.literal("succeeded"),
    }).strict(),
    handler: async () => {
      throw new Error("database connection failed");
    },
    toModelVisibleSummary: (output) => output,
  });
}

function createExerciseFactLoader(): VisibleTrainingProposalExerciseFactLoader {
  return async (exerciseIds) => exerciseIds.map((exerciseId) => ({
    id: exerciseId,
    nameZh: "俯卧撑",
    nameEn: "Push-up",
    categoryZh: "力量训练",
    levelZh: "初级",
    equipmentZh: "自重",
    primaryMusclesZh: ["胸部"],
    secondaryMusclesZh: ["肱三头肌"],
    allowedSections: ["training"],
    imageUrls: [],
    isPublished: true,
  }));
}
