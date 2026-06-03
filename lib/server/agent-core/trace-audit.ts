import { auditRedactedValue, type RedactionAuditResult } from "./redaction";
import type { AgentRunResult, AgentTraceEvent } from "./contracts";

/** auditAgentTrace 扫描脱敏 trace，防止 secret、完整 output 和内部 capability 进入回放证据。 */
export function auditAgentTrace(traceEvents: AgentTraceEvent[] | AgentRunResult): RedactionAuditResult {
  const value = Array.isArray(traceEvents) ? traceEvents : traceEvents.traceEvents;
  return auditRedactedValue(value);
}
