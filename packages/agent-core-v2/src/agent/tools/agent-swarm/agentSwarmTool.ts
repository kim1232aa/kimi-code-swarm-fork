/**
 * `tools` domain (L7) — `AgentSwarmTool` implementation (the `AgentSwarm`
 * tool).
 *
 * Launches a batch of child agents (an ordinary Agent scope each) through the
 * session swarm coordinator (`ISessionSwarmService`) and renders the
 * per-subagent XML result. Reads persisted swarm item labels through the
 * Session-scoped coordinator so later `resume_agent_ids` calls relabel
 * resumed subagents like v1. Resolves the explicit or target-profile model
 * preference through `resolveSubagentBinding` against `IConfigService`,
 * `IFlagService`, `ISessionAgentProfileCatalog`, and the caller's
 * `IAgentProfileService`; object items can override that binding and are
 * validated through `IModelCatalog` before the batch starts. Without a bound
 * caller model, the coordinator keeps its inherit-caller fallback. Swarm mode
 * is entered through `IAgentSwarmService`; the caller's agent id comes from
 * `IAgentScopeContext`. Pure tool — owns no scoped state.
 * The public contract (input schema, constants, `IAgentSwarmTool`) lives in
 * `./agent-swarm`.
 *
 * Registered via the module-level `registerAgentToolService(IAgentSwarmTool,
 * AgentSwarmTool)` at the bottom of this file — the same "import = register"
 * pattern used by every agent tool. Bound at Agent scope.
 */

import {
  ToolAccesses,
  type ExecutableToolContext,
  type ExecutableToolResult,
  type ToolExecution,
} from '#/tool/toolContract';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';
import { toInputJsonSchema } from '#/tool/input-schema';
import { IConfigService } from '#/app/config/config';
import { IFlagService } from '#/app/flag/flag';
import { IModelCatalog, type Model } from '#/kosong/model/catalog';
import {
  modelSupportsThinking,
  modelSupportsThinkingEffort,
  normalizeRequestedThinkingEffort,
} from '#/kosong/model/thinking';
import {
  ISessionSwarmService,
  type SessionSwarmBinding,
  type SessionSwarmTask,
} from '#/session/swarm/sessionSwarm';
import { ISessionAgentProfileCatalog } from '#/session/sessionAgentProfileCatalog/sessionAgentProfileCatalog';
import { IAgentProfileService } from '#/agent/profile/profile';
import {
  subagentAllowlistFor,
  subagentTypeNotAllowedMessage,
} from '#/app/agentProfileCatalog/profile-shared';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IAgentSwarmService } from '#/agent/swarm/swarm';
import {
  buildSubagentModelDescriptions,
  resolveSubagentBinding,
  resolveSubagentTimeoutMs,
} from '#/session/subagent/configSection';
import {
  AgentSwarmToolInputSchema,
  IAgentSwarmTool,
  MAX_AGENT_SWARM_SUBAGENTS,
  PROMPT_TEMPLATE_PLACEHOLDER,
  type AgentSwarmItem,
  type AgentSwarmToolInput,
} from './agent-swarm';
import AGENT_SWARM_DESCRIPTION from './agent-swarm.md?raw';

const DEFAULT_SUBAGENT_TYPE = 'coder';

interface NormalizedAgentSwarmItem {
  readonly item: string;
  readonly modelAlias?: string;
  readonly thinking?: string;
  readonly hasExplicitBinding: boolean;
}

interface AgentSwarmSpawnSpec {
  readonly kind: 'spawn';
  readonly index: number;
  readonly item: string;
  readonly binding?: SessionSwarmBinding;
  readonly prompt: string;
}

interface AgentSwarmResumeSpec {
  readonly kind: 'resume';
  readonly index: number;
  readonly agentId: string;
  readonly item?: string;
  readonly prompt: string;
}

type AgentSwarmSpec = AgentSwarmSpawnSpec | AgentSwarmResumeSpec;

interface SwarmRunResult {
  readonly spec: AgentSwarmSpec;
  readonly agentId?: string;
  readonly status: 'completed' | 'failed' | 'aborted';
  readonly state?: 'started' | 'not_started';
  readonly result?: string;
  readonly error?: string;
}

