import {
  defaultThinkingEffortFor,
  resolveThinkingEffort,
  supportsThinkingEffort,
  type ThinkingEffort,
} from '../agent/config/thinking';
import type { ModelAlias } from '../config';
import type { ModelProvider, ResolvedRuntimeProvider } from './provider-manager';

export interface AgentSwarmItemBindingRequest {
  readonly modelAlias?: string;
  readonly thinking?: string;
}

export interface SubagentSpawnBinding {
  readonly source: 'agent-swarm-item';
  readonly modelAlias: string;
  readonly thinkingEffort: ThinkingEffort;
}

export function resolveAgentSwarmItemBinding(
  request: AgentSwarmItemBindingRequest,
  parentModelAlias: string | undefined,
  modelProvider: Pick<ModelProvider, 'resolveProviderConfig'> | undefined,
): SubagentSpawnBinding {
  const modelAlias = request.modelAlias ?? parentModelAlias;
  if (modelAlias === undefined) {
    throw new Error('AgentSwarm cannot resolve an item selector without a caller model.');
  }

  const resolved = resolveModel(modelAlias, modelProvider);
  const model = modelForThinking(resolved);
  const kimiProtocol = resolved.provider.type === 'kimi';
  const requestedThinking = request.thinking?.trim().toLowerCase() as ThinkingEffort | undefined;
  if (
    requestedThinking !== undefined &&
    !supportsThinkingEffort(requestedThinking, model, kimiProtocol)
  ) {
    const efforts = model.supportEfforts ?? [];
    const supported = efforts.length === 0 ? 'off, on' : ['off', ...efforts].join(', ');
    throw new Error(
      `Thinking effort "${requestedThinking}" is not supported by model alias "${modelAlias}". Supported efforts: ${supported}.`,
    );
  }

  return {
    source: 'agent-swarm-item',
    modelAlias,
    thinkingEffort:
      requestedThinking === undefined
        ? defaultThinkingEffortFor(model)
        : resolveThinkingEffort(requestedThinking, undefined, model, kimiProtocol),
  };
}

function resolveModel(
  modelAlias: string,
  modelProvider: Pick<ModelProvider, 'resolveProviderConfig'> | undefined,
): ResolvedRuntimeProvider {
  if (modelProvider === undefined) {
    throw new Error(`Model alias "${modelAlias}" cannot be resolved.`);
  }
  try {
    return modelProvider.resolveProviderConfig(modelAlias);
  } catch {
    throw new Error(`Model alias "${modelAlias}" is not configured.`);
  }
}

function modelForThinking(resolved: ResolvedRuntimeProvider): ModelAlias {
  return {
    provider: resolved.providerName,
    model: resolved.provider.model,
    maxContextSize: Math.max(resolved.modelCapabilities.max_context_tokens, 1),
    capabilities: resolved.alwaysThinking
      ? ['always_thinking']
      : resolved.modelCapabilities.thinking
        ? ['thinking']
        : [],
    supportEfforts:
      resolved.supportEfforts === undefined ? undefined : [...resolved.supportEfforts],
    defaultEffort: resolved.defaultEffort,
  };
}
