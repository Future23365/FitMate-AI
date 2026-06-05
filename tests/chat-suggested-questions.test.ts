import { describe, expect, it, vi } from "vitest";

import { sendSuggestedQuestionMessage } from "@/features/chat/lib/suggested-questions";

describe("chat suggested questions", () => {
  it("sends the clicked suggested question text as the next user message", () => {
    const sendMessage = vi.fn();

    sendSuggestedQuestionMessage(sendMessage, "我想按这个方向继续安排");

    expect(sendMessage).toHaveBeenCalledWith("我想按这个方向继续安排");
  });
});
