import "server-only";

import {
  agentArtifactSummarySchema,
  contextLimitsSchema,
  contextPackageSchema,
  type AgentArtifactSummary,
  type AgentConfirmation,
  type ChatMessageSummary,
  type ContextLimits,
  type ContextPackage,
  type ContextProvenance,
  type ContextSnapshot,
  type UserMemorySnapshot,
} from "./contracts";

export type BuildAgentContextInput = {
  latestUserMessage: string;
  recentMessages?: ChatMessageSummary[];
  recentArtifacts?: AgentArtifactSummary[];
  memorySnapshot?: UserMemorySnapshot;
  pendingConfirmation?: AgentConfirmation;
  optionalContextSnapshot?: ContextSnapshot;
  limits?: Partial<ContextLimits>;
};

// AgentContextBuilder owns the deterministic context package boundary before any Agent tool decision.
export class AgentContextBuilder {
  build(input: BuildAgentContextInput): ContextPackage {
    const limits = contextLimitsSchema.parse(input.limits ?? {});
    const latestUserMessage = truncateText(input.latestUserMessage, limits.maxMessageChars);
    const provenance: ContextProvenance[] = [
      {
        sourceKind: "latest_user_message",
        sourceId: "latest_user_message",
        trustLevel: "user_supplied",
        truncationReason: latestUserMessage.truncated ? "max_chars" : "none",
        visibleCharCount: latestUserMessage.value.length,
      },
    ];

    const recentMessages = (input.recentMessages ?? [])
      .slice(-limits.maxRecentMessages)
      .map((message, index) => {
        const content = truncateText(message.content, limits.maxMessageChars);
        const sourceId = message.id ?? `recent_message_${index}`;
        provenance.push({
          sourceKind: "recent_message",
          sourceId,
          sourceUpdatedAt: message.createdAt,
          trustLevel: message.role === "assistant" ? "derived_summary" : "user_supplied",
          truncationReason: content.truncated ? "max_chars" : "none",
          visibleCharCount: content.value.length,
        });
        return { ...message, content: content.value };
      });

    const recentArtifacts = (input.recentArtifacts ?? [])
      .slice(0, limits.maxRecentArtifacts)
      .map((artifact) => {
        const summary = artifact.summary
          ? truncateText(artifact.summary, limits.maxArtifactSummaryChars)
          : undefined;
        provenance.push({
          sourceKind: "recent_artifact",
          sourceId: artifact.artifactId,
          sourceUpdatedAt: artifact.updatedAt,
          trustLevel: "database_summary",
          truncationReason: summary?.truncated ? "max_chars" : "none",
          visibleCharCount: (artifact.title.length + (summary?.value.length ?? 0)),
        });
        return agentArtifactSummarySchema.parse({
          ...artifact,
          summary: summary?.value,
        });
      });

    if (input.memorySnapshot) {
      provenance.push({
        sourceKind: "user_memory",
        sourceId: input.memorySnapshot.snapshotId,
        sourceUpdatedAt: input.memorySnapshot.updatedAt,
        trustLevel: "database_summary",
        truncationReason: "none",
        visibleCharCount: estimateMemorySnapshotChars(input.memorySnapshot),
      });
    }

    if (input.pendingConfirmation) {
      provenance.push({
        sourceKind: "pending_confirmation",
        sourceId: input.pendingConfirmation.confirmationId,
        sourceUpdatedAt: input.pendingConfirmation.expiresAt,
        trustLevel: "structured_fact",
        truncationReason: "none",
        visibleCharCount: input.pendingConfirmation.summary.length,
      });
    }

    if (input.optionalContextSnapshot) {
      provenance.push({
        sourceKind: "context_snapshot",
        sourceId: input.optionalContextSnapshot.snapshotId,
        sourceUpdatedAt: input.optionalContextSnapshot.createdAt,
        trustLevel: "derived_summary",
        truncationReason: "none",
        visibleCharCount: input.optionalContextSnapshot.summary.length,
      });
    }

    return contextPackageSchema.parse({
      latestUserMessage: latestUserMessage.value,
      recentMessages,
      recentArtifacts,
      memorySnapshot: input.memorySnapshot,
      pendingConfirmation: input.pendingConfirmation,
      optionalContextSnapshot: input.optionalContextSnapshot,
      provenance,
      limits,
    });
  }
}

// createAgentContextBuilder provides a stable factory for later dependency injection in chat runtime tests.
export function createAgentContextBuilder() {
  return new AgentContextBuilder();
}

function truncateText(value: string, maxChars: number) {
  const normalized = value.trim();
  if (normalized.length <= maxChars) {
    return { value: normalized, truncated: false };
  }
  return { value: normalized.slice(0, maxChars), truncated: true };
}

function estimateMemorySnapshotChars(snapshot: UserMemorySnapshot) {
  return [...snapshot.facts, ...snapshot.preferences, ...snapshot.avoidances].join("").length;
}
