## Why

用户后续对话经常使用“这个”“刚才那个”“上次那套练胸的”等表达引用历史卡片。当前系统缺少受控引用解析层，容易让 LLM 凭语义猜测历史内容，导致定位错误、重复生成或误改对象。

## What Changes

- 新增 `ReferenceResolver`，将用户自然语言引用解析为具体 artifact、歧义候选或未找到结果。
- 当前会话近指引用优先使用 `recentArtifacts` 的展示顺序与时间顺序定位。
- 语义引用通过 artifact 结构化过滤和文本检索召回候选，再由服务端规则或受控 LLM 选择。
- 解析结果必须返回置信度、原因和候选摘要；歧义时必须让用户确认，不允许凭空构造历史卡片。
- 新增 `getArtifactPayload` 受控工具，用于在权限校验后读取已解析 artifact 的完整 payload。

## Capabilities

### New Capabilities
- `reference-resolver`: 定义聊天引用解析、歧义处理、artifact payload 读取和权限边界要求。

### Modified Capabilities

## Impact

- 依赖 `conversation-artifact` 提供 artifact 与索引事实源。
- 影响 `/api/chat` 的会话上下文构建、意图解析后处理和内部动作触发前的引用定位流程。
- 需要新增 reference resolution schema、解析服务和受控工具调用记录。
- 需要补充“这个”“上一个”“刚才那套”“之前练胸那套”等解析测试。
