## ADDED Requirements

### Requirement: 黑盒报告必须记录确定性引用讲解诊断

系统 SHALL 让手动 LLM 黑盒 runner 记录确定性引用讲解路径的引用解析状态，避免用户可见回复正确但报告因缺少 `assistant_action` 而误判。

#### Scenario: 序号动作讲解 resolved 状态可见

- **WHEN** 用户在同一会话中基于最近训练卡片输入“第一个动作怎么做”
- **AND** 服务端通过确定性路径读取 recent artifact 和动作库生成讲解
- **THEN** 黑盒 runner MUST 记录 `referenceResolutionStatus = resolved`
- **AND** 报告 MUST 记录 artifactId、artifactKind 和 payload 读取状态
- **AND** 该轮 MUST NOT 仅因为没有 `assistant_action` 事件而判定引用解析失败

#### Scenario: 确定性引用失败仍然失败

- **WHEN** 用户请求序号动作讲解
- **AND** 服务端无法读取当前用户可访问的 artifact payload 或无法定位具体 `exerciseId`
- **THEN** 黑盒 runner MUST 将该轮记录为语义断言失败
- **AND** 报告 MUST 记录失败原因
- **AND** 系统 MUST NOT 把无训练卡片当作该轮通过的充分条件

### Requirement: token 预估必须优先使用真实运行校准

系统 SHALL 在手动 LLM 黑盒测试启动前使用最近一次可用真实运行报告校准 token 预估，只有缺少可用真实报告时才使用 fallback。

#### Scenario: 基础套件使用最近真实报告均值

- **WHEN** 开发者执行 `npm run test:llm`
- **AND** `docs/manual-llm-blackbox-flow-latest-report.md` 中存在真实模型运行状态
- **AND** 报告包含有效 `total_tokens` 和轮次数
- **THEN** token 预估 MUST 基于该报告的真实 token 均值或总量校准
- **AND** 输出和新报告 MUST 标明估算来源为真实报告校准
- **AND** 系统 MUST NOT 在该条件下退回过低 fallback 估算

#### Scenario: 缺少真实报告时 fallback 标注明确

- **WHEN** 最近报告缺失、为跳过报告或缺少有效 token 字段
- **THEN** token 预估 MAY 使用 fixture 数量、轮次数和保守均值生成
- **AND** 输出和报告 MUST 标明估算来源为 fallback
- **AND** 系统 MUST NOT 将跳过报告的 `total_tokens = 0` 当作真实成本基线
