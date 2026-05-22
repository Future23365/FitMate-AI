import { z } from "zod";

import {
  workoutExperienceSchema,
  workoutPlanIntentSchema,
  type WorkoutPlanIntent,
} from "@/lib/shared/workout-plans/draft-schema";

export const aiContextChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

export const fitnessConversationKnownFactsSchema = z.object({
  goal: z.string().trim().min(1).max(120).optional(),
  experience: workoutExperienceSchema.optional(),
  sessionMinutes: z.number().int().min(1).max(240).optional(),
  weeklyFrequency: z.number().int().min(1).max(7).optional(),
  equipment: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  injuryLimitations: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  preferences: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  avoidances: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  latestUserMessage: z.string().trim().min(1).max(400).optional(),
});

export const fitnessConversationContextSchema = z.object({
  summary: z.string().trim().max(2000).default(""),
  currentIntent: workoutPlanIntentSchema.optional(),
  knownFacts: fitnessConversationKnownFactsSchema.default({
    equipment: [],
    injuryLimitations: [],
    preferences: [],
    avoidances: [],
  }),
  unresolvedQuestions: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
});

export type AiContextChatMessage = z.infer<typeof aiContextChatMessageSchema>;
export type FitnessConversationKnownFacts = z.infer<typeof fitnessConversationKnownFactsSchema>;
export type FitnessConversationContext = z.infer<typeof fitnessConversationContextSchema>;

const durableFactPattern =
  /目标|减脂|增肌|塑形|力量|心肺|体能|胸|背|腿|肩|核心|臀|手臂|分钟|min|小时|每周|一周|次|自重|徒手|哑铃|杠铃|壶铃|弹力带|瑜伽垫|健身房|居家|家里|新手|初学|进阶|高级|疼|痛|伤|不适|避免|不要|不想/;

const triggerPattern =
  /```json\s*(\{[\s\S]*?"type"\s*:\s*"(?:workout_plan_trigger|workout_routine_trigger|exercise_recommendation_trigger)"[\s\S]*?\})\s*```/g;

export function normalizeAiContextMessages(messages: unknown[]): AiContextChatMessage[] {
  const normalizedMessages: AiContextChatMessage[] = [];

  for (const message of messages) {
    const parsedMessage = aiContextChatMessageSchema.safeParse(message);

    if (parsedMessage.success) {
      normalizedMessages.push(parsedMessage.data);
    }
  }

  return normalizedMessages;
}

export function buildFitnessConversationContext(
  rawMessages: Array<Pick<AiContextChatMessage, "role" | "content">>,
): FitnessConversationContext {
  const messages = normalizeAiContextMessages(rawMessages);
  const arrayFacts = {
    equipment: new Set<string>(),
    injuryLimitations: new Set<string>(),
    preferences: new Set<string>(),
    avoidances: new Set<string>(),
  };
  const knownFacts: Partial<FitnessConversationKnownFacts> = {};
  let currentIntent: WorkoutPlanIntent | undefined;

  for (const message of messages) {
    if (message.role === "assistant") {
      const intent = extractLatestTriggerIntent(message.content);

      if (intent) {
        currentIntent = intent;
        mergeIntentIntoFacts(intent, knownFacts, arrayFacts);
      }

      continue;
    }

    knownFacts.latestUserMessage = previewText(message.content, 400);
    mergeUserMessageFacts(message.content, knownFacts, arrayFacts);
  }

  const finalKnownFacts = fitnessConversationKnownFactsSchema.parse({
    ...knownFacts,
    equipment: [...arrayFacts.equipment],
    injuryLimitations: [...arrayFacts.injuryLimitations],
    preferences: [...arrayFacts.preferences],
    avoidances: [...arrayFacts.avoidances],
  });

  const normalizedIntent = mergeKnownFactsIntoIntent(currentIntent, finalKnownFacts);
  const context = fitnessConversationContextSchema.parse({
    summary: buildContextSummary(finalKnownFacts, normalizedIntent),
    currentIntent: normalizedIntent,
    knownFacts: finalKnownFacts,
    unresolvedQuestions: [],
  });

  return context;
}

