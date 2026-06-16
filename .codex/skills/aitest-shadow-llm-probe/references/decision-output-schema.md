# Decision Output Schema

每轮必须写入 `round-xxx-decision.json`。核心字段如下：

```json
{
  "runId": "shadow-run-id",
  "roundId": "round-001",
  "decision": "call_tool",
  "toolName": "searchExerciseResources",
  "toolInput": {},
  "finalAnswer": null,
  "evidence": [
    {
      "source": "messages",
      "path": "$.messages[0].content",
      "summary": "用户要求具体训练动作，需要数据库动作事实。"
    }
  ],
  "fieldRationale": [
    {
      "path": "$.toolInput.suitabilities",
      "source": "tools",
      "reason": "schema 说明主训练候选使用 training。"
    }
  ],
  "missingFacts": [],
  "contractConcerns": [],
  "contaminationAudit": {
    "usedOnlyShadowInput": true,
    "suspectedExternalKnowledge": [],
    "notes": []
  }
}
```

## decision 取值

- `call_tool`：必须提供 `toolName` 和 `toolInput`，且 `toolName` 必须来自当前 input 的 `tools[]`。
- `final_answer`：必须提供 `finalAnswer.content`，用于记录 Codex 会提交的最终回答意图。
- `contract_gap`：必须在 `missingFacts[]` 或 `contractConcerns[]` 中说明缺口。

## 证据要求

- `evidence[].path` 必须引用当前 input 内部 JSON path。
- `fieldRationale[].path` 指向 `toolInput` 或 `finalAnswer` 内的关键字段。
- 不要引用源码路径、OpenSpec 路径、trace debug id 或记忆条目作为 Shadow 决策证据。

