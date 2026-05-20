import { AppSidebar } from "@/components/app/app-sidebar";
import { ExerciseLibraryPage } from "@/components/exercises/exercise-library-page";

export default function ExercisesPage() {
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <AppSidebar activeLabel="动作库" />
      <ExerciseLibraryPage />
    </div>
  );
}
