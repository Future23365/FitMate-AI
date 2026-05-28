import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { aiPromptConfig } from "@/lib/server/ai/prompt-config";
import { formatFitnessConversationContextForPrompt } from "@/lib/shared/chat/fitness-conversation-context";

import { assertCaseOutput } from "./assertions";
import { manualLlmCandidateExercises, manualLlmCases, type ManualLlmCase } from "./fixtures";

type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type DeepSeekChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: DeepSeekUsage;
};

type DeepSeekUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type ManualLlmRunResult = {
  content: string;
  usage?: DeepSeekUsage;
};

type ManualLlmRunRecord = {
  caseName: string;
  callSite: ManualLlmCase["callSite"];
  userQuestion: string;
  answerPreview: string;
  localResult: string;
  status: "passed" | "failed";
  error?: string;
  usage?: DeepSeekUsage;
};

const model = "deepseek-v4-flash";
const configuredApiKey = process.env.DEEPSEEK_API_KEY?.trim();
const describeIfConfigured = configuredApiKey ? describe : describe.skip;
const reportPath = path.join(process.cwd(), "docs", "manual-llm-consistency-latest-report.md");
const runRecords: ManualLlmRunRecord[] = [];

if (!configuredApiKey) {
  console.warn(
    [
      "Missing DEEPSEEK_API_KEY.",
      "手动 LLM 一致性测试必须调用真实模型；请设置 DEEPSEEK_API_KEY 后重新运行 `npm run test:llm`。",
      "该测试不会使用 mock、旧快照或非真实模型结果。",
    ].join("\n"),
  );
}

describeIfConfigured("manual LLM consistency", () => {
  beforeAll(() => {
    const estimate = estimateTokenUsage();

    console.log("手动 LLM 一致性测试 token 预估：");
    console.log(`预估输入token：${estimate.promptTokens}`);
    console.log(`预估输出token：${estimate.completionTokens}`);
    console.log(`预估总token：${estimate.totalTokens}`);
    console.log("说明：这是按请求文本长度粗略估算，最终以模型返回 usage 为准。");
  });

  afterAll(async () => {
    const summary = summarizeUsage(runRecords);

    console.log(
      [
        "Manual LLM consistency actual token usage:",
        `prompt_tokens=${summary.promptTokens}`,
        `completion_tokens=${summary.completionTokens}`,
        `total_tokens=${summary.totalTokens}`,
      ].join(" "),
    );

    await writeAcceptanceReport(runRecords, summary);
    console.log(`Manual LLM acceptance report: ${reportPath}`);
  });

  test.each(manualLlmCases)("$callSite - $name", async (testCase) => {
    let result: ManualLlmRunResult | undefined;

    try {
      result = await runManualLlmCase(testCase);
      expect(result.content.trim().length).toBeGreaterThan(0);
      assertCaseOutput(testCase, result.content);
      runRecords.push(createRunRecord(testCase, result, "passed"));
    } catch (error) {
      runRecords.push(
        createRunRecord(testCase, result, "failed", error instanceof Error ? error.message : String(error)),
      );
      throw error;
    }
  });
});

async function runManualLlmCase(testCase: ManualLlmCase): Promise<ManualLlmRunResult> {
  const apiKey = getRequiredApiKey();
  const messages = buildMessages(testCase);
  const jsonMode =
    testCase.callSite === "chatIntentResolution" ||
    testCase.callSite === "exerciseRecommendationGeneration";

  return requestDeepSeek(apiKey, messages, { jsonMode });
}

function getRequiredApiKey() {
  if (!configuredApiKey) {
    throw new Error(
      [
        "Missing DEEPSEEK_API_KEY.",
        "手动 LLM 一致性测试必须调用真实模型；请设置 DEEPSEEK_API_KEY 后重新运行 `npm run test:llm`。",
        "该测试不会使用 mock、旧快照或非真实模型结果。",
      ].join("\n"),
    );
  }

  return configuredApiKey;
}

