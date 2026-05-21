import { notFound } from "next/navigation";

import { AiTraceViewer } from "@/components/dev/ai-trace-viewer";
import { isAiTraceEnabled } from "@/lib/server/dev/ai-trace-store";

export default function AiTracesPage() {
  if (!isAiTraceEnabled()) {
    notFound();
  }

  return <AiTraceViewer />;
}