export class AgentSwarmTool implements IAgentSwarmTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'AgentSwarm' as const;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(AgentSwarmToolInputSchema);

  private readonly callerAgentId: string;

  constructor(
    @ISessionSwarmService private readonly swarmService: ISessionSwarmService,
    @IAgentScopeContext scopeContext: IAgentScopeContext,
    @IAgentSwarmService private readonly swarmMode: IAgentSwarmService,
    @IConfigService private readonly config: IConfigService,
    @IFlagService private readonly flags: IFlagService,
    @ISessionAgentProfileCatalog private readonly catalog: ISessionAgentProfileCatalog,
    @IAgentProfileService private readonly profile: IAgentProfileService,
    @IModelCatalog private readonly modelCatalog: IModelCatalog,
  ) {
    this.callerAgentId = scopeContext.agentId;
  }

  get description(): string {
    const modelLines = buildSubagentModelDescriptions(
      this.config,
      this.flags,
      this.profile.data().modelAlias,
    );
    return modelLines === undefined
      ? AGENT_SWARM_DESCRIPTION
      : `${AGENT_SWARM_DESCRIPTION}\n\n${modelLines}`;
  }

  resolveExecution(args: AgentSwarmToolInput): ToolExecution {
    const agentCount = (args.items?.length ?? 0) + Object.keys(args.resume_agent_ids ?? {}).length;
    return {
      accesses: ToolAccesses.all(),
      description: `Launching agent swarm: ${args.description}`,
      display: {
        kind: 'agent_call',
        agent_name: `swarm (${agentCount} subagents)`,
        prompt: args.description,
      },
      approvalRule: this.name,
      execute: (ctx) => this.execution(args, ctx),
    };
  }

  private async execution(
    args: AgentSwarmToolInput,
    context: ExecutableToolContext,
  ): Promise<ExecutableToolResult> {
    try {
      this.swarmMode.enter('tool');
      const result = await this.runSwarm(args, context.signal, context.toolCallId);
      return {
        output: result,
      };
    } catch (error) {
      return {
        output: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }
  }

  private async runSwarm(
    args: AgentSwarmToolInput,
    signal: AbortSignal,
    toolCallId: string,
  ): Promise<string> {
    const profileName = normalizeOptionalString(args.subagent_type) ?? DEFAULT_SUBAGENT_TYPE;
    let binding: SessionSwarmBinding | undefined;
    if ((args.items?.length ?? 0) > 0) {
      await this.catalog.ready;
      const own = this.profile.data();
      const allowlist = subagentAllowlistFor(this.catalog, own);
      if (allowlist !== undefined && !allowlist.includes(profileName)) {
        throw new Error(subagentTypeNotAllowedMessage(profileName, allowlist));
      }
      const targetProfile = this.catalog.get(profileName);
      if (targetProfile === undefined) {
        throw new Error(`Unknown agent type: "${profileName}"`);
      }
      if (own.modelAlias !== undefined) {
        binding = resolveSubagentBinding(
          this.config,
          this.flags,
          { modelAlias: own.modelAlias, thinkingLevel: own.thinkingLevel },
          args.model ?? targetProfile.modelPreference,
        );
      }
    }
    const timeoutMs = resolveSubagentTimeoutMs(this.config);
    const specs = await createAgentSwarmSpecs(
      args,
      (agentId) =>
        this.swarmService.getSwarmItem({ callerAgentId: this.callerAgentId, agentId }),
      (item) => this.resolveItemBinding(item, binding),
    );
    const tasks: SessionSwarmTask<AgentSwarmSpec>[] = specs.map((spec) => {
      const descriptionName = spec.kind === 'resume' ? 'resume' : profileName;
      const data: AgentSwarmSpec =
        spec.kind === 'resume'
          ? spec
          : {
              kind: 'spawn',
              index: spec.index,
              item: spec.item,
              prompt: spec.prompt,
            };
      const common = {
        data,
        profileName: spec.kind === 'resume' ? 'subagent' : profileName,
        parentToolCallId: toolCallId,
        prompt: spec.prompt,
        description: childDescription(args.description, spec.index, descriptionName),
        swarmIndex: spec.index,
        runInBackground: false,
        swarmItem: spec.item,
        signal,
        timeout: timeoutMs,
      };
      if (spec.kind === 'resume') {
        return {
          ...common,
          kind: 'resume' as const,
          resumeAgentId: spec.agentId,
        };
      }
      return {
        ...common,
        kind: 'spawn' as const,
        binding: spec.binding,
      };
    });
    const results = await this.swarmService.run({
      callerAgentId: this.callerAgentId,
      tasks,
    });
    return renderSwarmResults(
      results.map(({ task, ...result }) => ({ spec: task.data as AgentSwarmSpec, ...result })),
    );
  }

  private resolveItemBinding(
    item: NormalizedAgentSwarmItem,
    fallback: SessionSwarmBinding | undefined,
  ): SessionSwarmBinding | undefined {
    if (!item.hasExplicitBinding) return fallback;
    const modelAlias = item.modelAlias ?? fallback?.model;
    if (modelAlias === undefined) {
      return undefined;
    }
    const model = this.tryGetModel(modelAlias);
    const bindingAlias = model.id;
    const thinking = normalizeRequestedThinkingEffort(item.thinking);
    if (thinking !== undefined && !modelSupportsThinkingEffort(thinking, model, true)) {
      throw new Error(
        `Thinking effort "${thinking}" is not supported by model alias "${bindingAlias}". Supported efforts: ${supportedThinkingEfforts(model)}.`,
      );
    }
    return {
      model: bindingAlias,
      thinking:
        thinking ?? (item.modelAlias === undefined ? fallback?.thinking : undefined),
      strictThinking: thinking !== undefined,
      source: 'agent-swarm-item',
    };
  }

  private tryGetModel(alias: string): Model {
    try {
      return this.modelCatalog.get(alias);
    } catch {
      // Case-insensitive fallback: the model might be "avv/..." but the caller
      // passed "Avv/...".  Split on the first "/" and search by model name.
      const slash = alias.indexOf('/');
      if (slash < 0) throw this.modelNotFound(alias);
      const modelName = alias.slice(slash + 1).toLowerCase();
      for (const id of this.modelCatalog.findByName(modelName)) {
        if (id.toLowerCase() === alias.toLowerCase()) return this.modelCatalog.get(id);
      }
      throw this.modelNotFound(alias);
    }
  }

  private modelNotFound(alias: string): Error {
    return new Error(`Model "${alias}" is not configured in config.toml.`);
  }
}

