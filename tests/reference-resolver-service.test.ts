import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReferenceArtifactCandidate } from "@/lib/shared/reference-resolver/schema";

const artifactSearchMocks = vi.hoisted(() => ({
  searchArtifactsForCurrentUser: vi.fn(),
}));

vi.mock("@/lib/server/conversation-artifacts/artifact-service", () => artifactSearchMocks);

const referenceResolver = await import("@/lib/server/reference-resolver/reference-resolver-service");

describe("reference resolver service", () => {
  beforeEach(() => {
    artifactSearchMocks.searchArtifactsForCurrentUser.mockReset();
  });

  it("resolves near references from current recent artifacts", async () => {
    const result = await referenceResolver.resolveReference({
      latestUserMessage: "刚才那套三周都练",
      sessionId: "chat-1",
      recentArtifacts: [createCandidate({ artifactId: "artifact-routine", kind: "routine" })],
      intentType: "workout_plan",
    });

    expect(result).toMatchObject({
      status: "resolved",
      artifactId: "artifact-routine",
      confidence: "high",
    });
    expect(artifactSearchMocks.searchArtifactsForCurrentUser).not.toHaveBeenCalled();
  });

  it("returns ambiguous when a bare near reference can point to multiple recent artifacts", async () => {
    const result = await referenceResolver.resolveReference({
      latestUserMessage: "这个帮我调整一下",
      sessionId: "chat-1",
      recentArtifacts: [
        createCandidate({ artifactId: "artifact-routine", kind: "routine", title: "单次训练" }),
        createCandidate({ artifactId: "artifact-plan", kind: "plan", title: "长期计划" }),
      ],
      intentType: "routine",
    });

    expect(result).toMatchObject({
      status: "ambiguous",
      candidates: [
        expect.objectContaining({ artifactId: "artifact-routine" }),
        expect.objectContaining({ artifactId: "artifact-plan" }),
      ],
    });
    expect(result.status === "ambiguous" ? result.clarificationQuestion : "").toContain("请确认");
  });

  it("resolves semantic references through bounded artifact search", async () => {
    artifactSearchMocks.searchArtifactsForCurrentUser.mockResolvedValue([
      createCandidate({ artifactId: "artifact-chest", kind: "routine", title: "胸肌单次训练" }),
    ]);

    const result = await referenceResolver.resolveReference({
      latestUserMessage: "按之前那套练胸的改成一周四练",
      sessionId: "chat-1",
      recentArtifacts: [],
      intentType: "routine",
    });

    expect(artifactSearchMocks.searchArtifactsForCurrentUser).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "chat-1",
      sessionScope: "current_user",
      kind: "routine",
      query: expect.stringContaining("练胸"),
      limit: 6,
    }));
    expect(result).toMatchObject({
      status: "resolved",
      artifactId: "artifact-chest",
      confidence: "medium",
    });
  });

  it("resolves long term plan semantic references by kind", async () => {
    artifactSearchMocks.searchArtifactsForCurrentUser.mockResolvedValue([
      createCandidate({ artifactId: "artifact-plan", kind: "plan", title: "四周长期计划" }),
    ]);

    const result = await referenceResolver.resolveReference({
      latestUserMessage: "上次长期计划继续用",
      sessionId: "chat-1",
      recentArtifacts: [],
      intentType: "workout_plan",
    });

    expect(artifactSearchMocks.searchArtifactsForCurrentUser).toHaveBeenCalledWith(expect.objectContaining({
      kind: "plan",
    }));
    expect(result).toMatchObject({
      status: "resolved",
      artifactId: "artifact-plan",
    });
  });

  it("rejects resolved ids outside the candidate set", () => {
    const result = referenceResolver.resolveCandidateSelection(
      "artifact-outside",
      [createCandidate({ artifactId: "artifact-a" }), createCandidate({ artifactId: "artifact-b" })],
    );

    expect(result).toMatchObject({
      status: "ambiguous",
      reason: expect.stringContaining("候选集合"),
    });
  });
});

function createCandidate(overrides: Partial<ReferenceArtifactCandidate> = {}): ReferenceArtifactCandidate {
  return {
    artifactId: overrides.artifactId ?? "artifact-1",
    kind: overrides.kind ?? "routine",
    title: overrides.title ?? "居家胸肌循环",
    summary: overrides.summary ?? "包含热身、主训练和拉伸。",
    exerciseIds: overrides.exerciseIds ?? ["push-up"],
    goals: overrides.goals ?? ["胸肌训练"],
    muscles: overrides.muscles ?? ["胸部"],
    equipment: overrides.equipment ?? ["自重"],
    sessionMinutes: overrides.sessionMinutes ?? 30,
    weeklyFrequency: overrides.weeklyFrequency,
    trainingDayCount: overrides.trainingDayCount,
    updatedAt: overrides.updatedAt ?? "2026-05-30T08:00:00.000Z",
  };
}
