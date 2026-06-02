import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, test } from "vitest";
import { z } from "zod";

import {
  createOrUpdateConversationArtifact,
} from "@/lib/server/conversation-artifacts/artifact-service";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/server/db/prisma";
import {
  createToolFirstAgentToolRegistry,
  parseAgentJsonObject,
  parseAgentToolDecision,
  type AgentToolDefinition,
  type AgentToolExecutionContext,
  type AgentToolExecutionResult,
  type AgentToolResultRecord,
} from "@/lib/server/agent-orchestrator";
import type { WorkoutRoutineSection } from "@/lib/shared/workout-plans/draft-schema";

import {
  assertAgentSingleToolResult,
  evaluateAgentSingleToolResult,
  previewAgentToolText,
  type AgentSingleToolAssertionStatus,
  type AgentSingleToolFailureLevel,
  type AgentSingleToolRunResult,
} from "./agent-tool-assertions";
import {
  createRoutineCandidateSearchInput,
  getAgentSingleToolCases,
  type AgentSingleToolCase,
  type AgentSingleToolResources,
} from "./agent-tool-fixtures";
import {
  formatAgentSingleToolSelectionConditions,
  selectAgentSingleToolCases,
  type AgentSingleToolSelectionResult,
} from "./agent-tool-selection";
import { runFlowQueue } from "./flow-execution";

type DeepSeekUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type AgentSingleToolRecord = {
  caseId: string;
  toolName: string;
  group: string;
  scenario: string;
  note: string;
  plannedSetup: string[];
  setupTools: string[];
  expectedInputPreview: string;
  rawModelOutputPreview: string;
  parsedAction?: string;
  parsedToolName?: string;
  schemaValid: boolean;
  executionOk?: boolean;
  outputFieldStatus: AgentSingleToolAssertionStatus;
  decisionStatus: AgentSingleToolAssertionStatus;
  schemaStatus: AgentSingleToolAssertionStatus;
  executionStatus: AgentSingleToolAssertionStatus;
  contractStatus: AgentSingleToolAssertionStatus;
  status: AgentSingleToolAssertionStatus;
  failureLevel?: AgentSingleToolFailureLevel;
  failureReasons: string[];
  modelError?: string;
  toolError?: string;
  toolResultId?: string;
  producedResourceIds: string[];
  seededArtifactIds: string[];
  sessionId: string;
  runId: string;
  usage?: DeepSeekUsage;
  skipReason?: string;
};

type AgentSingleToolTokenEstimate = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: "fallback";
  calibrationSummary: string;
};

type ToolTestEnvironment = {
  userId: string;
  sessionId: string;
  runId: string;
  responseMessageId: string;
  registry: ReturnType<typeof createToolFirstAgentToolRegistry>;
  toolResults: AgentToolResultRecord[];
  setupTools: string[];
  seededArtifactIds: string[];
  exercises: FixtureExercise[];
  resources: Partial<AgentSingleToolResources>;
};

type FixtureExercise = {
  id: string;
  nameZh: string;
  nameEn: string;
  categoryZh: string | null;
  levelZh: string | null;
  equipmentZh: string | null;
  primaryMusclesZh: string[];
  secondaryMusclesZh: string[];
  imageUrls: string[];
};

type ManualPreflightResult = {
  status: "ready" | "skipped" | "failed";
  modelAvailable: boolean;
  databaseAvailable: boolean;
  artifactTablesAvailable: boolean;
  seedDataAvailable: boolean;
  checkedAt: string;
  reason?: string;
  detail?: string;
};

type ModelDecisionRequestResult =
  | {
      ok: true;
      content: string;
      usage: DeepSeekUsage;
    }
  | {
      ok: false;
      code: "ai_request_failed" | "empty_content" | "invalid_json";
      message: string;
      detail?: unknown;
      content?: string;
      usage?: DeepSeekUsage;
    };

type RunSummary = ReturnType<typeof summarizeRunRecords>;

const model = "deepseek-v4-flash";
const configuredApiKey = process.env.DEEPSEEK_API_KEY?.trim();
const dryRun = process.env.MANUAL_LLM_AGENT_TOOL_DRY_RUN === "1";
const runCommand = process.env.MANUAL_LLM_AGENT_TOOL_RUN_COMMAND?.trim() || "npm run test:llm:agent-tool";
const allCases = getAgentSingleToolCases();
const reportPath = process.env.MANUAL_LLM_AGENT_TOOL_REPORT_PATH?.trim()
  ? path.resolve(process.env.MANUAL_LLM_AGENT_TOOL_REPORT_PATH)
  : path.join(process.cwd(), "docs", "manual-llm-agent-tool-call-latest-report.md");
const concurrency = readConcurrency();
const runRecords: AgentSingleToolRecord[] = [];
let selectedCases: AgentSingleToolCase[] = [];
let selectionResult: AgentSingleToolSelectionResult | undefined;
let preflightResult: ManualPreflightResult | undefined;
let estimatedTokenUsage: AgentSingleToolTokenEstimate = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  source: "fallback",
  calibrationSummary: "尚未执行 token 预估。",
};

if (!configuredApiKey && !dryRun) {
  console.warn(
    [
      "Missing DEEPSEEK_API_KEY.",
      "单次 LLM -> Agent tool 测试必须调用真实模型；缺少 key 时只生成跳过摘要。",
      "该测试不会使用 mock、旧快照或非真实模型结果。",
    ].join("\n"),
  );
}