export function selectMessagesForAiContext(
  rawMessages: Array<Pick<AiContextChatMessage, "role" | "content">>,
  options: { maxMessages?: number; recentWindow?: number } = {},
): AiContextChatMessage[] {
  const maxMessages = options.maxMessages ?? 16;
  const recentWindow = options.recentWindow ?? 8;
  const messages = normalizeAiContextMessages(rawMessages);

  if (messages.length <= maxMessages) {
    return messages;
  }

  const selected = new Map<number, AiContextChatMessage>();
  const firstUserIndex = messages.findIndex((message) => message.role === "user");

  if (firstUserIndex >= 0) {
    selected.set(firstUserIndex, messages[firstUserIndex]);
  }

  const recentStart = Math.max(0, messages.length - recentWindow);
  for (let index = recentStart; index < messages.length; index += 1) {
    selected.set(index, messages[index]);
  }

  for (let index = messages.length - 1; index >= 0 && selected.size < maxMessages; index -= 1) {
    if (selected.has(index) || index >= recentStart) {
      continue;
    }

    const message = messages[index];
    if (durableFactPattern.test(message.content) || extractLatestTriggerIntent(message.content)) {
      selected.set(index, message);
    }
  }

  return [...selected.entries()]
    .sort(([left], [right]) => left - right)
    .slice(-maxMessages)
    .map(([, message]) => message);
}

export function formatFitnessConversationContextForPrompt(
  context: FitnessConversationContext | undefined,
) {
  if (!context) {
    return "";
  }

  return [
    "fitnessConversationContext:",
    JSON.stringify(
      {
        summary: context.summary,
        currentIntent: context.currentIntent,
        knownFacts: context.knownFacts,
        unresolvedQuestions: context.unresolvedQuestions,
      },
      null,
      2,
    ),
  ].join("\n");
}

function extractLatestTriggerIntent(content: string) {
  let matchedIntent: WorkoutPlanIntent | undefined;

  for (const match of content.matchAll(triggerPattern)) {
    try {
      const parsed = JSON.parse(match[1]) as { intent?: unknown };
      const parsedIntent = workoutPlanIntentSchema.safeParse(parsed.intent);

      if (parsedIntent.success) {
        matchedIntent = parsedIntent.data;
      }
    } catch {
      continue;
    }
  }

  return matchedIntent;
}

function mergeIntentIntoFacts(
  intent: WorkoutPlanIntent,
  knownFacts: Partial<FitnessConversationKnownFacts>,
  arrayFacts: {
    equipment: Set<string>;
    injuryLimitations: Set<string>;
    preferences: Set<string>;
    avoidances: Set<string>;
  },
) {
  knownFacts.goal = intent.goal;
  knownFacts.experience = intent.experience;
  knownFacts.sessionMinutes = intent.sessionMinutes;
  knownFacts.weeklyFrequency = intent.weeklyFrequency;
  intent.equipment.forEach((item) => arrayFacts.equipment.add(item));
  intent.injuryLimitations.forEach((item) => arrayFacts.injuryLimitations.add(item));
  intent.preferences.forEach((item) => arrayFacts.preferences.add(item));
  intent.avoidances.forEach((item) => arrayFacts.avoidances.add(item));
}

function mergeUserMessageFacts(
  content: string,
  knownFacts: Partial<FitnessConversationKnownFacts>,
  arrayFacts: {
    equipment: Set<string>;
    injuryLimitations: Set<string>;
    preferences: Set<string>;
    avoidances: Set<string>;
  },
) {
  const minutes = extractSessionMinutes(content);
  const weeklyFrequency = extractWeeklyFrequency(content);
  const experience = extractExperience(content);
  const goal = extractGoal(content);

  if (minutes) {
    knownFacts.sessionMinutes = minutes;
  }

  if (weeklyFrequency) {
    knownFacts.weeklyFrequency = weeklyFrequency;
  }

  if (experience) {
    knownFacts.experience = experience;
  }

  if (goal) {
    knownFacts.goal = goal;
  }

  extractEquipment(content).forEach((item) => arrayFacts.equipment.add(item));
  extractPreferences(content).forEach((item) => arrayFacts.preferences.add(item));
  extractInjuryLimitations(content).forEach((item) => arrayFacts.injuryLimitations.add(item));
  extractAvoidances(content).forEach((item) => arrayFacts.avoidances.add(item));
}

function mergeKnownFactsIntoIntent(
  intent: WorkoutPlanIntent | undefined,
  knownFacts: FitnessConversationKnownFacts,
) {
  if (!intent) {
    return undefined;
  }

  return workoutPlanIntentSchema.parse({
    ...intent,
    goal: knownFacts.goal ?? intent.goal,
    experience: knownFacts.experience ?? intent.experience,
    sessionMinutes: knownFacts.sessionMinutes ?? intent.sessionMinutes,
    weeklyFrequency: knownFacts.weeklyFrequency ?? intent.weeklyFrequency,
    equipment: knownFacts.equipment.length > 0 ? knownFacts.equipment : intent.equipment,
    injuryLimitations:
      knownFacts.injuryLimitations.length > 0
        ? knownFacts.injuryLimitations
        : intent.injuryLimitations,
    preferences: knownFacts.preferences.length > 0 ? knownFacts.preferences : intent.preferences,
    avoidances: knownFacts.avoidances.length > 0 ? knownFacts.avoidances : intent.avoidances,
  });
}

