# Agent Prompt 合同治理 Skill

时间：2026-06-03 18:52:05 CST

## 当前真实问题

Agent Tool Orchestrator 已经有 `agent-tool-change-governance` 约束 tool / core / production 变更边界，但 prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations 和 compressed tool results 仍容易被当成普通文案处理。后续如果只改源文件 prompt，而不确认模型实际可见输入，就可能继续漏掉 `AgentAction` 输出格式、tool loop、resource、policy、grounding 或 repair 合同。

## 原方案为什么不合适

只靠 `agent-tool-change-governance` 会把 prompt 合同审阅放在 tool 变更的附属位置；纯 prompt / model input 修改不一定会进入 tool/core 边界检查。只在架构文档里写规则也不够稳定，因为后续 Codex 可能没有在实现前读取对应章节，或者只检查源文件文案而忽略 builder、projection、compression 后的真实 model input。

## 调整思路

本次新增独立项目级 Skill，专门治理 Agent prompt / model input 合同。它与 `agent-tool-change-governance` 分工明确：前者检查模型可见输入是否表达通用 Agent 编排合同和业务 tool 可见说明，后者治理 tool/core/production 模块边界。这样新增业务 tool 时可以先定实现范围，再审模型实际看到的合同。

## 关键改动

- 新增 `.codex/skills/agent-prompt-contract-governance/SKILL.md`，用中文固化 prompt 合同治理 preflight、修改类型、真实 model input 检查、通用 Agent 合同、业务 tool 可见说明、禁止项和验证要求。
- 新增 `.codex/skills/agent-prompt-contract-governance/agents/openai.yaml`，让 Skill 在 Codex UI 中有清晰名称和默认触发提示。
- 更新 `docs/agent-tool-orchestrator-design.md`，记录新 Skill 的使用方式，以及它和 `agent-tool-change-governance` 的分工。
- 更新 README 的 `.codex/skills` 目录说明，标注该目录同时承载 OpenSpec、Agent tool 和 Agent prompt 合同治理流程。

## 验证结果

已运行：

```txt
openspec validate add-agent-prompt-contract-governance-skill --strict
node -e '<frontmatter and agents metadata check>'
git diff --check
git status --short
```

`openspec validate add-agent-prompt-contract-governance-skill --strict` 通过。`quick_validate.py` 因当前 Python 环境缺少 `yaml` 模块无法运行，报错为 `ModuleNotFoundError: No module named 'yaml'`；已改用等价 Node 脚本检查 `SKILL.md` frontmatter、Skill 名称、description 和 `agents/openai.yaml` 的 `display_name`、`short_description`、`default_prompt`，检查通过。`git diff --check` 通过，最终工作区范围只包含本 change 的 Skill、OpenSpec 任务和必要文档。

本次只新增 Skill 和文档，不修改真实 prompt runtime、业务 tool、TypeScript、API、Schema 或 AI 编排代码；因此不需要运行业务 prompt 测试或 `npm run typecheck`。
