import { describe, expect, test } from "vitest";

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
};

const model = "deepseek-v4-flash";
const configuredApiKey = process.env.DEEPSEEK_API_KEY?.trim();
const describeIfConfigured = configuredApiKey ? describe : describe.skip;

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
  test.each(manualLlmCases)("$callSite - $name", async (testCase) => {
    const output = await runManualLlmCase(testCase);

    expect(output.trim().length).toBeGreaterThan(0);
    assertCaseOutput(testCase, output);
  });
});

async function runManualLlmCase(testCase: ManualLlmCase) {
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
) {
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

  return content;
}
