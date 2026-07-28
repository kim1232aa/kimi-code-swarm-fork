const CAPABILITY = 'agent-swarm-item-models-v1';
const ITEM_PLACEHOLDER = '{{item}}';
const ALIAS_PATTERN = '[\\p{L}\\p{N}_.:-]+/[\\p{L}\\p{N}_.:-]+';
const PARENTHESIZED_ALIAS = new RegExp(`[（(]\\s*${ALIAS_PATTERN}\\s*[）)]`, 'u');
const EXACT_ALIAS = new RegExp(`^${ALIAS_PATTERN}$`, 'u');
const LIKELY_PATH_SUFFIX = /\.(?:c|cc|css|csv|cts|html|java|js|json|jsx|md|mjs|mts|py|rs|sh|toml|ts|tsx|txt|xml|ya?ml)$/iu;

let input = '';
for await (const chunk of process.stdin) input += chunk;

let payload;
try {
  payload = JSON.parse(input);
} catch {
  process.exit(0);
}

const toolName = payload?.toolName ?? payload?.tool_name;
if (toolName !== 'AgentSwarm') process.exit(0);

const toolInput = payload?.toolInput ?? payload?.tool_input;
if (toolInput === null || typeof toolInput !== 'object' || Array.isArray(toolInput)) process.exit(0);

const items = toolInput.items;
if (items !== undefined && !Array.isArray(items)) {
  deny('AgentSwarm items must be an array.');
}

const itemEntries = items ?? [];
const promptTemplate = toolInput.prompt_template;
if (itemEntries.length > 0) {
  if (typeof promptTemplate !== 'string' || promptTemplate.trim().length === 0) {
    deny('AgentSwarm items require prompt_template: "{{item}}". Example: { "prompt_template": "{{item}}", "items": ["task A", "task B"] }.');
  }
  if (!promptTemplate.includes(ITEM_PLACEHOLDER)) {
    deny('AgentSwarm prompt_template must include the {{item}} placeholder.');
  }
}

const expandedPrompts = new Map();
let hasObjectItems = false;
for (const [index, value] of itemEntries.entries()) {
  const item = itemText(value);
  if (item === undefined || item.trim().length === 0) {
    deny(`AgentSwarm item ${String(index + 1)} must contain non-empty task text.`);
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    hasObjectItems = true;
  }

  if (typeof value === 'string' && isExplicitAliasLabel(item.trim())) {
    deny(
      `AgentSwarm string item ${String(index + 1)} looks like a model label, but string items never select models. Use { item: "task", model_alias: "provider/model" } instead.`,
    );
  }

  const prompt = promptTemplate.split(ITEM_PLACEHOLDER).join(item);
  const previousIndex = expandedPrompts.get(prompt);
  if (previousIndex !== undefined) {
    deny(
      `AgentSwarm items ${String(previousIndex)} and ${String(index + 1)} expand to the same prompt. Give each subagent a distinct task.`,
    );
  }
  expandedPrompts.set(prompt, index + 1);
}

if (!hasObjectItems) process.exit(0);

const capabilities = (process.env.KIMI_CODE_CAPABILITIES ?? '')
  .split(',')
  .map((capability) => capability.trim())
  .filter(Boolean);
if (capabilities.includes(CAPABILITY)) process.exit(0);

deny(
  'Object AgentSwarm items require the agent-swarm-item-models-v1 capability. Launch the multi-model swarm fork or use plain string items.',
);

function itemText(value) {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value.item;
  return undefined;
}

function isExplicitAliasLabel(value) {
  if (PARENTHESIZED_ALIAS.test(value)) return true;
  return EXACT_ALIAS.test(value) && !LIKELY_PATH_SUFFIX.test(value);
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}
