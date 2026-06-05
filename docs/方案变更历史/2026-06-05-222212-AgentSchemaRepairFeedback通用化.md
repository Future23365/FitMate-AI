# Agent Schema Repair Feedback 通用化

时间：2026-06-05 22:22:12 CST

## 原问题

Agent repair feedback 之前同时承担两类职责：一类是 schema、字段路径、discriminator 和 validator issue 可以机械确定的结构错误；另一类是 runtime 动态拼出来的修复说明，例如旧字段应该换成什么字段、某类 tool input 应该怎么补、terminal output 缺事实后下一步应该怎么做。

后者会让服务端越过合同边界，开始解释模型语义或业务恢复策略。新增 tool、字段收敛或 visible output 校验变化时，容易继续补具体 `toolName`、旧字段组合或 trace case 文案，导致 repair loop 变成隐藏业务知识库。

## 调整思路

本次把模型可见 repair feedback 收敛为通用 facts：

- `AgentAction` 和 tool input schema failure 统一经过 `schema error projector`。
- Projector 只输出 `target`、`discriminator`、`errors[]`、`path`、`expected`、`actual`、`allowedFields`、`requiredFields`、`allowedValues` 等确定性字段。
- terminal visible output 和 domain validator 只暴露 `DomainValidation` facts，不再输出 `repair`、`recoveryDirections`、`recoverableActions` 或固定下一步建议。
- 默认 Agent prompt 增加通用 `schema_validation_failed` / `domain_validation_failed` 读取规则，让模型根据稳定 schema、manifest、examples 和 facts 自行修正下一轮 action。

## 关键改动

- 新增 `lib/server/agent-core/schema-error-projector.ts`，负责 Zod/schema issue 的通用结构化投影和脱敏。
- `Action Validator` 的 `AgentAction` parse failure 与 tool input failure 接入通用 projector。
- terminal grounding 与 visible output validator 失败改为 domain facts。
- `visibleTrainingProposal` validator 删除模型可见恢复方向字段，只保留 coverage、allowed section、missing item、source summary 等事实。
- prompt version 升级到 `agent-action-v15`，加入通用 repair facts 读取说明。
- 新增和更新 projector、validator、prompt、architecture boundary、visible output、chat replay 相关测试。

## 结果

本次没有新增服务端关键词、正则、短句模板、自然语言语义分流或具体业务 `toolName` repair 分支。新增 fixture tool 只靠 `inputSchema` 即可获得字段级 repair facts；业务 tool 名只作为定位信息出现在 `target.toolName` 中，不参与 projector 分支。

验证结果：

- `openspec validate generalize-agent-schema-repair-feedback --strict`
- 相关单测集合：7 个文件、110 个测试通过
- adapter / AI trace 测试：2 个文件、15 个测试通过
- `npm test`：70 个文件、463 个测试通过
- `npm run typecheck`
