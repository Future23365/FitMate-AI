import { AppSidebar } from "@/components/app/app-sidebar";
import { ActionComposerPage } from "@/components/workouts/action-composer-page";

export default function ComposerPage() {
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <AppSidebar activeLabel="动作编排" />
      <ActionComposerPage />
    </div>
  );
}
