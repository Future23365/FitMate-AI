/** aiContextMessageContentMaxLength 限制单条真实聊天消息进入模型上下文前的最大长度，准确度优先阶段保留更长用户输入。 */
export const aiContextMessageContentMaxLength = 20_000;

/** conversationSummaryMaxLength 限制确定性会话摘要长度，避免历史摘要比真实消息更早丢事实。 */
export const conversationSummaryMaxLength = 10_000;

/** aiContextMessageHistoryMaxCount 限制单次请求携带的历史消息数量，保留确定性上限但放宽长对话窗口。 */
export const aiContextMessageHistoryMaxCount = 500;

/** knownFactListMaxCount 限制轻量结构化上下文中的列表事实数量，避免偏好和限制被旧 30 项边界截断。 */
export const knownFactListMaxCount = 100;

/** knownFactLatestUserMessagePreviewMaxLength 限制结构化上下文中的最近用户输入预览长度，不影响 rawMessages 原文进入模型。 */
export const knownFactLatestUserMessagePreviewMaxLength = 2_000;

/** conversationContextSummaryMaxLength 限制结构化上下文 summary 长度，供历史 hydration 和确定性摘要使用。 */
export const conversationContextSummaryMaxLength = 10_000;
