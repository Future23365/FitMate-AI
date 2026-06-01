## ADDED Requirements

### Requirement: 黑盒测试必须验证 Tool-first Agent 用户可见闭环

系统 SHALL 用真实 `/api/chat` 多轮黑盒流程验证 Tool-first Agent 主链，重点断言用户可见回复、工具执行结果和 artifact 事件一致。

#### Scenario: 多轮器械调整
- **WHEN** 黑盒流程先生成一套 30 分钟哑铃上肢 routine
- **AND** 用户随后输入“`不用哑铃了，换一个`”
- **THEN** 测试 MUST 断言系统读取最近 artifact
- **AND** 测试 MUST 断言最终结果不再推荐哑铃训练作为首选执行结果
- **AND** 测试 MUST 断言用户可见回复与 artifact、patch 或澄清事件一致

#### Scenario: 动作库真实查询
- **WHEN** 用户请求具体动作推荐、routine 或替代动作
- **THEN** 黑盒报告 MUST 记录是否发生动作库工具查询
- **AND** 用户可见具体动作 MUST 来自工具候选或已保存 artifact

#### Scenario: 旧 intent 字段不是验收核心
- **WHEN** Tool-first Agent 已返回正确用户可见结果和 artifact 事件
- **THEN** 测试 MUST NOT 仅因为缺少旧 `assistant_action`、旧 resolved intent 字段或旧 trigger JSON 判失败
- **AND** 报告 MUST 优先展示 Agent tool trace、ExecutionResult 和用户可见断言
