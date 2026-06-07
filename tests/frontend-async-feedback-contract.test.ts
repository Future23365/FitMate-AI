import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
}

describe("frontend async feedback integration contract", () => {
  it("routes command-style workout and settings operations through async toast feedback", () => {
    const trainingPlanPage = readProjectFile("features/workouts/components/training-plan-page.tsx");
    const actionComposerPage = readProjectFile("features/workouts/components/action-composer-page.tsx");
    const workoutPlanDraftCard = readProjectFile("features/workouts/components/workout-plan-draft-card.tsx");
    const workoutRoutineDraftCard = readProjectFile("features/workouts/components/workout-routine-draft-card.tsx");
    const localAuthProvider = readProjectFile("components/auth/local-auth-provider.tsx");

    expect(trainingPlanPage).toContain("runWithAsyncToast");
    expect(trainingPlanPage).toContain("training-calendar-schedule-workout");
    expect(trainingPlanPage).toContain("training-calendar-rest-day");
    expect(trainingPlanPage).toContain("training-calendar-update-status");
    expect(trainingPlanPage).toContain("training-calendar-remove-plan");
    expect(trainingPlanPage).not.toContain("const [toast, setToast]");

    expect(actionComposerPage).toContain("runComposerCommand");
    expect(actionComposerPage).toContain("action-composer-import-template");
    expect(actionComposerPage).toContain("action-composer-save-routine");
    expect(actionComposerPage).toContain("action-composer-duplicate-routine");
    expect(actionComposerPage).toContain("action-composer-delete-routine");
    expect(actionComposerPage).toContain("disabled={isComposerActionPending}");

    expect(workoutPlanDraftCard).toContain("workout-plan-draft-save");
    expect(workoutPlanDraftCard).not.toContain("alert(\"保存计划失败");
    expect(workoutRoutineDraftCard).toContain("workout-routine-draft-save");
    expect(localAuthProvider).toContain("正在重置本地用户...");
  });

  it("keeps visible read feedback delayed and background sync quiet", () => {
    const chatController = readProjectFile("features/chat/hooks/use-chat-controller.ts");
    const exerciseLibraryPage = readProjectFile("features/exercises/components/exercise-library-page.tsx");
    const exerciseRecommendationCard = readProjectFile("features/exercises/components/exercise-recommendation-card.tsx");
    const chatHistory = readProjectFile("features/chat/lib/chat-history.ts");
    const aiTraceViewer = readProjectFile("components/dev/ai-trace-viewer.tsx");

    expect(chatController).toContain("chat-send-initial-response");
    expect(chatController).toContain("getChatInitialResponseToastUpdate");
    expect(exerciseLibraryPage).toContain("exercise-library-list-loading");
    expect(exerciseLibraryPage).toContain("delayMs: 650");
    expect(exerciseLibraryPage).toContain("exercise-library-detail-loading");
    expect(exerciseLibraryPage).toContain("userSelectedExerciseRef");
    expect(exerciseRecommendationCard).toContain("exercise-recommendation-detail-loading");
    expect(exerciseRecommendationCard).toContain("delayMs: 500");
    expect(chatHistory).not.toContain("runWithAsyncToast");
    expect(chatHistory).not.toContain("createAsyncToastLifecycle");
    expect(aiTraceViewer).toContain("ai-trace-clear");
    expect(aiTraceViewer).toContain("ai-trace-save-log");
    expect(aiTraceViewer).not.toContain("autoRefreshTraces = useCallback(async");
  });
});