describe("manual LLM single Agent tool invocation", () => {
  beforeAll(async () => {
    selectionResult = await selectAgentSingleToolCases(allCases, {
      ids: readListEnv("MANUAL_LLM_AGENT_TOOL_IDS"),
      groups: readListEnv("MANUAL_LLM_AGENT_TOOL_GROUPS"),
      tools: readListEnv("MANUAL_LLM_AGENT_TOOL_NAMES"),
      failedFromReportPath: process.env.MANUAL_LLM_AGENT_TOOL_FAILED_FROM_REPORT?.trim() || undefined,
    });
    selectedCases = selectionResult.selectedCases;
    estimatedTokenUsage = estimateAgentToolTokenUsage(selectedCases);

    if (selectionResult.errors.length > 0) {
      throw new Error(selectionResult.errors.join("\n"));
    }

    preflightResult = dryRun
      ? createDryRunPreflightResult()
      : await runSingleToolPreflight(configuredApiKey);

    console.log("手动 LLM 单次 Agent tool 调用测试：");
    console.log(`筛选条件：${formatAgentSingleToolSelectionConditions(selectionResult.conditions)}`);
    console.log(`完整用例数：${allCases.length}`);
    console.log(`本次用例数：${selectedCases.length}`);
    console.log(`并发数：${concurrency}`);
    console.log(`dryRun：${dryRun ? "true" : "false"}`);
    console.log(`预估输入token：${estimatedTokenUsage.promptTokens}`);
    console.log(`预估输出token：${estimatedTokenUsage.completionTokens}`);
    console.log(`预估总token：${estimatedTokenUsage.totalTokens}`);
    console.log(`preflight：${preflightResult.status}`);
  });

  afterAll(async () => {
    const summary = summarizeRunRecords(runRecords);

    console.log(
      [
        "Manual LLM single Agent tool summary:",
        `cases=${summary.caseCount}`,
        `modelCalls=${summary.modelCalls}`,
        `targetToolExecutions=${summary.targetToolExecutions}`,
        `passed=${summary.passed}`,
        `failed=${summary.failed}`,
        `skipped=${summary.skipped}`,
        `needs_review=${summary.needsReview}`,
        `concurrency=${concurrency}`,
      ].join(" "),
    );
    console.log(
      [
        "Manual LLM single Agent tool actual token usage:",
        `prompt_tokens=${summary.usage.prompt_tokens}`,
        `completion_tokens=${summary.usage.completion_tokens}`,
        `total_tokens=${summary.usage.total_tokens}`,
      ].join(" "),
    );

    await writeAcceptanceReport(runRecords, summary);
    console.log(`Manual LLM single Agent tool report: ${reportPath}`);
  });

  test("runs selected single-tool invocations", async () => {
    if (selectionResult?.emptyReason === "no_failed_cases") {
      return;
    }

    const results = await runFlowQueue<AgentSingleToolCase, AgentSingleToolRecord>(
      selectedCases,
      concurrency,
      async (testCase) => [await runAgentSingleToolCase(testCase)],
    );
    runRecords.push(...results.flatMap((result) => result.records));
    const workerErrors = results
      .filter((result) => result.error)
      .map((result) => `${result.item.id} ${result.item.toolName}: ${result.error?.message}`);
    const failedCases = runRecords
      .filter((record) => record.status === "failed")
      .map((record) => `${record.caseId} ${record.toolName} single-tool assertion failed`);
    const errors = [...workerErrors, ...failedCases];

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }
  }, 60 * 60 * 1000);
});

async function runAgentSingleToolCase(testCase: AgentSingleToolCase): Promise<AgentSingleToolRecord> {
  if (preflightResult?.status !== "ready") {
    return createSkippedRecord(
      testCase,
      preflightResult?.reason ?? "preflight 未满足单次 LLM -> Agent tool 测试运行条件。",
    );
  }

  const registry = createToolFirstAgentToolRegistry();
  const targetTool = registry.get(testCase.toolName);

  if (!targetTool) {
    return createSetupFailedRecord(testCase, `目标 tool 未注册：${testCase.toolName}`);
  }

  const environment = await createToolTestEnvironment(registry);

  try {
    await prepareResourcesForCase(environment, testCase);
  } catch (error) {
    return createSetupFailedRecord(
      testCase,
      error instanceof Error ? error.message : String(error),
      environment,
    );
  }

  const completeResources = assertCompleteResources(environment.resources);
  const expectedInput = testCase.buildExpectedInput(completeResources);
  const modelRequest = await requestSingleToolDecision({
    apiKey: configuredApiKey,
    testCase,
    targetTool,
    expectedInput,
    resources: summarizeResourcesForPrompt(completeResources),
  });

  const runResult = await executeModelDecision({
    testCase,
    targetTool,
    environment,
    modelRequest,
  });
  const assertion = evaluateAgentSingleToolResult({ testCase, result: runResult });
  const parsedDecision = runResult.parseResult?.ok ? runResult.parseResult.decision : undefined;
  const executionOutput = runResult.executionResult?.ok ? runResult.executionResult.output : undefined;

  try {
    assertAgentSingleToolResult({ testCase, result: runResult });
  } catch {
    // 断言失败由返回记录汇总成单个 Vitest error，避免同一 case 重复打印大对象。
  }

  return {
    caseId: testCase.id,
    toolName: testCase.toolName,
    group: testCase.group,
    scenario: testCase.scenario,
    note: testCase.note,
    plannedSetup: testCase.setup,
    setupTools: environment.setupTools,
    expectedInputPreview: previewAgentToolText(JSON.stringify(expectedInput), 260),
    rawModelOutputPreview: previewAgentToolText(modelRequest.content ?? "", 260),
    parsedAction: parsedDecision?.action,
    parsedToolName: parsedDecision?.action === "call_tool" ? parsedDecision.toolName : undefined,
    schemaValid: runResult.schemaValid,
    executionOk: runResult.executionResult?.ok,
    outputFieldStatus: assertion.contractStatus,
    decisionStatus: assertion.decisionStatus,
    schemaStatus: assertion.schemaStatus,
    executionStatus: assertion.executionStatus,
    contractStatus: assertion.contractStatus,
    status: assertion.finalStatus,
    failureLevel: assertion.failureLevel,
    failureReasons: assertion.failureReasons,
    modelError: modelRequest.ok ? undefined : `${modelRequest.code}: ${modelRequest.message}`,
    toolError: runResult.executionResult && !runResult.executionResult.ok
      ? `${runResult.executionResult.error.code}: ${runResult.executionResult.error.message}`
      : undefined,
    toolResultId: runResult.executionResult?.ok ? runResult.executionResult.toolResultId : undefined,
    producedResourceIds: collectProducedResourceIds(executionOutput),
    seededArtifactIds: environment.seededArtifactIds,
    sessionId: environment.sessionId,
    runId: environment.runId,
    usage: modelRequest.usage,
  };
}