function buildContextSummary(
  knownFacts: FitnessConversationKnownFacts,
  currentIntent: WorkoutPlanIntent | undefined,
) {
  const parts = [
    knownFacts.goal ? `目标：${knownFacts.goal}` : "",
    knownFacts.experience ? `经验：${knownFacts.experience}` : "",
    knownFacts.sessionMinutes ? `单次时长：${knownFacts.sessionMinutes}分钟` : "",
    knownFacts.weeklyFrequency ? `频率：每周${knownFacts.weeklyFrequency}次` : "",
    knownFacts.equipment.length > 0 ? `器械：${knownFacts.equipment.join("、")}` : "",
    knownFacts.preferences.length > 0 ? `偏好：${knownFacts.preferences.join("、")}` : "",
    knownFacts.injuryLimitations.length > 0
      ? `限制：${knownFacts.injuryLimitations.join("、")}`
      : "",
    knownFacts.avoidances.length > 0 ? `避免：${knownFacts.avoidances.join("、")}` : "",
    currentIntent ? `当前意图：${currentIntent.intentType}` : "",
    knownFacts.latestUserMessage ? `最近用户输入：${knownFacts.latestUserMessage}` : "",
  ].filter(Boolean);

  return parts.join("；").slice(0, 2000);
}

function extractSessionMinutes(content: string) {
  const match = content.match(/(\d{1,3})\s*(?:分钟|min)/i);
  const minutes = match ? Number(match[1]) : undefined;

  return minutes && minutes >= 1 && minutes <= 240 ? minutes : undefined;
}

function extractWeeklyFrequency(content: string) {
  const match =
    content.match(/(?:每周|一周)\s*(\d)\s*次/) ??
    content.match(/(\d)\s*(?:次\/周|次每周|天每周)/);
  const frequency = match ? Number(match[1]) : undefined;

  return frequency && frequency >= 1 && frequency <= 7 ? frequency : undefined;
}

function extractExperience(content: string) {
  if (/新手|初学|零基础|刚开始/.test(content)) {
    return "beginner" as const;
  }

  if (/进阶|有经验|练过|中级/.test(content)) {
    return "intermediate" as const;
  }

  if (/高级|资深|老手|专业/.test(content)) {
    return "advanced" as const;
  }

  return undefined;
}

function extractGoal(content: string) {
  if (
    /目标|想|练|减脂|增肌|塑形|力量|心肺|体能|胸|背|腿|肩|核心|臀|手臂/.test(content) &&
    !/换成|改成|不要|避免/.test(content)
  ) {
    return previewText(content, 80);
  }

  return undefined;
}

function extractEquipment(content: string) {
  const equipmentMap: Array<[RegExp, string]> = [
    [/自重|徒手|无器械/, "自重"],
    [/哑铃/, "哑铃"],
    [/杠铃/, "杠铃"],
    [/壶铃/, "壶铃"],
    [/弹力带/, "弹力带"],
    [/瑜伽垫/, "瑜伽垫"],
    [/跑步机/, "跑步机"],
    [/龙门架|绳索/, "龙门架"],
    [/固定器械|器械区/, "固定器械"],
  ];

  return equipmentMap.filter(([pattern]) => pattern.test(content)).map(([, value]) => value);
}

function extractPreferences(content: string) {
  const preferences: string[] = [];

  if (/居家|家里|在家/.test(content)) {
    preferences.push("居家训练");
  }

  if (/健身房/.test(content)) {
    preferences.push("健身房训练");
  }

  if (/低强度|轻松|温和/.test(content)) {
    preferences.push("低强度");
  }

  if (/高强度|冲刺|燃脂/.test(content)) {
    preferences.push("高强度");
  }

  return preferences;
}

function extractInjuryLimitations(content: string) {
  return /(膝盖|腰|肩|手腕|脚踝|疼|痛|伤|不适)/.test(content)
    ? [previewText(content, 120)]
    : [];
}

function extractAvoidances(content: string) {
  return /不要|避免|不想|别/.test(content) ? [previewText(content, 120)] : [];
}

function previewText(content: string, maxLength: number) {
  const normalized = content.trim().replace(/\s+/g, " ");

  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}
