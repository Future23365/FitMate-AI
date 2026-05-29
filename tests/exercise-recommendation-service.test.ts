import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExercise, createWorkoutPlanIntent } from "./fixtures/domain";

const serverRequestMocks = vi.hoisted(() => ({
  serverRequest: vi.fn(),
}));

vi.mock("@/lib/server/http/server-request", () => serverRequestMocks);

const { generateAiExerciseRecommendations } = await import(
  "@/lib/server/exercise-recommendations/ai-exercise-recommendation-service"
);

describe("AI exercise recommendation generation", () => {
  beforeEach(() => {
    serverRequestMocks.serverRequest.mockReset();
  });

  it("sends only summary context, latest user message, intent, and candidate constraints to the model", async () => {
    const exercise = createExercise({ id: "push-up", nameZh: "俯卧撑" });
    serverRequestMocks.serverRequest.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "居家胸肌动作",
                  goal: "胸肌训练",
                  summary: "适合新手居家练胸。",
                  items: [{ exerciseId: "push-up", reasons: ["自重可做"] }],
                  safetyNotes: ["动作过程中保持核心收紧。"],
                }),
              },
            },
          ],
        }),
      ),
    );

    const result = await generateAiExerciseRecommendations({
      apiKey: "test-key",
      intent: createWorkoutPlanIntent({ goal: "胸肌训练" }),
      latestUserMessage: "推荐几个胸肌动作",
      conversationSummary: "用户是新手，想在家自重练胸。",
      candidates: [
        {
          exercise,
          source: "primary",
          score: 10,
          reasons: ["目标匹配"],
        },
      ],
      safetyNotes: [],
      excludeExerciseIds: [],
    });

    expect(result).toMatchObject({
      ok: true,
      card: {
        title: "居家胸肌动作",
        items: [expect.objectContaining({ exerciseId: "push-up" })],
      },
    });

    const requestBody = serverRequestMocks.serverRequest.mock.calls[0][1].body;
    const modelPayload = JSON.parse(requestBody.messages[1].content);
    expect(requestBody.messages).toHaveLength(2);
    expect(modelPayload).toMatchObject({
      conversationSummary: "用户是新手，想在家自重练胸。",
      latestUserMessage: "推荐几个胸肌动作",
      intent: expect.objectContaining({ goal: "胸肌训练" }),
    });
    expect(modelPayload).not.toHaveProperty("recentMessages");
    expect(modelPayload).not.toHaveProperty("conversationContext");
  });
});