async function executeModelDecision(input: {
  testCase: AgentSingleToolCase;
  targetTool: AgentToolDefinition<unknown, unknown>;
  environment: ToolTestEnvironment;
  modelRequest: ModelDecisionRequestResult;
}): Promise<AgentSingleToolRunResult> {
  if (!input.modelRequest.ok) {
    const parsed = input.modelRequest.content
      ? parseAgentJsonObject(input.modelRequest.content)
      : undefined;
    const parseResult = parsed?.ok
      ? parseAgentToolDecision(parsed.value, input.environment.registry)
      : undefined;

    return {
      rawModelOutput: input.modelRequest.content,
      parsedDecision: parsed?.ok ? parsed.value : undefined,
      parseResult,
      schemaValid: false,
      schemaError: parsed && !parsed.ok ? parsed : input.modelRequest,
    };
  }

  const parsedJson = parseAgentJsonObject(input.modelRequest.content);
  if (!parsedJson.ok) {
    return {
      rawModelOutput: input.modelRequest.content,
      parsedDecision: undefined,
      schemaValid: false,
      schemaError: parsedJson,
    };
  }

  const parseResult = parseAgentToolDecision(parsedJson.value, input.environment.registry);
  if (!parseResult.ok || parseResult.decision.action !== "call_tool") {
    return {
      rawModelOutput: input.modelRequest.content,
      parsedDecision: parsedJson.value,
      parseResult,
      schemaValid: false,
      schemaError: parseResult,
    };
  }

  const schemaResult = input.targetTool.inputSchema.safeParse(parseResult.decision.input);
  if (!schemaResult.success) {
    return {
      rawModelOutput: input.modelRequest.content,
      parsedDecision: parsedJson.value,
      parseResult,
      schemaValid: false,
      schemaError: schemaResult.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  if (parseResult.decision.toolName !== input.testCase.toolName) {
    return {
      rawModelOutput: input.modelRequest.content,
      parsedDecision: parsedJson.value,
      parseResult,
      schemaValid: true,
    };
  }

  const executionResult = await input.targetTool.execute(
    schemaResult.data,
    createToolExecutionContext(input.environment),
  );

  return {
    rawModelOutput: input.modelRequest.content,
    parsedDecision: parsedJson.value,
    parseResult,
    schemaValid: true,
    executionResult,
  };
}

async function createToolTestEnvironment(
  registry: ReturnType<typeof createToolFirstAgentToolRegistry>,
): Promise<ToolTestEnvironment> {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      displayName: "manual-single-agent-tool-test-user",
    },
    select: { id: true },
  });
  const sessionId = createManualId("manual-agent-tool-session");
  const runId = createManualId("manual-agent-tool-run");
  const exercises = await loadFixtureExercises();

  return {
    userId: user.id,
    sessionId,
    runId,
    responseMessageId: createManualId("assistant"),
    registry,
    toolResults: [],
    setupTools: [],
    seededArtifactIds: [],
    exercises,
    resources: {
      exerciseId: exercises[0].id,
      responseMessageId: createManualId("assistant"),
      routineIntent: createRoutineIntent(),
      planIntent: createPlanIntent(),
      planStrategy: createPlanStrategy(),
    },
  };
}

async function prepareResourcesForCase(environment: ToolTestEnvironment, testCase: AgentSingleToolCase) {
  for (const setup of testCase.setup) {
    if (setup === "exercise") {
      await ensureExercise(environment);
      continue;
    }
    if (setup === "artifact") {
      await ensureArtifact(environment);
      continue;
    }
    if (setup === "memory") {
      await ensureMemory(environment);
      continue;
    }
    if (setup === "artifactPayload") {
      await ensureArtifactPayload(environment);
      continue;
    }
    if (setup === "candidateSet") {
      await ensureCandidateSet(environment);
      continue;
    }
    if (setup === "routineDraft") {
      await ensureRoutineDraft(environment);
      continue;
    }
    if (setup === "planDraft") {
      await ensurePlanDraft(environment);
      continue;
    }
    if (setup === "editPlan") {
      await ensureEditPlan(environment);
      continue;
    }
    if (setup === "patch") {
      await ensurePatch(environment);
      continue;
    }
    if (setup === "routineValidation") {
      await ensureRoutineValidation(environment);
      continue;
    }
    if (setup === "planValidation") {
      await ensurePlanValidation(environment);
      continue;
    }
    if (setup === "patchValidation") {
      await ensurePatchValidation(environment);
      continue;
    }
    if (setup === "policyDecision") {
      await ensurePolicyDecision(environment);
      continue;
    }
    throw new Error(`未知 setup：${setup}`);
  }
}

async function ensureExercise(environment: ToolTestEnvironment) {
  environment.resources.exerciseId ??= environment.exercises[0].id;
}

async function ensureArtifact(environment: ToolTestEnvironment) {
  if (environment.resources.artifactId) {
    return;
  }

  const artifact = await createOrUpdateConversationArtifact({
    userId: environment.userId,
    sessionId: environment.sessionId,
    messageId: createManualId("fixture_artifact"),
    kind: "routine",
    payload: createFixtureRoutinePayload(environment.exercises),
  });

  environment.resources.artifactId = artifact.id;
  environment.seededArtifactIds.push(artifact.id);
}

async function ensureMemory(environment: ToolTestEnvironment) {
  const prisma = getPrismaClient();

  await prisma.userProfile.upsert({
    where: { userId: environment.userId },
    create: {
      userId: environment.userId,
      goal: "增肌",
      experience: "beginner",
      sessionMinutes: 30,
      weeklyFrequency: 3,
      equipment: ["哑铃"],
      preferences: ["上肢训练"],
    },
    update: {
      goal: "增肌",
      experience: "beginner",
      sessionMinutes: 30,
      weeklyFrequency: 3,
      equipment: ["哑铃"],
      preferences: ["上肢训练"],
    },
  });
  await prisma.userMemory.create({
    data: {
      userId: environment.userId,
      kind: "explicit_preference",
      subjectType: "equipment",
      subjectLabel: "哑铃",
      value: { text: "用户有哑铃，偏好上肢训练。" },
      confidence: 1,
      source: "chat",
      status: "active",
      requiresConfirmation: false,
    },
  });
}

async function ensureArtifactPayload(environment: ToolTestEnvironment) {
  if (environment.resources.artifactPayloadId) {
    return;
  }

  await ensureArtifact(environment);
  const artifactId = requireResource(environment, "artifactId");
  const result = await executeSetupTool(environment, "getArtifactPayload", {
    artifactId,
    allowedArtifactIds: [artifactId],
  });
  const output = requireOkOutput(result);

  environment.resources.artifactPayloadId = readString(output, "artifactPayloadId");
}

async function ensureCandidateSet(environment: ToolTestEnvironment) {
  if (environment.resources.candidateSetId && environment.resources.candidateExerciseIds?.length) {
    return;
  }

  const result = await executeSetupTool(environment, "searchExercises", createRoutineCandidateSearchInput());
  const output = requireOkOutput(result);
  const candidateSetId = readString(output, "candidateSetId");
  const candidateExerciseIds = readStringArray(readNested(output, ["diagnostics", "finalExerciseIds"]));

  if (candidateExerciseIds.length === 0) {
    throw new Error("searchExercises setup 未产出 candidateExerciseIds。");
  }

  environment.resources.candidateSetId = candidateSetId;
  environment.resources.candidateExerciseIds = candidateExerciseIds;
}

