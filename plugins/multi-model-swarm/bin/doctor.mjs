import { readFile } from 'node:fs/promises';

const CAPABILITY = 'agent-swarm-item-models-v1';
const manifest = JSON.parse(await readFile(new URL('../kimi.plugin.json', import.meta.url), 'utf8'));
const pluginVersion = String(manifest.version ?? 'missing');
const forkVersion = process.env.KIMI_CODE_SWARM_VERSION?.trim() || 'missing';
const capabilities = (process.env.KIMI_CODE_CAPABILITIES ?? '')
  .split(',')
  .map((capability) => capability.trim())
  .filter(Boolean);
const capabilityAvailable = capabilities.includes(CAPABILITY);
const versionMatch = forkVersion !== 'missing' && forkVersion === pluginVersion;
const result = {
  capability: CAPABILITY,
  capabilityAvailable,
  forkVersion,
  pluginVersion,
  versionMatch,
};

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
  process.stdout.write([
    'Multi-model AgentSwarm doctor',
    `capability: ${capabilityAvailable ? 'PASS' : 'FAIL'} (${CAPABILITY})`,
    `fork_version: ${forkVersion}`,
    `plugin_version: ${pluginVersion}`,
    `version_match: ${versionMatch ? 'PASS' : 'WARN'}`,
  ].join('\n') + '\n');
}

if (!capabilityAvailable) process.exitCode = 1;