function buildMessages(testCase: ManualLlmCase): DeepSeekMessage[] {
  const conversationContextPrompt = formatFitnessConversationContextForPrompt(testCase.conversationContext);

  switch (testCase.callSite) {
    case "chatIntentResolution":
      return [
        {
          role: "system",
          content: [aiPromptConfig.chatIntentResolution.system, conversationContextPrompt].filter(Boolean).join("\n\n"),
        },
        ...(testCase.messages ?? []),
      ];
    case "chatCompletion":
      return [
        {
          role: "system",
          content: buildChatCompletionSystemPrompt(testCase, conversationContextPrompt),
        },
        ...(testCase.messages ?? []),
      ];
    case "exerciseRecommendationGeneration":
      return [
        {
          role: "system",
          content: aiPromptConfig.exerciseRecommendationGeneration.system,
        },
        {
          role: "user",
          content: JSON.stringify({
            intent: testCase.intent,
            conversationContext: testCase.conversationContext,
            excludedExerciseIds: testCase.excludedExerciseIds ?? [],
            candidateExercises: manualLlmCandidateExercises.map((exercise, index) => ({
              exerciseId: exercise.id,
              nameZh: exercise.nameZh,
              nameEn: exercise.nameEn,
              categoryZh: exercise.categoryZh,
              level: exercise.level,
              levelZh: exercise.levelZh,
              equipmentZh: exercise.equipmentZh,
              primaryMusclesZh: exercise.primaryMusclesZh,
              secondaryMusclesZh: exercise.secondaryMusclesZh,
              riskTags: exercise.riskTags,
              goalTags: exercise.goalTags,
              candidateSource: index < 4 ? "primary" : "supplementary",
              candidateScore: 50 - index,
              candidateReasons: ["匹配用户目标", "适合当前器械条件"],
            })),
            recentMessages: testCase.messages,
          }),
        },
      ];
    case "workoutPlanIntentExtraction":
      return [
        {
          role: "system",
          content: [
            aiPromptConfig.workoutPlanIntentExtraction.system,
            conversationContextPrompt,
          ].filter(Boolean).join("\n\n"),
        },
        ...(testCase.messages ?? []),
      ];
    case "workoutPlanDraftGeneration":
      return [
        {
          role: "system",
          content: [
            ...aiPromptConfig.workoutPlanDraftGeneration.base,
            testCase.intent?.intentType === "routine"
              ? aiPromptConfig.workoutPlanDraftGeneration.routine
              : aiPromptConfig.workoutPlanDraftGeneration.plan,
            ...aiPromptConfig.workoutPlanDraftGeneration.schema,
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            intent: testCase.intent,
            conversationContext: testCase.conversationContext,
            primaryExercises: manualLlmCandidateExercises.slice(0, 4).map(toDraftExercisePayload),
            supplementaryExercises: manualLlmCandidateExercises.slice(4).map(toDraftExercisePayload),
            recentMessages: testCase.messages,
          }),
        },
      ];
  }
}

function buildChatCompletionSystemPrompt(testCase: ManualLlmCase, conversationContextPrompt: string) {
  if (!testCase.intent) {
    return [aiPromptConfig.chatCompletion.system, conversationContextPrompt].filter(Boolean).join("\n\n");
  }

  return [
    aiPromptConfig.chatCompletion.system,
    conversationContextPrompt,
    "",
    aiPromptConfig.chatCompletion.exerciseContext,
    "",
    "serverParsedIntent:",
    JSON.stringify(
      {
        type: testCase.intent.intentType === "plan" ? "workout_plan" : "routine",
        needsExerciseContext: true,
        requestedExerciseName: "",
        canTriggerAction: testCase.candidateStatus !== "insufficient",
        missingActionFields: [],
      },
      null,
      2,
    ),
    "",
    "serverWorkoutIntent:",
    JSON.stringify(testCase.intent, null, 2),
    "",
    "providedExercises:",
    JSON.stringify(manualLlmCandidateExercises.map(toProvidedExercisePayload), null, 2),
    "",
    "candidateState:",
    JSON.stringify(
      {
        status: testCase.candidateStatus ?? "enough",
        relevantCandidateCount: testCase.candidateStatus === "insufficient" ? 1 : 6,
        requiredRelevantCandidateCount: 4,
        warnings: testCase.candidateStatus === "insufficient" ? ["当前条件下匹配动作不足。"] : [],
      },
      null,
      2,
    ),
  ].join("\n");
}

function toProvidedExercisePayload(exercise: (typeof manualLlmCandidateExercises)[number]) {
  return {
    exerciseId: exercise.id,
    nameZh: exercise.nameZh,
    categoryZh: exercise.categoryZh ?? "训练",
    level: exercise.level ?? "beginner",
    equipmentZh: exercise.equipmentZh ?? "未标注器械",
    primaryMusclesZh: exercise.primaryMusclesZh,
    secondaryMusclesZh: exercise.secondaryMusclesZh,
    riskTags: exercise.riskTags,
    goalTags: exercise.goalTags,
    source: "primary",
  };
}

function toDraftExercisePayload(exercise: (typeof manualLlmCandidateExercises)[number]) {
  return {
    exerciseId: exercise.id,
    nameZh: exercise.nameZh,
    categoryZh: exercise.categoryZh,
    level: exercise.level,
    equipmentZh: exercise.equipmentZh,
    primaryMusclesZh: exercise.primaryMusclesZh,
    riskTags: exercise.riskTags,
    goalTags: exercise.goalTags,
  };
}