async function ensureRoutineDraft(environment: ToolTestEnvironment) {
  if (environment.resources.routineDraftId) {
    return;
  }

  await ensureCandidateSet(environment);
  const result = await executeSetupTool(environment, "generateRoutineDraft", {
    intent: environment.resources.routineIntent,
    candidateSetId: requireResource(environment, "candidateSetId"),
    candidateExerciseIds: requireArrayResource(environment, "candidateExerciseIds"),
    title: "单工具测试上肢 routine",
  });
  const output = requireOkOutput(result);

  environment.resources.routineDraftId = readString(output, "draftId");
}

async function ensurePlanDraft(environment: ToolTestEnvironment) {
  if (environment.resources.planDraftId) {
    return;
  }

  await ensureCandidateSet(environment);
  const result = await executeSetupTool(environment, "generatePlanDraft", {
    intent: environment.resources.planIntent,
    candidateSetId: requireResource(environment, "candidateSetId"),
    candidateExerciseIds: requireArrayResource(environment, "candidateExerciseIds"),
    strategy: environment.resources.planStrategy,
  });
  const output = requireOkOutput(result);

  environment.resources.planDraftId = readString(output, "draftId");
}

async function ensureEditPlan(environment: ToolTestEnvironment) {
  if (environment.resources.editPlan) {
    return;
  }

  await ensureArtifactPayload(environment);
  const result = await executeSetupTool(environment, "proposeWorkoutEditPlan", {
    targetArtifactId: requireResource(environment, "artifactId"),
    sourceArtifactPayloadId: requireResource(environment, "artifactPayloadId"),
    allowedArtifactPayloadIds: [requireResource(environment, "artifactPayloadId")],
    requestedChangeSummary: "不用哑铃了，替换为自重上肢动作。",
    preserve: [{ kind: "duration", summary: "保留 30 分钟训练时长。" }],
    changes: [{ kind: "equipment", summary: "排除哑铃，改用自重动作。" }],
    scope: "whole_routine",
    strategy: "patch",
    requiredCandidateSetIds: [],
    confirmationLevel: "none",
  });
  const output = requireOkOutput(result);

  environment.resources.editPlan = output;
}

async function ensurePatch(environment: ToolTestEnvironment) {
  if (environment.resources.patchId && environment.resources.patch) {
    return;
  }

  await ensureArtifact(environment);
  await ensureEditPlan(environment);
  await ensureCandidateSet(environment);
  const patch = createWorkoutPatchInput(environment);
  const result = await executeSetupTool(environment, "proposeWorkoutPatch", {
    editPlan: environment.resources.editPlan,
    candidateSetId: requireResource(environment, "candidateSetId"),
    candidateExerciseIds: requireArrayResource(environment, "candidateExerciseIds"),
    patch,
  });
  const output = requireOkOutput(result);

  environment.resources.patch = readNested(output, ["patch"]) ?? patch;
  environment.resources.patchId = readString(output, "patchId");
}

async function ensureRoutineValidation(environment: ToolTestEnvironment) {
  if (environment.resources.routineValidationId) {
    return;
  }

  await ensureRoutineDraft(environment);
  const result = await executeSetupTool(environment, "validateRoutineDraft", {
    draftId: requireResource(environment, "routineDraftId"),
    candidateSetId: requireResource(environment, "candidateSetId"),
    candidateExerciseIds: requireArrayResource(environment, "candidateExerciseIds"),
    intent: environment.resources.routineIntent,
  });
  const output = requireOkOutput(result);

  environment.resources.routineValidationId = readString(output, "validationId");
}

async function ensurePlanValidation(environment: ToolTestEnvironment) {
  if (environment.resources.planValidationId) {
    return;
  }

  await ensurePlanDraft(environment);
  const result = await executeSetupTool(environment, "validatePlanDraft", {
    draftId: requireResource(environment, "planDraftId"),
    candidateSetId: requireResource(environment, "candidateSetId"),
    candidateExerciseIds: requireArrayResource(environment, "candidateExerciseIds"),
    intent: environment.resources.planIntent,
  });
  const output = requireOkOutput(result);

  environment.resources.planValidationId = readString(output, "validationId");
}

async function ensurePatchValidation(environment: ToolTestEnvironment) {
  if (environment.resources.patchValidationId) {
    return;
  }

  await ensurePatch(environment);
  const result = await executeSetupTool(environment, "validateWorkoutPatch", {
    patchId: requireResource(environment, "patchId"),
    candidateSetId: requireResource(environment, "candidateSetId"),
    candidateExerciseIds: requireArrayResource(environment, "candidateExerciseIds"),
    patch: environment.resources.patch,
  });
  const output = requireOkOutput(result);

  environment.resources.patchValidationId = readString(output, "validationId");
}

async function ensurePolicyDecision(environment: ToolTestEnvironment) {
  if (environment.resources.policyDecisionId) {
    return;
  }

  await ensureRoutineDraft(environment);
  const result = await executeSetupTool(environment, "evaluatePolicy", {
    policyTarget: "new_artifact",
    artifactKind: "routine",
    draftId: requireResource(environment, "routineDraftId"),
  });
  const output = requireOkOutput(result);

  environment.resources.policyDecisionId = readString(output, "policyDecisionId");
}

async function executeSetupTool(
  environment: ToolTestEnvironment,
  toolName: string,
  input: unknown,
): Promise<AgentToolExecutionResult<unknown>> {
  const tool = environment.registry.get(toolName);
  if (!tool) {
    throw new Error(`setup tool 未注册：${toolName}`);
  }

  const parsedInput = tool.inputSchema.parse(input);
  const result = await tool.execute(parsedInput, createToolExecutionContext(environment));
  const record = createToolResultRecordForTest(toolName, result);

  environment.toolResults.push(record);
  environment.setupTools.push(toolName);

  if (!result.ok) {
    throw new Error(`setup tool ${toolName} 执行失败：${result.error.code}: ${result.error.message}`);
  }

  return result;
}

function createToolExecutionContext(environment: ToolTestEnvironment): AgentToolExecutionContext {
  return {
    runId: environment.runId,
    userId: environment.userId,
    sessionId: environment.sessionId,
    toolResults: environment.toolResults,
  };
}

function createToolResultRecordForTest(
  toolName: string,
  result: AgentToolExecutionResult<unknown>,
): AgentToolResultRecord {
  if (!result.ok) {
    return {
      toolResultId: createManualId("tool_result"),
      toolCallId: createManualId("setup_tool_call"),
      toolName,
      status: result.error.code === "policy_blocked" ? "blocked" : "failed",
      traceSummary: result.traceSummary,
      error: result.error,
    };
  }

  return {
    toolResultId: result.toolResultId,
    toolCallId: createManualId("setup_tool_call"),
    toolName,
    status: result.fulfillment?.satisfied === false ? "failed" : "success",
    output: result.output,
    modelSummary: result.modelSummary,
    traceSummary: result.traceSummary,
    fulfillment: result.fulfillment,
    ...extractStructuredIds(result.output),
  };
}

