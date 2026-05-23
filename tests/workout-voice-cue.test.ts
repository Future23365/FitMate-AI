import {
  buildFirstWorkoutActionCue,
  buildPreparationCountdownCue,
  buildRepetitionCountCue,
  buildWorkoutActionPreparationCue,
  buildWorkoutOverviewCue,
  buildWorkoutStartupCues,
  buildWorkoutStepVoiceCue,
} from "@/lib/shared/workouts/voice-cues";
import type { WorkoutItem, WorkoutTimelineStep } from "@/lib/shared/workouts/composition";

function createTestItem(overrides: Partial<WorkoutItem> = {}): WorkoutItem {
  return {
    id: overrides.id ?? "squat-1",
    exerciseId: overrides.exerciseId ?? "squat",
    nameZh: overrides.nameZh ?? "深蹲",
    nameEn: overrides.nameEn ?? "Squat",
    categoryZh: overrides.categoryZh ?? "力量",
    equipmentZh: overrides.equipmentZh ?? "自重",
    musclesZh: overrides.musclesZh ?? ["股四头肌"],
    instructionsZh: overrides.instructionsZh ?? ["保持核心收紧。"],
    imageUrl: overrides.imageUrl ?? "/images/exercise-placeholder.svg",
    mode: overrides.mode ?? "duration",
    target: overrides.target ?? 45,
    sets: overrides.sets ?? 2,
    setRestSeconds: overrides.setRestSeconds ?? 30,
    transitionRestSeconds: overrides.transitionRestSeconds ?? 20,
    section: overrides.section ?? "training",
  };
}

/**
 * 训练语音提示文案应保持纯函数，方便在浏览器音频不可用时仍能验证业务语义。
 */
export function runWorkoutVoiceCueTests() {
  const timedItem = createTestItem();
  const repsItem = createTestItem({
    id: "push-up-1",
    exerciseId: "push-up",
    mode: "reps",
    nameZh: "俯卧撑",
    target: 12,
  });

  const durationStep: WorkoutTimelineStep = {
    id: "duration-step",
    type: "exercise",
    item: timedItem,
    itemIndex: 0,
    setIndex: 2,
    totalSets: 3,
    durationSeconds: 45,
  };
  const repsStep: WorkoutTimelineStep = {
    id: "reps-step",
    type: "exercise",
    item: repsItem,
    itemIndex: 1,
    setIndex: 1,
    totalSets: 2,
    durationSeconds: 24,
  };
  const restStep: WorkoutTimelineStep = {
    id: "rest-step",
    type: "rest",
    reason: "between_sets",
    label: "组间休息",
    durationSeconds: 30,
    afterItem: repsItem,
    nextItem: repsItem,
  };
  const loopRestStep: WorkoutTimelineStep = {
    id: "loop-rest-step",
    type: "rest",
    reason: "between_loops",
    label: "循环间隙",
    durationSeconds: 90,
    afterItem: repsItem,
    nextItem: timedItem,
  };

  console.assert(
    buildWorkoutStepVoiceCue(durationStep) === "开始 深蹲，第 2 组，共 3 组，目标 45 秒。",
    "计时步骤应播报动作名、组序号和秒数目标",
  );
  console.assert(
    buildWorkoutStepVoiceCue(repsStep) === "开始 俯卧撑，第 1 组，共 2 组，目标 12 次。",
    "按次步骤应播报动作名、组序号和次数目标",
  );
  console.assert(
    buildWorkoutStepVoiceCue(restStep) === "组间休息 30 秒，下一组动作 俯卧撑。",
    "组间休息应播报休息时长和下一组动作",
  );
  console.assert(
    buildWorkoutStepVoiceCue(loopRestStep) === "循环间隙 90 秒，下一组动作 深蹲。",
    "循环间隙应播报下一组动作",
  );
  console.assert(buildRepetitionCountCue(3) === "3", "按次计数应播报当前达到的数字");
  console.assert(buildFirstWorkoutActionCue(timedItem) === "第一组动作，深蹲，45 秒。", "第一个动作提示不符");
  console.assert(buildPreparationCountdownCue(2) === "2", "准备倒计时提示不符");
  console.assert(buildPreparationCountdownCue(1) === "1，开始", "准备倒计时最后一秒应播报开始");
  console.assert(
    buildWorkoutActionPreparationCue(durationStep, true) === "第一组动作，深蹲，45 秒。",
    "首个动作准备提示不符",
  );
  console.assert(
    buildWorkoutActionPreparationCue(repsStep, false) === "下一组，俯卧撑，12 个。",
    "后续动作准备提示不符",
  );

  const longOverview = buildWorkoutOverviewCue(
    [
      createTestItem({ id: "1", nameZh: "开合跳" }),
      createTestItem({ id: "2", nameZh: "深蹲" }),
      createTestItem({ id: "3", nameZh: "俯卧撑" }),
      createTestItem({ id: "4", nameZh: "登山跑" }),
      createTestItem({ id: "5", nameZh: "平板支撑" }),
      createTestItem({ id: "6", nameZh: "拉伸" }),
    ],
    3,
  );
  console.assert(
    longOverview === "本次训练 6 个动作：开合跳、深蹲、俯卧撑等。准备开始。",
    "长训练概览应限制动作列表并保留总数量",
  );

  const startupCues = buildWorkoutStartupCues([timedItem, repsItem]);
  console.assert(startupCues[0] === "本次训练 2 个动作：深蹲、俯卧撑。准备开始。", "启动概览不符");
  console.assert(startupCues[1] === "第一组动作，深蹲，45 秒。", "启动第一个动作文案不符");
  console.assert(startupCues.slice(2).join("，") === "3，2，1，开始", "启动倒计时文案不符");
}
