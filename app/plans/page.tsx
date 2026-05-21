import { AppSidebar } from "@/components/app/app-sidebar";
import { TrainingPlanPage } from "@/features/workouts/components/training-plan-page";

export default function PlansPage() {
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <AppSidebar activeLabel="训练计划" />
      <TrainingPlanPage />
    </div>
  );
}
