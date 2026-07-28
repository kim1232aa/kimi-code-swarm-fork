const CAPABILITY = 'agent-swarm-item-models-v1';

let input = '';
for await (const chunk of process.stdin) input += chunk;

let payload;
try {
  payload = JSON.parse(input);
} catch {
  process.exit(0);
}

const toolName = payload?.toolName ?? payload?.tool_name;
const toolInput = payload?.toolInput ?? payload?.tool_input;
const items = toolInput?.items;
const hasObjectItems =
  Array.isArray(items) && items.some((item) => typeof item === 'object' && item !== null && !Array.isArray(item));
const hasAliasLikeStringItems =
  Array.isArray(items) &&
  items.some((item) => {
    if (typeof item !== 'string') return false;
    const parenthesizedAlias = /[（(]\s*[\p{L}\p{N}_.:-]+\/[\p{L}\p{N}_.:/-]+\s*[）)]/u;
    if (parenthesizedAlias.test(item)) return true;
    const exactAlias = /^[\p{L}\p{N}_.:-]+\/[\p{L}\p{N}_:-]+$/u;
    return exactAlias.test(item);
  });
if (toolName !== 'AgentSwarm') process.exit(0);
if (hasAliasLikeStringItems) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      permissionDecision: 'deny',
      permissionDecisionReason:
        'AgentSwarm string items never select models. Put each configured alias in an object field: { item: "task", model_alias: "provider/model" }.',
    },
  }));
  process.exit(0);
}
if (!hasObjectItems) process.exit(0);

const capabilities = (process.env.KIMI_CODE_CAPABILITIES ?? '')
  .split(',')
  .map((capability) => capability.trim())
  .filter(Boolean);
if (capabilities.includes(CAPABILITY)) process.exit(0);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    permissionDecision: 'deny',
    permissionDecisionReason:
      'Object AgentSwarm items require the agent-swarm-item-models-v1 capability. Launch the multi-model swarm fork or use plain string items.',
  },
}));