async function requestSingleToolDecision(input: {
  apiKey: string | undefined;
  testCase: AgentSingleToolCase;
  targetTool: AgentToolDefinition<unknown, unknown>;
  expectedInput: unknown;
  resources: unknown;
}): Promise<ModelDecisionRequestResult> {
  if (!input.apiKey) {
    return {
      ok: false,
      code: "ai_request_failed",
      message: "Missing DEEPSEEK_API_KEY.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  const targetDefinition = {
    name: input.targetTool.name,
    description: input.targetTool.description,
    accessLevel: input.targetTool.accessLevel,
    inputJsonSchemaHint: z.toJSONSchema(input.targetTool.inputSchema),
    dependencies: input.targetTool.dependencies,
    capabilityContract: input.targetTool.capabilityContract,
  };
  const messages = [
    {
      role: "system",
      content: [
        "你是 Agent tool 单次调用测试器。",
        "只返回一个 JSON 对象，不要输出 Markdown。",
        "必须返回 call_tool，禁止返回 final_result。",
        "只能调用 targetToolName 指定的 tool，不能调用其他 tool，不能请求多个 tool。",
        "必须使用 expectedInput 中提供的资源 id 和字面值；如果需要组织字段，只能在目标 tool schema 内组织。",
        "返回格式：{\"action\":\"call_tool\",\"toolName\":\"目标工具名\",\"input\":{...},\"reason\":\"一句简短原因\"}",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        targetToolName: input.testCase.toolName,
        scenario: input.testCase.scenario,
        targetTool: targetDefinition,
        availableResources: input.resources,
        expectedInput: input.expectedInput,
      }),
    },
  ];

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        response_format: {
          type: "json_object",
        },
        thinking: {
          type: "disabled",
        },
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "ai_request_failed",
        message: "DeepSeek single tool decision request failed.",
        detail: await response.text(),
      };
    }

    const rawResponseText = await response.text();
    const body = JSON.parse(rawResponseText) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: DeepSeekUsage;
    };
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";

    if (!content) {
      return {
        ok: false,
        code: "empty_content",
        message: "DeepSeek single tool decision returned empty content.",
        usage: body.usage,
      };
    }

    return {
      ok: true,
      content,
      usage: body.usage ?? {},
    };
  } catch (error) {
    return {
      ok: false,
      code: "ai_request_failed",
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "DeepSeek single tool decision timed out."
          : "DeepSeek single tool decision failed.",
      detail: error instanceof Error ? error.message : error,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadFixtureExercises(): Promise<[FixtureExercise, FixtureExercise, FixtureExercise]> {
  const prisma = getPrismaClient();
  const exercises = await prisma.exercise.findMany({
    where: { isPublished: true },
    orderBy: { nameZh: "asc" },
    take: 3,
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      categoryZh: true,
      levelZh: true,
      equipmentZh: true,
      primaryMusclesZh: true,
      secondaryMusclesZh: true,
      imageUrls: true,
    },
  });
  const fallbackExercises = exercises.length > 0
    ? exercises
    : await prisma.exercise.findMany({
        orderBy: { nameZh: "asc" },
        take: 3,
        select: {
          id: true,
          nameZh: true,
          nameEn: true,
          categoryZh: true,
          levelZh: true,
          equipmentZh: true,
          primaryMusclesZh: true,
          secondaryMusclesZh: true,
          imageUrls: true,
        },
      });

  if (fallbackExercises.length === 0) {
    throw new Error("缺少 Exercise seed 数据，无法执行单工具测试。");
  }

  return [
    fallbackExercises[0],
    fallbackExercises[1] ?? fallbackExercises[0],
    fallbackExercises[2] ?? fallbackExercises[0],
  ];
}

function createFixtureRoutinePayload(exercises: FixtureExercise[]) {
  return {
    kind: "routine",
    title: "单工具测试 30 分钟上肢训练",
    goal: "上肢力量训练",
    summary: "用于单次 LLM -> Agent tool 测试的 routine artifact。",
    estimatedSessionMinutes: 30,
    trainingLoopRounds: 2,
    trainingLoopRestSeconds: 90,
    sections: [
      createFixtureRoutineSection("warmup", "热身激活", exercises[0], "上肢热身。"),
      createFixtureRoutineSection("training", "主训练", exercises[1] ?? exercises[0], "主训练阶段，当前版本包含哑铃条件。"),
      createFixtureRoutineSection("stretch", "拉伸放松", exercises[2] ?? exercises[0], "上肢拉伸。"),
    ],
    safetyNotes: ["如出现疼痛应停止训练。"],
  };
}

function createFixtureRoutineSection(
  section: WorkoutRoutineSection,
  title: string,
  exercise: FixtureExercise,
  notes: string,
) {
  return {
    section,
    title,
    items: [
      {
        exerciseId: exercise.id,
        section,
        mode: section === "training" ? "reps" : "duration",
        sets: section === "training" ? 3 : 1,
        target: section === "training" ? 12 : 45,
        setRestSeconds: section === "training" ? 60 : 15,
        transitionRestSeconds: section === "training" ? 90 : 30,
        notes,
      },
    ],
  };
}

function createRoutineIntent() {
  return {
    intentType: "routine",
    goal: "上肢力量训练",
    experience: "beginner",
    sessionMinutes: 30,
    weeklyFrequency: 1,
    equipment: [],
    injuryLimitations: [],
    preferences: ["居家", "动作简单"],
    avoidances: [],
  };
}

function createPlanIntent() {
  return {
    intentType: "plan",
    goal: "增肌",
    experience: "beginner",
    sessionMinutes: 40,
    weeklyFrequency: 3,
    equipment: [],
    injuryLimitations: [],
    preferences: ["上肢和全身力量"],
    avoidances: [],
  };
}

function createPlanStrategy() {
  return {
    goal: "增肌",
    horizonDays: 7,
    weeklyFrequency: 3,
    sessionMinutes: 40,
    strategy: "weekly_split",
    progressionPolicy: "volume_small_increase",
    intensityBias: "conservative",
    constraints: ["新手友好", "动作来自候选集合"],
    fieldSources: {
      goal: "current_user_message",
      sessionMinutes: "current_user_message",
      weeklyFrequency: "current_user_message",
    },
    defaultAssumptions: ["未提供伤病限制。"],
  };
}

function createWorkoutPatchInput(environment: ToolTestEnvironment) {
  const candidateIds = requireArrayResource(environment, "candidateExerciseIds");
  const originalExerciseId = environment.exercises[0].id;
  const replacementExerciseId = candidateIds.find((id) => id !== originalExerciseId) ?? candidateIds[0];

  return {
    scope: "artifact_only",
    target: {
      artifactId: requireResource(environment, "artifactId"),
      artifactKind: "routine",
    },
    operations: [
      {
        operation: "replace_exercise",
        target: {
          artifactId: requireResource(environment, "artifactId"),
          artifactKind: "routine",
          section: "training",
          exerciseId: originalExerciseId,
          occurrenceIndex: 1,
        },
        replacementExerciseId,
        preserve: {
          section: true,
          order: true,
          sets: true,
          target: true,
          duration: true,
          rest: true,
        },
        reason: "排除哑铃条件，替换为候选集合中的动作。",
      },
    ],
    reason: "用户要求不用哑铃，替换当前 routine 中的相关动作。",
  };
}

function assertCompleteResources(resources: Partial<AgentSingleToolResources>): AgentSingleToolResources {
  return resources as AgentSingleToolResources;
}

function createSkippedRecord(testCase: AgentSingleToolCase, skipReason: string): AgentSingleToolRecord {
  return {
    caseId: testCase.id,
    toolName: testCase.toolName,
    group: testCase.group,
    scenario: testCase.scenario,
    note: testCase.note,
    plannedSetup: testCase.setup,
    setupTools: [],
    expectedInputPreview: "",
    rawModelOutputPreview: "未请求真实模型。",
    schemaValid: false,
    outputFieldStatus: "skipped",
    decisionStatus: "skipped",
    schemaStatus: "skipped",
    executionStatus: "skipped",
    contractStatus: "skipped",
    status: "skipped",
    failureReasons: [],
    producedResourceIds: [],
    seededArtifactIds: [],
    sessionId: createManualId("manual-agent-tool-session"),
    runId: createManualId("manual-agent-tool-run"),
    skipReason,
  };
}

function createSetupFailedRecord(
  testCase: AgentSingleToolCase,
  errorMessage: string,
  environment?: ToolTestEnvironment,
): AgentSingleToolRecord {
  return {
    ...createSkippedRecord(testCase, ""),
    setupTools: environment?.setupTools ?? [],
    rawModelOutputPreview: "测试 setup 失败，未请求真实模型。",
    outputFieldStatus: "failed",
    decisionStatus: "failed",
    schemaStatus: "failed",
    executionStatus: "failed",
    contractStatus: "failed",
    status: "failed",
    failureLevel: "P0",
    failureReasons: [`[P0] setup 失败：${errorMessage}`],
    seededArtifactIds: environment?.seededArtifactIds ?? [],
    sessionId: environment?.sessionId ?? createManualId("manual-agent-tool-session"),
    runId: environment?.runId ?? createManualId("manual-agent-tool-run"),
    skipReason: undefined,
  };
}

function summarizeRunRecords(records: AgentSingleToolRecord[]) {
  const usage = records.reduce(
    (summary, record) => ({
      prompt_tokens: summary.prompt_tokens + (record.usage?.prompt_tokens ?? 0),
      completion_tokens: summary.completion_tokens + (record.usage?.completion_tokens ?? 0),
      total_tokens: summary.total_tokens + (record.usage?.total_tokens ?? 0),
    }),
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  );

  return {
    total: records.length,
    caseCount: selectedCases.length,
    modelCalls: records.filter((record) => !record.skipReason && record.rawModelOutputPreview !== "测试 setup 失败，未请求真实模型。").length,
    targetToolExecutions: records.filter((record) => typeof record.executionOk === "boolean").length,
    passed: records.filter((record) => record.status === "passed").length,
    failed: records.filter((record) => record.status === "failed").length,
    skipped: records.filter((record) => record.status === "skipped").length,
    needsReview: records.filter((record) => record.status === "needs_review").length,
    usage,
  };
}

async function writeAcceptanceReport(records: AgentSingleToolRecord[], summary: RunSummary) {
  const generatedAt = formatShanghaiReportGeneratedAt();
  const tokenDeviation = summarizeTokenDeviation(summary.usage, estimatedTokenUsage);
  const selectionConditions = selectionResult
    ? formatAgentSingleToolSelectionConditions(selectionResult.conditions)
    : "selection=not_initialized";
  const reportLines = [
    "# 手动 LLM 单次 Agent Tool 调用测试报告",
    "",
    `生成时间：${generatedAt}`,
    `模型：${model}`,
    `运行命令：${runCommand}`,
    `dryRun：${dryRun ? "true" : "false"}`,
    `真实/跳过状态：${preflightResult?.status === "ready" ? "真实模型已运行" : "跳过或环境未满足"}`,
    "",
    "## 汇总",
    "",
    `- 用例数：${summary.caseCount}`,
    `- 单次 LLM 请求数：${summary.modelCalls}`,
    `- 目标 tool 执行数：${summary.targetToolExecutions}`,
    `- 通过：${summary.passed}`,
    `- 失败：${summary.failed}`,
    `- 跳过：${summary.skipped}`,
    `- 需复核：${summary.needsReview}`,
    `- 预计输入 token：${estimatedTokenUsage.promptTokens}`,
    `- 预计输出 token：${estimatedTokenUsage.completionTokens}`,
    `- 预计总 token：${estimatedTokenUsage.totalTokens}`,
    `- 估算来源：${estimatedTokenUsage.source}`,
    `- 估算口径：${estimatedTokenUsage.calibrationSummary}`,
    `- prompt_tokens：${summary.usage.prompt_tokens}`,
    `- completion_tokens：${summary.usage.completion_tokens}`,
    `- total_tokens：${summary.usage.total_tokens}`,
    `- token 偏差摘要：${tokenDeviation}`,
    "",
    "## 运行范围",
    "",
    `- 完整 fixture case 数：${allCases.length}`,
    `- 本次筛选 case 数：${selectedCases.length}`,
    `- 筛选条件：${selectionConditions}`,
    `- 未运行 case 数：${selectionResult?.excludedCases.length ?? 0}`,
    `- 未运行原因：${formatUnrunReason()}`,
    `- 并发数：${concurrency}`,
    "",
    "## 当前参数",
    "",
    `- ids：${selectionResult?.conditions.ids.length ? selectionResult.conditions.ids.join(",") : "all"}`,
    `- group：${selectionResult?.conditions.groups.length ? selectionResult.conditions.groups.join(",") : "all"}`,
    `- tool：${selectionResult?.conditions.tools.length ? selectionResult.conditions.tools.join(",") : "all"}`,
    `- failed-from-report：${selectionResult?.conditions.failedFromReportPath ?? "none"}`,
    `- concurrency：${concurrency}`,
    `- report：${reportPath}`,
    `- dry-run：${dryRun ? "true" : "false"}`,
    "",
    "## Preflight",
    "",
    `- 状态：${preflightResult?.status ?? "not_run"}`,
    `- 模型 key：${preflightResult?.modelAvailable ? "可用" : "不可用"}`,
    `- 数据库：${preflightResult?.databaseAvailable ? "可用" : "不可用"}`,
    `- artifact 表：${preflightResult?.artifactTablesAvailable ? "可用" : "不可用"}`,
    `- seed 数据：${preflightResult?.seedDataAvailable ? "可用" : "不可用"}`,
    preflightResult?.reason ? `- 原因：${preflightResult.reason}` : "",
    preflightResult?.detail ? `- 详情：${preflightResult.detail}` : "",
    "",
    "## 断言分层",
    "",
    "- LLM 决策：一次模型请求必须只返回一个 `call_tool`，且 `toolName` 等于目标 tool。",
    "- 输入 Schema：LLM 输出的 `input` 必须通过目标 tool 的 `inputSchema`。",
    "- Tool 执行：只执行目标 tool 一次，执行结果必须 `ok=true`。",
    "- 结果合同：成功结果必须有 `toolResultId`、`modelSummary` 和 fixture 声明的关键输出字段。",
    "- setupTools：只用于预置依赖资源，不属于本 case 的 LLM tool 调用。",
    "",
    "## 失败分类摘要",
    "",
    ...formatFailureCategorySummary(records),
    "",
    "## 用例结果",
    "",
    records.length > 0
      ? records.map(formatRunRecord).join("\n")
      : "- 本次没有需要运行的失败 case，未请求真实模型。",
    "",
  ].filter((line) => line !== "");

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, reportLines.join("\n"), "utf8");
}

