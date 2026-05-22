---
name: dev-log-reader
description: Use when the user asks to look at logs, read saved dev logs, inspect last_log.js, debug AI trace logs, or says phrases like "看一下log", "看日志", "看下日志", "排查log", "排查日志", or "看看 codex_logs". Automatically read the current project's codex_logs/last_log.js and use its saved request, response, intent, and error details to diagnose the issue.
---

# Dev Log Reader

When this skill triggers, inspect the saved AI trace log from the current project before answering.

## Workflow

1. Read `codex_logs/last_log.js` from the current workspace root.
2. If the file is missing, tell the user no saved log exists yet and ask them to click `保存log` on `/dev/ai-traces`.
3. Treat the file as a CommonJS export. Prefer `node -e "const log = require('./codex_logs/last_log.js'); console.dir(log, { depth: null });"` or a direct file read.
4. Focus only on these fields when present:
   - `requests`: request parameters, including which request each entry belongs to.
   - `responses`: model or step responses, including which step produced each response.
   - `intents`: intent result and intent error details.
   - `errors`: non-intent error details.
5. Diagnose the most likely cause using the saved request/response/error content. Do not summarize unrelated trace metadata.

## Response Style

- Answer in Simplified Chinese unless the user asks otherwise.
- Start with the concrete finding.
- Reference exact request/response/error names from the log.
- If the log points to code that should be changed and the user only asked a question, explain the fix without editing code.
