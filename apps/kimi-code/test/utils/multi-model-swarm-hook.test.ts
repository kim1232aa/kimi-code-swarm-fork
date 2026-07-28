import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const HOOK_PATH = join(
  import.meta.dirname,
  '../../../../plugins/multi-model-swarm/hooks/validate-agent-swarm.mjs',
);
const CAPABILITY = 'agent-swarm-item-models-v1';

function runHook(
  toolInput: unknown,
  capabilities?: string,
): { readonly allowed: boolean; readonly reason?: string } {
  const output = execFileSync(process.execPath, [HOOK_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      KIMI_CODE_CAPABILITIES: capabilities ?? '',
    },
    input: JSON.stringify({ toolName: 'AgentSwarm', toolInput }),
  });
  if (output.length === 0) return { allowed: true };
  const parsed = JSON.parse(output) as {
    readonly hookSpecificOutput?: { readonly permissionDecisionReason?: string };
  };
  return {
    allowed: false,
    reason: parsed.hookSpecificOutput?.permissionDecisionReason,
  };
}

describe('multi-model AgentSwarm PreToolUse guard', () => {
  it.each([
    {
      name: 'items without a prompt template',
      input: { items: ['task A', 'task B'] },
      reason: 'require prompt_template',
    },
    {
      name: 'a template without the item placeholder',
      input: { prompt_template: 'Review tasks', items: ['task A', 'task B'] },
      reason: 'must include the {{item}} placeholder',
    },
    {
      name: 'an empty object task',
      input: { prompt_template: '{{item}}', items: [{ item: '  ' }, 'task B'] },
      reason: 'item 1 must contain non-empty task text',
    },
    {
      name: 'duplicate expanded prompts',
      input: { prompt_template: 'Review {{item}}', items: ['task A', 'task A'] },
      reason: 'items 1 and 2 expand to the same prompt',
    },
    {
      name: 'a string item that is only a model alias',
      input: { prompt_template: '{{item}}', items: ['provider/model-a', 'task B'] },
      reason: 'looks like a model label',
    },
    {
      name: 'a string item with a parenthesized model alias label',
      input: { prompt_template: '{{item}}', items: ['Gemini（provider/model-a）', 'task B'] },
      reason: 'looks like a model label',
    },
  ])('denies $name', ({ input, reason }) => {
    const result = runHook(input, CAPABILITY);

    expect(result).toEqual({ allowed: false, reason: expect.stringContaining(reason) });
  });

  it('allows a resume-only call without a prompt template', () => {
    expect(
      runHook({
        resume_agent_ids: { 'agent-1': 'Continue the investigation' },
      }),
    ).toEqual({ allowed: true });
  });

  it('allows an object item when the fork capability is available', () => {
    expect(
      runHook(
        {
          prompt_template: '{{item}}',
          items: [
            { item: 'Review the API', model_alias: 'provider/model-a' },
            { item: 'Review the tests', model_alias: 'provider/model-b' },
          ],
        },
        CAPABILITY,
      ),
    ).toEqual({ allowed: true });
  });

  it('denies an object item when the fork capability is unavailable', () => {
    const result = runHook({
      prompt_template: '{{item}}',
      items: [
        { item: 'Review the API', model_alias: 'provider/model-a' },
        { item: 'Review the tests', model_alias: 'provider/model-b' },
      ],
    });

    expect(result).toEqual({
      allowed: false,
      reason: expect.stringContaining(CAPABILITY),
    });
  });

  it('allows ordinary task text that mentions an alias or a source path', () => {
    expect(
      runHook({
        prompt_template: '{{item}}',
        items: [
          'Check whether the documentation mentions provider/model-a',
          'Review src/agent-swarm.ts',
        ],
      }),
    ).toEqual({ allowed: true });
  });
});