function formatFailureCategorySummary(records: AgentSingleToolRecord[]) {
  const categories = summarizeFailureCategories(records);
  const entries = Object.entries(categories);

  if (entries.every(([, value]) => value.count === 0)) {
    return ["- 本次没有失败用例。"];
  }

  return entries.map(([label, value]) => (
    value.count > 0
      ? `- ${label}：${value.count}（${value.caseIds.join("；")}）`
      : `- ${label}：0`
  ));
}

function summarizeFailureCategories(records: AgentSingleToolRecord[]) {
  const categories: Record<string, { count: number; caseIds: string[] }> = {
    llm_decision_invalid: { count: 0, caseIds: [] },
    wrong_tool: { count: 0, caseIds: [] },
    input_schema_invalid: { count: 0, caseIds: [] },
    tool_execution_failed: { count: 0, caseIds: [] },
    output_contract_invalid: { count: 0, caseIds: [] },
    setup_failed: { count: 0, caseIds: [] },
  };

  for (const record of records.filter((item) => item.status === "failed")) {
    const text = [
      record.modelError,
      record.toolError,
      ...record.failureReasons,
    ].filter(Boolean).join("\n");

    for (const label of classifyFailureText(text)) {
      categories[label].count += 1;
      categories[label].caseIds.push(record.caseId);
    }
  }

  return categories;
}

