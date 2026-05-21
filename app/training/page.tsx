import { Suspense } from "react";

import { WorkoutSessionPage } from "@/components/workouts/workout-session-page";

export default function TrainingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <WorkoutSessionPage />
    </Suspense>
  );
}
