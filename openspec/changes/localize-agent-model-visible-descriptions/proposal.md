## Why

当前生产 Agent 的通用 system prompt 已经使用中文，但 tool manifest 中的 `description`、`whenToUse`、`whenNotToUse` 和 `examples.description` 仍有英文内容会原样进入 Planner 可见输入。模型可见描述语言不统一，会让后续 prompt 合同审阅缺少稳定标准，也容易在新增 tool 时继续回退为英文。

本 change 要把“模型可见描述性 prompt 默认使用中文，技术标识保持英文”固化为治理规则，并把当前静态 manifest 英文说明改为中文，同时用自动化测试防止后续回退。

## What Changes

- 在项目级规则中补充：所有发给模型的描述性 prompt / model input 默认使用中文；toolName、字段名、枚举、action type、resource type、代码标识符和命令保持英文原样。
- 更新 `agent-prompt-contract-governance` Skill，使它在审查 prompt、model input、tool manifest、schema summary、examples、repair feedback、observations 和 compressed tool results 时检查语言规则。
- 更新 `agent-tool-change-governance` Skill，使新增或修改 Agent tool 时必须同步检查模型可见描述语言。
- 将当前 Agent tool manifest / schema / examples 中仍为英文的描述性内容改成中文。
- 增加 manifest hardening / registry manifest 回归，确保模型可见描述字段默认包含中文，不把英文说明重新暴露给 Planner。
- 不新增业务 tool，不改变 tool input / output schema，不改变 AgentAction、runtime、policy、resource、trace 或 `/api/chat` 主流程。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-prompt-contract-governance`: 增加模型可见描述性 prompt 默认中文的治理要求。
- `agent-tool-change-governance`: 增加新增或修改 Agent tool 时的模型可见描述语言检查要求。
- `agent-tool-production-hardening`: 增加 tool manifest 描述性字段的中文化校验要求。

## Impact

- 影响 `AGENTS.md`、`.codex/skills/agent-prompt-contract-governance/SKILL.md`、`.codex/skills/agent-tool-change-governance/SKILL.md` 和 `docs/agent-tool-orchestrator-design.md`。
- 影响 `lib/server/agent-tools/**` 中当前模型可见 tool manifest 文案。
- 影响 `lib/server/agent-core/manifest-hardening.ts`、`tests/agent-core/tool-registry-manifest.test.ts`、`tests/agent-core/manifest-hardening.test.ts` 以及使用 fixture manifest 的相关测试。
- 不影响数据库、API 契约、用户可见页面、训练计划生成规则或业务权限边界。