function classifyFailureText(text: string): Array<keyof ReturnType<typeof summarizeFailureCategories>> {
  const labels = new Set<keyof ReturnType<typeof summarizeFailureCategories>>();

  if (/setup 失败/.test(text)) labels.add("setup_failed");
  if (/无法解析|LLM 输出为空|没有返回 call_tool/.test(text)) labels.add("llm_decision_invalid");
  if (/调用了错误 tool/.test(text)) labels.add("wrong_tool");
  if (/schema/.test(text)) labels.add("input_schema_invalid");
  if (/执行失败/.test(text)) labels.add("tool_execution_failed");
  if (/缺少期望字段|toolResultId|modelSummary/.test(text)) labels.add("output_contract_invalid");
  if (labels.size === 0) labels.add("output_contract_invalid");

  return [...labels];
}

function formatRunRecord(record: AgentSingleToolRecord) {
  const statusLabel = record.status === "passed"
    ? "通过"
    : record.status === "failed"
      ? "失败"
      : record.status === "needs_review"
        ? "需复核"
        : "跳过";

  return [
    `### ${record.caseId} ${record.toolName}`,
    "",
    `- 状态：${statusLabel}`,
    `- group：${record.group}`,
    `- 场景：${record.scenario}`,
    `- 说明：${record.note}`,
    `- plannedSetup：${record.plannedSetup.length ? record.plannedSetup.join(", ") : "无"}`,
    `- setupTools：${record.setupTools.length ? record.setupTools.join(", ") : "无"}`,
    `- targetTool：${record.toolName}`,
    `- expectedInput 摘要：${record.expectedInputPreview || "无"}`,
    `- rawModelOutput 摘要：${record.rawModelOutputPreview}`,
    `- parsed action：${record.parsedAction ?? "missing"}`,
    `- parsed toolName：${record.parsedToolName ?? "missing"}`,
    `- LLM 决策断言：${record.decisionStatus}`,
    `- input schema 断言：${record.schemaStatus}`,
    `- tool 执行断言：${record.executionStatus}`,
    `- 输出合同断言：${record.contractStatus}`,
    record.failureLevel ? `- 失败等级：${record.failureLevel}` : "",
    record.failureReasons.length ? `- 失败原因：${record.failureReasons.join("；")}` : "",
    record.modelError ? `- 模型错误：${record.modelError}` : "",
    record.toolError ? `- tool 错误：${record.toolError}` : "",
    record.toolResultId ? `- toolResultId：${record.toolResultId}` : "",
    record.producedResourceIds.length ? `- 产出资源：${record.producedResourceIds.join(", ")}` : "",
    record.seededArtifactIds.length ? `- 预置 artifact：${record.seededArtifactIds.join(", ")}` : "",
    record.skipReason ? `- 跳过原因：${record.skipReason}` : "",
    `- runId：${record.runId}`,
    `- sessionId：${record.sessionId}`,
    "",
  ].filter((line) => line !== "").join("\n");
}

