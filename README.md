# Kimi Code Multi-model AgentSwarm

A small fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) that lets each `AgentSwarm` item select its own configured model alias. This repository is independently maintained and is not the official Kimi Code distribution.

## Build and run

Requirements: Node.js 24.15+ and pnpm 10.33.0.

Clone and build once, in one shell command:

```bash
git clone https://github.com/kim1232aa/kimi-code-swarm-fork.git "$HOME/kimi-code-swarm-fork" && cd "$HOME/kimi-code-swarm-fork" && pnpm install --frozen-lockfile && pnpm run build:packages && pnpm -C apps/kimi-code run build
```

Launch the fork from any project directory:

```bash
node "$HOME/kimi-code-swarm-fork/apps/kimi-code/dist/main.mjs" -m provider/main-model
```

Or create a temporary command for the current shell without changing configuration files:

```bash
kimi-swarm() { node "$HOME/kimi-code-swarm-fork/apps/kimi-code/dist/main.mjs" "$@"; }; kimi-swarm -m provider/main-model
```

- `-m` selects the main Agent's initial model.
- Without `-m`, Kimi Code uses `default_model` from `config.toml`.
- Each `AgentSwarm` object item can still select a different model through `model_alias`.

## Use per-item models

The extended `items` input accepts the original strings or strict objects:

```json
{
  "description": "Review two areas",
  "prompt_template": "{{item}}",
  "items": [
    { "item": "Review the API changes", "model_alias": "provider/model-a" },
    { "item": "Review the test changes", "model_alias": "provider/model-b", "thinking": "high" }
  ]
}
```

Routing precedence in the v2 engine is:

1. Item `model_alias`
2. Top-level `model` selection (`primary` or `secondary`)
3. Agent profile, configured secondary model, or caller-model inheritance

There is no alias or thinking fallback. An unknown alias or unsupported explicit thinking level fails with an error instead of silently switching models. Resumed subagents keep their recorded model.

String items never select a model. Writing `provider/model-a` inside string item text only looks like routing; this fork rejects configured aliases in string items so the child cannot silently inherit another model. Use the object form shown above.

Each child starts with its own context. Put relevant paths, constraints, known facts, and expected output in the task text; the child does not automatically receive the parent conversation.

## Optional workflow plugin

Install the plugin once from the local checkout by entering this single line inside the TUI, using your real absolute path:

```text
/plugins install /home/you/kimi-code-swarm-fork/plugins/multi-model-swarm
```

Then run `/reload` or start a new session. The plugin adds:

- `/multi-model-swarm:run` — parse several `alias::task` sections and issue one routed swarm.
- `/multi-model-swarm:doctor` — check the fork capability and version without reading model configuration or making network calls.
- `/multi-model-swarm:smoke` — after explicit confirmation, make exactly two real model calls.
- A `PreToolUse` guard that blocks object items when the running CLI lacks `agent-swarm-item-models-v1`; string items remain compatible.

Example:

```text
/multi-model-swarm:run provider/model-a::review the API || provider/model-b@high::review the tests
```

The fork itself works without the plugin. The plugin provides guidance, compatibility checks, and safer command shortcuts only.

## Fork compatibility

The CLI exports these process variables for hooks and child commands:

- `KIMI_CODE_CAPABILITIES` includes `agent-swarm-item-models-v1`.
- `KIMI_CODE_SWARM_VERSION` contains the fork version, currently `0.29.2+swarm.1`.

Core changes are intentionally limited to the v1/v2 item schema and binding path, plus explicit alias display in the native TUI panel. A scheduled CI workflow checks whether the patch still applies to current upstream `main`; it never merges, pushes, or opens issues automatically.

## Development

```bash
pnpm --filter @moonshot-ai/agent-core typecheck
pnpm --filter @moonshot-ai/agent-core-v2 typecheck
pnpm exec vitest run packages/agent-core/test/tools/builtin-current.test.ts packages/agent-core-v2/test/tool/tool.test.ts apps/kimi-code/test/tui/components/messages/agent-swarm-progress.test.ts
```

Real-provider smoke tests are intentionally not part of CI because they require credentials, network access, and quota.

## License

Released under the [MIT License](LICENSE). Upstream copyright remains with its respective authors.