registerAgentToolService(IAgentSwarmTool, AgentSwarmTool, { name: 'AgentSwarm', domain: 'swarm' });

async function createAgentSwarmSpecs(
  args: AgentSwarmToolInput,
  getResumeItem: (agentId: string) => Promise<string | undefined>,
  resolveItemBinding: (item: NormalizedAgentSwarmItem) => SessionSwarmBinding | undefined,
): Promise<AgentSwarmSpec[]> {
  const resumeEntries = Object.entries(args.resume_agent_ids ?? {}).map(([agentId, prompt]) => ({
    agentId: agentId.trim(),
    prompt: prompt.trim(),
  }));
  const items = (args.items ?? []).map((value) => {
    const item = normalizeAgentSwarmItem(value);
    return { ...item, binding: resolveItemBinding(item) };
  });
  const itemCount = items.length;
  const resumeCount = resumeEntries.length;
  const totalCount = resumeCount + itemCount;
  if (!hasMinimumAgentSwarmInputs(itemCount, resumeCount)) {
    throw new Error('AgentSwarm requires at least 2 items unless resume_agent_ids is provided.');
  }
  if (totalCount > MAX_AGENT_SWARM_SUBAGENTS) {
    throw new Error(`AgentSwarm supports at most ${String(MAX_AGENT_SWARM_SUBAGENTS)} subagents.`);
  }
  const promptTemplate = normalizeOptionalString(args.prompt_template);
  if (items.length > 0 && promptTemplate === undefined) {
    throw new Error('prompt_template is required when items are provided.');
  }
  if (promptTemplate !== undefined && !promptTemplate.includes(PROMPT_TEMPLATE_PLACEHOLDER)) {
    throw new Error(
      `prompt_template must include the ${PROMPT_TEMPLATE_PLACEHOLDER} placeholder.`,
    );
  }

  const seenPrompts = new Map<string, number>();
  const specs: AgentSwarmSpec[] = [];
  for (const entry of resumeEntries) {
    specs.push({
      kind: 'resume',
      index: specs.length + 1,
      agentId: entry.agentId,
      item: await getResumeItem(entry.agentId),
      prompt: entry.prompt,
    });
  }
  if (items.length > 0) {
    const itemPromptTemplate = promptTemplate!;
    items.forEach(({ item, binding }, index) => {
      const prompt = itemPromptTemplate.split(PROMPT_TEMPLATE_PLACEHOLDER).join(item);
      const previousIndex = seenPrompts.get(prompt);
      if (previousIndex !== undefined) {
        throw new Error(
          `Duplicate subagent prompts from items ${String(previousIndex)} and ${String(index + 1)}. AgentSwarm requires distinct subagents.`,
        );
      }
      seenPrompts.set(prompt, index + 1);
      specs.push({
        kind: 'spawn',
        index: specs.length + 1,
        item,
        binding,
        prompt,
      });
    });
  }
  return specs;
}