async function runSingleToolPreflight(apiKey: string | undefined): Promise<ManualPreflightResult> {
  const checkedAt = new Date().toISOString();

  if (!apiKey?.trim()) {
    return {
      status: "skipped",
      modelAvailable: false,
      databaseAvailable: false,
      artifactTablesAvailable: false,
      seedDataAvailable: false,
      checkedAt,
      reason: "缺少 DEEPSEEK_API_KEY，真实模型单工具测试未运行。",
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: "failed",
      modelAvailable: true,
      databaseAvailable: false,
      artifactTablesAvailable: false,
      seedDataAvailable: false,
      checkedAt,
      reason: "缺少 DATABASE_URL，无法执行真实 tool 测试。",
    };
  }

  try {
    const prisma = getPrismaClient();
    const [artifactCount, artifactIndexCount, exerciseCount] = await Promise.all([
      prisma.conversationArtifact.count(),
      prisma.artifactIndex.count(),
      prisma.exercise.count(),
    ]);

    return {
      status: exerciseCount > 0 ? "ready" : "failed",
      modelAvailable: true,
      databaseAvailable: true,
      artifactTablesAvailable: artifactCount >= 0 && artifactIndexCount >= 0,
      seedDataAvailable: exerciseCount > 0,
      checkedAt,
      reason: exerciseCount > 0 ? undefined : "基础动作 seed 数据不可用，无法执行真实 Agent tool。",
    };
  } catch (error) {
    return {
      status: "failed",
      modelAvailable: true,
      databaseAvailable: false,
      artifactTablesAvailable: false,
      seedDataAvailable: false,
      checkedAt,
      reason: "数据库、migration 或 artifact 表 preflight 失败。",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function createDryRunPreflightResult(): ManualPreflightResult {
  return {
    status: "skipped",
    modelAvailable: Boolean(configuredApiKey),
    databaseAvailable: false,
    artifactTablesAvailable: false,
    seedDataAvailable: false,
    checkedAt: new Date().toISOString(),
    reason: "--dry-run 已开启，只生成筛选、预估和跳过报告，不请求真实模型。",
  };
}

function estimateAgentToolTokenUsage(cases: AgentSingleToolCase[]): AgentSingleToolTokenEstimate {
  const charCount = cases.reduce((sum, testCase) => (
    sum + testCase.toolName.length + testCase.scenario.length + testCase.note.length
  ), 0);
  const promptTokens = Math.ceil(charCount / 2) + cases.length * 1_800;
  const completionTokens = cases.length * 260;

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    source: "fallback",
    calibrationSummary: `按 ${cases.length} 个单工具 case、每个 case 一次 LLM JSON decision 和保守均值估算。`,
  };
}

function formatShanghaiReportGeneratedAt(date = new Date()) {
  const shanghaiOffsetMinutes = 8 * 60;
  const shanghaiTime = new Date(date.getTime() + shanghaiOffsetMinutes * 60_000);

  return shanghaiTime.toISOString().replace("Z", "+08:00");
}

function summarizeTokenDeviation(actual: Required<DeepSeekUsage>, estimate: AgentSingleToolTokenEstimate) {
  if (actual.total_tokens <= 0) {
    return "本次没有真实 token usage，通常表示 dry-run、跳过或运行失败。";
  }

  const delta = actual.total_tokens - estimate.totalTokens;
  const ratio = estimate.totalTokens > 0 ? Math.round((delta / estimate.totalTokens) * 100) : 0;

  return `实际 total_tokens=${actual.total_tokens}，预估=${estimate.totalTokens}，偏差=${delta} (${ratio}%)。`;
}

function formatUnrunReason() {
  if (selectionResult?.emptyReason === "no_failed_cases") {
    return "failed-from-report 中没有失败 case，本次无需重跑。";
  }
  if ((selectionResult?.excludedCases.length ?? 0) > 0) {
    return "被 group/id/tool/failed-from-report 筛选条件排除。";
  }
  if (dryRun) {
    return "--dry-run 开启。";
  }
  if (preflightResult?.status !== "ready") {
    return preflightResult?.reason ?? "preflight 未满足。";
  }
  return "完整运行，无筛选排除。";
}

function collectProducedResourceIds(output: unknown) {
  const ids = extractStructuredIds(output);

  return Object.values(ids).filter((id): id is string => typeof id === "string" && id.length > 0);
}

function extractStructuredIds(output: unknown) {
  if (!output || typeof output !== "object") {
    return {};
  }

  const record = output as Record<string, unknown>;

  return {
    candidateSetId: asString(record.candidateSetId),
    artifactPayloadId: asString(record.artifactPayloadId),
    editPlanId: asString(record.editPlanId),
    draftId: asString(record.draftId),
    patchId: asString(record.patchId),
    validationId: asString(record.validationId),
    policyDecisionId: asString(record.policyDecisionId),
    confirmationId: asString(record.confirmationId),
    revisionId: asString(record.revisionId),
    operationResultId: asString(record.operationResultId),
  };
}

function requireOkOutput(result: AgentToolExecutionResult<unknown>) {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }

  return result.output;
}

function requireResource(
  environment: ToolTestEnvironment,
  key: keyof AgentSingleToolResources,
) {
  const value = environment.resources[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`缺少资源：${key}`);
  }

  return value;
}

function requireArrayResource(
  environment: ToolTestEnvironment,
  key: keyof AgentSingleToolResources,
) {
  const value = environment.resources[key];

  if (!Array.isArray(value) || !value.every((item) => typeof item === "string") || value.length === 0) {
    throw new Error(`缺少数组资源：${key}`);
  }

  return value;
}

function readString(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    throw new Error(`输出不是对象，无法读取 ${key}`);
  }

  const field = (value as Record<string, unknown>)[key];
  if (typeof field !== "string" || !field.trim()) {
    throw new Error(`输出缺少字符串字段：${key}`);
  }

  return field;
}

function readNested(value: unknown, pathParts: string[]) {
  return pathParts.reduce((current, key) => (
    current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined
  ), value);
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function summarizeResourcesForPrompt(resources: AgentSingleToolResources) {
  return {
    artifactId: resources.artifactId,
    artifactPayloadId: resources.artifactPayloadId,
    exerciseId: resources.exerciseId,
    candidateSetId: resources.candidateSetId,
    candidateExerciseIds: resources.candidateExerciseIds?.slice(0, 12),
    routineDraftId: resources.routineDraftId,
    planDraftId: resources.planDraftId,
    routineValidationId: resources.routineValidationId,
    planValidationId: resources.planValidationId,
    patchId: resources.patchId,
    patchValidationId: resources.patchValidationId,
    policyDecisionId: resources.policyDecisionId,
    responseMessageId: resources.responseMessageId,
  };
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function createManualId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readListEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readConcurrency() {
  const value = Number(process.env.MANUAL_LLM_AGENT_TOOL_CONCURRENCY ?? "1");

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}
