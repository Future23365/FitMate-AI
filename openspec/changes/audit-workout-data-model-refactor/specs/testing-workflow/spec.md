## ADDED Requirements

### Requirement: High-risk database refactor audit gate
项目 MUST 对破坏性数据库重构提供独立验收门禁。该门禁 MUST 在实现完成后执行，并且 MUST 覆盖静态检查、自动化测试、构建检查、日志排查和缺陷修复回归。

#### Scenario: Destructive database refactor completes
- **WHEN** change 删除或替换 Prisma 核心业务模型
- **THEN** 后续验收 MUST 包含独立排查任务
- **AND** 排查任务 MUST 明确旧模型残留扫描、Prisma 验证、测试矩阵、构建检查和 bug 修复闭环
- **AND** 仅运行 `npm run typecheck` 或 `npm run build` MUST NOT 视为充分验收

#### Scenario: Audit check fails
- **WHEN** 任一排查命令或测试失败
- **THEN** 实现者 MUST 定位根因并修复
- **AND** 修复后 MUST 重新运行失败命令及其相关上游或下游检查
- **AND** 最终交付 MUST 记录失败、修复和重新验证结果

#### Scenario: Check cannot run
- **WHEN** 某项检查因为环境、权限、依赖、数据库或外部服务限制无法运行
- **THEN** 最终交付 MUST 记录未运行命令的原始错误或限制原因
- **AND** 最终交付 MUST 说明该缺口带来的剩余风险
- **AND** 实现者 MUST 尽量运行可替代的较低层检查，但不能把替代检查描述为完全等价

### Requirement: Runtime log review for refactor regressions
项目 MUST 在数据库重构排查中使用现有日志文件定位运行时问题。

#### Scenario: Terminal or runtime error appears
- **WHEN** 排查期间出现终端报错、编译失败、启动失败或运行时报错
- **THEN** 实现者 MUST 读取 `codex_logs/error_log.js`
- **AND** 实现者 MUST 根据真实错误链路定位问题

#### Scenario: AI generated workout flow behaves unexpectedly
- **WHEN** AI 草稿生成、保存、动作 id 校验或 trace 关联行为不符合预期
- **THEN** 实现者 MUST 读取 `codex_logs/ai_trace_log.js`
- **AND** 实现者 MUST 区分 AI 输出问题、服务端校验问题和前端保存问题
