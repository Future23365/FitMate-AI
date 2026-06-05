## 1. OpenSpec 边界

- [x] 1.1 新增 `add-agent-fix-abstraction-gate-skill` change，并写清 proposal、design、spec 和 tasks。
- [x] 1.2 确认本 change 只新增项目级 Skill 和治理文档，不修改 Agent runtime、prompt、tool、API、数据库或生产聊天链路。

## 2. Skill 实现

- [x] 2.1 新增 `.codex/skills/agent-fix-abstraction-gate/SKILL.md`，覆盖触发条件、必读上下文、抽象层级分类、禁止方案、正确修复层级和固定输出格式。
- [x] 2.2 新增 `.codex/skills/agent-fix-abstraction-gate/agents/openai.yaml`，提供 display name、short description 和 default prompt。
- [x] 2.3 确认 Skill 正文默认中文，`toolName`、字段名、resource、action、命令、路径等技术标识保持英文原样。

## 3. 文档记录

- [x] 3.1 在 `docs/方案变更历史` 记录本次治理 Skill 的问题背景、调整思路和关键改动。
- [x] 3.2 在 `docs/项目演变历程.md` 追加本次项目级治理门禁变化。

## 4. 验证

- [x] 4.1 运行 `openspec validate add-agent-fix-abstraction-gate-skill --strict`。
- [x] 4.2 对新增 Skill 执行 frontmatter / `agents/openai.yaml` 基础结构检查。
- [x] 4.3 运行 `git diff --check` 和 `git diff --stat`，确认 diff 不混入已有 `AGENTS.md`、`next-env.d.ts` 用户改动。
- [x] 4.4 说明未运行 runtime/typecheck 的原因：本 change 不修改 TypeScript、React、API、Schema、Agent runtime 或生产 prompt。
