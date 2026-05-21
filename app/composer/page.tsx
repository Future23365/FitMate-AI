import { AppSidebar } from "@/components/app/app-sidebar";
import { ActionComposerPage } from "@/features/workouts/components/action-composer-page";

export default function ComposerPage() {
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <AppSidebar activeLabel="动作编排" />
      <ActionComposerPage />
    </div>
  );
}