async function requestDeepSeek(
  apiKey: string,
  messages: DeepSeekMessage[],
  options: { jsonMode: boolean },
): Promise<ManualLlmRunResult> {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      thinking: {
        type: "disabled",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as DeepSeekChatResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("DeepSeek API returned empty content.");
  }

  return {
    content,
    usage: data.usage,
  };
}

function estimateTokenUsage() {
  const promptTokens = manualLlmCases.reduce((total, testCase) => {
    const messages = buildMessages(testCase);
    const charCount = messages.reduce((messageTotal, message) => messageTotal + message.content.length, 0);

    return total + Math.ceil(charCount / 2);
  }, 0);
  const completionTokens = manualLlmCases.length * 600;

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function summarizeUsage(records: ManualLlmRunRecord[]) {
  return records.reduce(
    (summary, record) => ({
      promptTokens: summary.promptTokens + (record.usage?.prompt_tokens ?? 0),
      completionTokens: summary.completionTokens + (record.usage?.completion_tokens ?? 0),
      totalTokens: summary.totalTokens + (record.usage?.total_tokens ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}

function createRunRecord(
  testCase: ManualLlmCase,
  result: ManualLlmRunResult | undefined,
  status: ManualLlmRunRecord["status"],
  error?: string,
): ManualLlmRunRecord {
  return {
    caseName: testCase.name,
    callSite: testCase.callSite,
    userQuestion: summarizeUserQuestion(testCase),
    answerPreview: previewText(result?.content ?? "未获得模型回答", 180),
    localResult: result ? describeLocalResult(testCase, result.content) : "请求失败，未进入本地断言。",
    status,
    error: error ? previewText(error, 260) : undefined,
    usage: result?.usage,
  };
}

function summarizeUserQuestion(testCase: ManualLlmCase) {
  const latestUserMessage = [...(testCase.messages ?? [])].reverse().find((message) => message.role === "user");

  return previewText(latestUserMessage?.content ?? testCase.inputSummary, 100);
}

function describeLocalResult(testCase: ManualLlmCase, content: string) {
  if (!testCase.expectation.outputSchema) {
    return "自然语言回复已检查禁止项和关键语义。";
  }

  try {
    const parsed = JSON.parse(stripJsonFence(content)) as Record<string, unknown>;
    const workoutIntent = typeof parsed.workoutIntent === "object" && parsed.workoutIntent !== null
      ? parsed.workoutIntent as Record<string, unknown>
      : undefined;
    const type = parsed.type ? `type=${String(parsed.type)}` : "";
    const intentType = parsed.intentType ?? workoutIntent?.intentType;
    const canTriggerAction =
      typeof parsed.canTriggerAction === "boolean" ? `canTriggerAction=${String(parsed.canTriggerAction)}` : "";
    const items = Array.isArray(parsed.items) ? `items=${parsed.items.length}` : "";
    const days = Array.isArray(parsed.days) ? `days=${parsed.days.length}` : "";
    const sections = Array.isArray(parsed.sections) ? `sections=${parsed.sections.length}` : "";

    return [type, intentType ? `intentType=${String(intentType)}` : "", canTriggerAction, items, days, sections]
      .filter(Boolean)
      .join("，") || "结构化输出已通过本地解析。";
  } catch {
    return "模型回答不是可解析 JSON，本地解析失败。";
  }
}

function stripJsonFence(content: string) {
  const normalized = content.trim();

  return normalized.startsWith("```")
    ? normalized.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : normalized;
}

async function writeAcceptanceReport(records: ManualLlmRunRecord[], usage: ReturnType<typeof summarizeUsage>) {
  const generatedAt = new Date().toISOString();
  const passed = records.filter((record) => record.status === "passed").length;
  const failed = records.filter((record) => record.status === "failed").length;
  const reportLines = [
    "# 手动 LLM 一致性测试验收报告",
    "",
    `生成时间：${generatedAt}`,
    "",
    "## 汇总",
    "",
    `- 用例总数：${records.length}`,
    `- 通过：${passed}`,
    `- 失败：${failed}`,
    `- prompt_tokens：${usage.promptTokens}`,
    `- completion_tokens：${usage.completionTokens}`,
    `- total_tokens：${usage.totalTokens}`,
    "",
    "## 样例验收结果",
    "",
    ...records.map(formatRunRecord),
    "",
  ];

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, reportLines.join("\n"), "utf8");
}

function formatRunRecord(record: ManualLlmRunRecord) {
  const usageText = record.usage?.total_tokens ? `，token=${record.usage.total_tokens}` : "";
  const errorText = record.error ? `，失败原因：${record.error}` : "";

  return `- ${record.status === "passed" ? "通过" : "失败"}：用户提问：${record.userQuestion}，大模型回答：${record.answerPreview}。本地意图解析结果：${record.localResult}${usageText}${errorText}`;
}

function previewText(content: string, maxLength: number) {
  const normalized = content.trim().replace(/\s+/g, " ");

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}
