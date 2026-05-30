## Context

前几个 change 让系统能保存 artifact、解析引用、生成 Patch 和计划草稿，但真正写入用户长期数据前还缺少统一授权边界。这个 change 把“训练内容是否合理”和“这个操作是否允许”分开：Validator 判断内容质量，PolicyEngine 判断权限、范围和确认要求。

## Goals / Non-Goals

**Goals:**

- 为 artifact、routine、schedule、memory 和 Patch 写操作提供统一 Policy 检查。
- 明确哪些操作默认可执行、哪些必须确认、哪些默认阻断。
- 支持 confirmation token 或等价状态，确保用户确认的是具体 diff 和 scope。
- 防止已完成训练历史被误改。

**Non-Goals:**

- 不实现完整支付、账号权限或组织权限体系。
- 不重写 Validator；Policy 只判断操作边界，不判断训练内容是否科学。
- 不实现复杂 Agent runtime；确认只作为当前编排流程的受控步骤。

## Decisions

### Decision 1: Policy 与 Validator 分离

Validator 判断训练内容是否合理；PolicyEngine 判断当前用户是否允许执行该写操作、是否需要确认以及安全 scope。两者都通过后才允许持久化。

### Decision 2: 默认保护已完成历史

已完成 schedule 和 WorkoutSessionResult 默认不可被 Patch 修改。用户可以基于历史创建新 revision 或未来安排，但不能静默改写历史。

### Decision 3: Confirmation 绑定 diff 和 scope

需要确认的操作必须向用户展示目标、范围、diff、影响数量和原因。确认 token 绑定这些内容，避免用户确认 A 之后系统执行 B。

### Decision 4: 安全 scope 优先收窄

当用户表达不明确时，PolicyEngine 应返回较窄 safeScope，例如 `artifact_only` 或 `new_revision`，而不是默认覆盖 saved routine 或 future schedules。

### Decision 5: Confirmation token 先采用服务端签名状态

当前 change 不新增数据库表。需要确认的写操作先生成服务端签名的 confirmation token，token payload 绑定 userId、目标 id、scope、operation、diff 摘要、issuedAt 和 expiresAt。确认后必须重新校验 token，再重新执行 Policy 和 Validator；校验失败、过期或 diff/scope 不一致时拒绝写入并重新确认。

### Decision 6: trace 记录使用轻量摘要

`policy_check` trace 只记录 target、scope、allowed、requiresConfirmation、reasons、safeScope 和阻断原因；`confirmation_gate` trace 只记录 token 摘要、确认状态、影响数量、diff 摘要和失败原因，不写入完整训练 payload。

## Risks / Trade-offs

- [Risk] 确认步骤增加对话轮次。→ Mitigation: 只对高影响写操作确认，未保存草稿单动作修改可直接 revision。
- [Risk] Policy 规则分散。→ Mitigation: 写操作入口统一调用 PolicyEngine，并在 trace 中记录结果。
- [Risk] 用户确认内容与实际执行不一致。→ Mitigation: confirmation token 绑定 diff、scope、目标 id 和过期时间。
- [Risk] 签名 token 无服务端撤销列表。→ Mitigation: token 有短有效期，且写入前重新执行 Policy 和 Validator；未来如果需要跨设备待确认队列，再升级为数据库状态。
