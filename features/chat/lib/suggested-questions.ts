"use client";

/** sendSuggestedQuestionMessage 保证建议提问按钮只发送原文本，不推断业务 action。 */
export function sendSuggestedQuestionMessage(
  sendMessage: (text?: string) => unknown,
  suggestedQuestion: string,
) {
  return sendMessage(suggestedQuestion);
}
