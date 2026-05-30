import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkoutPlanDraftCard } from "@/features/workouts/components/workout-plan-draft-card";

import { createExercise, createWorkoutPlanDraft } from "./fixtures/domain";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => createElement("img", { alt, src }),
}));

describe("WorkoutPlanDraftCard", () => {
  it("renders cycle summary, sectioned training day, preview entry, and cycle import options", () => {
    const html = renderToStaticMarkup(
      createElement(WorkoutPlanDraftCard, {
        draft: createWorkoutPlanDraft({
          title: "三日周期计划",
          days: [
            createWorkoutPlanDraft().days[0],
            {
              title: "Day 2 恢复",
              focus: "低强度恢复",
              cycleDayIndex: 2,
              dayType: "rest",
              isRestDay: true,
              estimatedMinutes: 0,
              recoveryNotes: ["散步 20 分钟并保证睡眠。"],
              sections: [],
              safetyNotes: [],
            },
          ],
        }),
        initialExercises: [
          createExercise({ id: "warmup", nameZh: "肩部动态热身" }),
          createExercise({ id: "push-up", nameZh: "俯卧撑" }),
          createExercise({ id: "stretch", nameZh: "胸肩拉伸" }),
        ],
      }),
    );

    expect(html).toContain("2 天周期");
    expect(html).toContain("训练 1 天 · 休息 1 天");
    expect(html).toContain("热身");
    expect(html).toContain("训练");
    expect(html).toContain("拉伸");
    expect(html).toContain("查看俯卧撑动作详情");
    expect(html).toContain("小提示");
    expect(html).not.toContain("防伤提示");
    expect(html).toContain("导入本周期");
    expect(html).toContain("重复 2 个周期");
    expect(html).toContain("重复 4 个周期");
  });

  it("renders rest day recovery notes without an empty exercise list", () => {
    const html = renderToStaticMarkup(
      createElement(WorkoutPlanDraftCard, {
        draft: createWorkoutPlanDraft({
          days: [
            {
              title: "Day 1 恢复",
              focus: "低强度恢复",
              cycleDayIndex: 1,
              dayType: "rest",
              isRestDay: true,
              estimatedMinutes: 0,
              recoveryNotes: ["散步 20 分钟并保证睡眠。"],
              sections: [],
              safetyNotes: [],
            },
          ],
        }),
        initialExercises: [],
      }),
    );

    expect(html).toContain("散步 20 分钟并保证睡眠。");
    expect(html).not.toContain("动作列表");
  });
});
