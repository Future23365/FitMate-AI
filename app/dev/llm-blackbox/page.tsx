import { notFound } from "next/navigation";

import { LlmBlackboxReviewer } from "@/features/dev/llm-blackbox/llm-blackbox-reviewer";
import {
  isLlmBlackboxReviewerEnabled,
  readDevBasicChatFixture,
} from "@/lib/server/dev/llm-blackbox-fixture-store";

export default async function DevLlmBlackboxPage() {
  if (!isLlmBlackboxReviewerEnabled()) {
    notFound();
  }

  const fixture = await readDevBasicChatFixture();

  return <LlmBlackboxReviewer fixture={fixture} />;
}
