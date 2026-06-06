## ADDED Requirements

### Requirement: 手动 LLM 黑盒必须区分 finalizer 失败回复和主任务完成

手动 LLM 黑盒测试 SHALL 将 terminal failure finalizer 产生的用户回复单独归类。finalizer 回复可以是可恢复体验成功，但 MUST NOT 被统计为原始用户任务完成、训练卡片生成成功或主 Agent `final_answer` 成功。

#### Scenario: finalizer 回复被单独统计

- **WHEN** 黑盒 flow 中某轮主 Agent 未生成通过校验的结果
- **AND** production adapter 通过 terminal failure finalizer 输出用户可见回复
- **THEN** 报告 MUST 将该轮标记为 `recoverable_failure_finalized` 或等价状态
- **AND** 报告 MUST 记录主 Agent failure code
- **AND** 报告 MUST 记录 finalizer 成功生成了用户可继续对话的回复
- **AND** 报告 MUST NOT 将该轮统计为训练卡片生成成功

#### Scenario: finalizer 回复必须说明未完成

- **WHEN** 黑盒断言 terminal failure finalizer 回复
- **THEN** 用户可见回复 MUST 表达本轮未能生成通过校验的可靠结果或等价语义
- **AND** 回复 MUST 给出可继续对话的下一步
- **AND** 回复 MUST NOT 声称已完成、已保存、已生成训练卡片或已执行未发生的 tool

### Requirement: 手动 LLM 黑盒不得默认消耗 finalizer 真实模型调用

项目 SHALL 保持默认自动测试 token-safe。terminal failure finalizer 的真实模型调用只能在显式手动 LLM 命令或明确启用的测试配置下运行。

#### Scenario: 默认 npm test 不调用 finalizer 真实模型

- **WHEN** 开发者执行 `npm run test`
- **THEN** 系统 MUST NOT 调用真实 terminal failure finalizer LLM
- **AND** 系统 MUST NOT 因缺少 finalizer provider 配置而失败
- **AND** 相关自动化测试 MUST 使用 fake finalizer、stub adapter 或确定性 fallback 覆盖逻辑

#### Scenario: 手动 LLM 报告记录 finalizer token

- **WHEN** 开发者显式运行包含 finalizer 的真实 LLM 黑盒测试
- **THEN** 报告 MUST 单独记录主 Agent token usage 和 finalizer token usage
- **AND** 报告 MUST 记录 finalizer 调用次数
- **AND** 报告 MUST 记录 finalizer 跳过或降级原因

### Requirement: 手动 LLM fixture 必须覆盖 finalizer 边界

手动 LLM fixture SHALL 覆盖 terminal failure finalizer 的关键用户可见边界，包括内部 repair 耗尽、provider 不可用、finalizer 输出无效和确定性 fallback。

#### Scenario: 内部 repair 耗尽覆盖

- **WHEN** fixture 模拟或触发主 Agent 因 terminal validation / visible output validation / resource reference 耗尽 repair
- **THEN** 预期结果 MUST 允许 terminal failure finalizer 生成可继续对话回复
- **AND** 断言 MUST 检查回复没有训练卡片、没有成功承诺、没有内部错误泄漏

#### Scenario: provider 不可用覆盖

- **WHEN** fixture 模拟 provider quota、rate limit、HTTP failure、配置缺失或网络失败
- **THEN** 预期结果 MUST 是确定性安全 fallback
- **AND** 断言 MUST 检查 finalizer 未被调用
- **AND** 断言 MUST 检查用户可见文案没有伪装成模型分析后的回复