function normalizeAgentSwarmItem(value: AgentSwarmItem): NormalizedAgentSwarmItem {
  if (typeof value === 'string') {
    return { item: value.trim(), hasExplicitBinding: false };
  }
  const modelAlias = normalizeOptionalString(value.model_alias);
  const thinking = normalizeOptionalString(value.thinking);
  return {
    item: value.item.trim(),
    modelAlias,
    thinking,
    hasExplicitBinding: modelAlias !== undefined || thinking !== undefined,
  };
}

function supportedThinkingEfforts(model: Model): string {
  if (!modelSupportsThinking(model)) return 'off';
  const efforts = model.supportEfforts ?? [];
  return efforts.length === 0 ? 'off, on' : ['off', ...efforts].join(', ');
}

function hasMinimumAgentSwarmInputs(itemCount: number, resumeCount: number): boolean {
  return resumeCount > 0 || itemCount >= 2;
}

function childDescription(swarmDescription: string, index: number, profileName: string): string {
  return `${swarmDescription} #${String(index)} (${profileName})`;
}

function renderSwarmResults(results: readonly SwarmRunResult[]): string {
  const completed = results.filter((result) => result.status === 'completed').length;
  const failed = results.filter((result) => result.status === 'failed').length;
  const aborted = results.filter((result) => result.status === 'aborted').length;
  const shouldRenderResumeHint =
    results.some((result) => result.status !== 'completed') &&
    results.some((result) => result.agentId !== undefined);
  const lines = [
    '<agent_swarm_result>',
    `<summary>${renderSwarmSummary(completed, failed, aborted)}</summary>`,
  ];

  if (shouldRenderResumeHint) {
    lines.push(
      '<resume_hint>Call AgentSwarm with resume_agent_ids using the agent_id values in this result to continue unfinished work.</resume_hint>',
    );
  }

  for (const result of results) {
    const agentId = result.agentId === undefined ? '' : ` agent_id="${result.agentId}"`;
    const mode = result.spec.kind === 'resume' ? ' mode="resume"' : '';
    const item = result.spec.item === undefined ? '' : ` item="${escapeXmlAttribute(result.spec.item)}"`;
    const state = result.state === undefined ? '' : ` state="${result.state}"`;
    const body = result.status === 'completed' ? (result.result ?? '') : (result.error ?? 'unknown error');
    lines.push(
      `<subagent${mode}${agentId}${item}${state} outcome="${result.status}">${body}</subagent>`,
    );
  }

  lines.push('</agent_swarm_result>');
  return lines.join('\n');
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function renderSwarmSummary(completed: number, failed: number, aborted = 0): string {
  const parts: string[] = [];
  if (completed > 0) parts.push(`completed: ${String(completed)}`);
  if (failed > 0) parts.push(`failed: ${String(failed)}`);
  if (aborted > 0) parts.push(`aborted: ${String(aborted)}`);
  return parts.join(', ');
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
