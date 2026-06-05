## Why

当前 Agent repair feedback 同时混合了两类信息：

1. 可以由 schema、discriminator、字段路径和 validator issue 机械确定的结构错误，例如缺字段、未知字段、类型不匹配、枚举值非法、union variant 不匹配。
2. runtime 临时拼出来的修复文案或业务下一步建议，例如把某个旧字段解释成另一个字段、要求调用某个具体 tool、把业务 validator 的诊断包装成自然语言恢复方向。

第二类信息会把服务端推到不该承担的语义理解位置。服务端没有模型的上下文理解能力，也不应该根据 `toolName`、用户原话、字段组合或业务 case 生成“这次应该怎么改”的自然语言说明。正确边界应是：服务端只返回确定性错误事实；模型基于全局 prompt、tool manifest、schema description、examples 和当前上下文理解这些事实并重新输出合法 action。

本 change 目标是把 repair feedback 设施改成通用、schema 驱动、tool 无关的错误投影机制。这样新增 tool 或调整字段结构时，只要 schema / manifest 合同正确，repair feedback 就能自动表达结构错误，不需要继续为每个 tool 或每组旧字段增加专门 repair 文案。

## What Changes

- 建立通用 `schema error projector`：将 `AgentAction`、tool input、terminal visible output envelope 和 domain validator 的确定性错误统一投影成模型可见结构化 facts。
- repair feedback MUST 表达可机械确定的信息：`target`、`schemaId` / `toolName` / `outputType`、`variant`、`discriminator`、`errors[]`、`path`、`code`、`expected`、`actual`、`requiredFields`、`allowedFields`、`allowedValues`、安全上下文引用。
- repair feedback MUST NOT 拼固定自然语言修复文案，例如“ask_user 必须使用 content 承载问题”或“请调用某个具体 tool”。这类语义解释应放在稳定的 prompt / manifest / schema description / examples 中，而不是 runtime 根据错误临时生成。
- repair feedback MUST NOT 为旧字段、业务 tool、用户 phrasing、字段组合或 trace case 写特判。旧字段问题只能通过 schema 自然表现为 `unknown_field`、`required_field_missing`、`invalid_union_variant` 等结构事实。
- 业务 validator MAY 返回确定性 domain facts，例如 `section_not_allowed`、`allowedSections`、`actualSection`、`path`、`resourceRef`；但 MUST NOT 返回模型可见 `repair`、`recoveryDirections`、`recoverableActions` 或固定下一步 tool 调用建议。
- 全局 Agent prompt / model input MUST 说明模型如何读取通用 repair facts：优先看 `errors[].path`、`code`、`expected`、`allowedFields`、`requiredFields`，然后按当前可见 schema / manifest 重新输出合法 action。
- trace / replay / tests MUST 能证明新增 tool 只要注册 schema，就能自动得到字段级 repair facts，不需要修改 repair feedback 逻辑。
- 不新增服务端关键词、正则、同义词表、短句模板、自然语言语义分流或业务 case fallback；模型仍负责理解用户意图，服务端只校验结构、权限、资源和事实。

## Capabilities

### New Capabilities
- 无。

### Modified Capabilities
- `agent-contract-repair-loop`: repair feedback 从“结构化反馈 + 局部自然语言建议”收敛为通用 schema/domain facts 投影，并禁止 runtime 生成业务修复文案。
- `agent-tool-contract-kernel`: tool input schema failure 的模型可见错误必须由通用 schema projector 派生，不再为具体 tool input 字段写 repair 分支。
- `agent-llm-prompt-configuration`: 默认 Agent prompt 必须解释通用 repair facts 的读取方式，并把字段语义放在稳定 schema / manifest 说明中。
- `visible-training-proposal-validation`: terminal visible output 的业务 validator 只能返回确定性 domain facts，不输出固定恢复文案或下一步 tool 建议。
- `manual-llm-consistency-tests`: 手动 LLM / trace 回归需要覆盖通用 repair facts 被模型理解并重新输出合法 action 的链路。

## Impact

- 影响模型可见 repair / observation 合同：
  - `lib/server/agent-core/action-validator.ts`
  - `lib/server/agent-core/runtime.ts`
  - `lib/server/agent-core/contracts.ts`
  - `lib/server/agent-core/response-renderer.ts`
- 影响 tool schema / validator 错误投影：
  - `lib/server/agent-core/tool-registry.ts`
  - `lib/server/agent-tools/**`
  - terminal visible output validator 相关模块
- 影响模型可见输入：
  - Agent default prompt / model input builder
  - tool manifest、schema description、examples、observations 和 compressed tool results
- 影响测试：
  - schema projector 单元测试
  - action validator / runtime repair loop tests
  - tool input invalid tests
  - visible output validation tests
  - trace / replay / manual LLM regression
- 不影响：
  - 服务端自然语言 intent 理解边界
  - ToolRegistry 的 tool 注册模式
  - Policy Guard、权限隔离、数据库事实来源
  - 用户可见安全错误文案；本 change 只收敛模型可见 repair feedback 合同
