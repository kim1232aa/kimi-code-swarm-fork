# Kimi Code Multi-model AgentSwarm

A small fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) that lets each `AgentSwarm` item select its own configured model alias. This repository is independently maintained and is not the official Kimi Code distribution.

## Build and run

Requirements: Node.js 24.15+ and pnpm 10.33.0.

Clone and build once:

```bash
git clone https://github.com/kim1232aa/kimi-code-swarm-fork.git "$HOME/kimi-code-multimodel-swarm"
cd "$HOME/kimi-code-multimodel-swarm"
pnpm install --frozen-lockfile
pnpm run build:packages
pnpm -C apps/kimi-code run build
```

Launch the fork from any project directory with this one line:

```bash
KIMI_CODE_NO_AUTO_UPDATE=1 node "$HOME/kimi-code-multimodel-swarm/apps/kimi-code/dist/main.mjs" -m kimi-code/k3
```

`-m` selects the main Agent's initial model. Without it, Kimi Code uses `default_model` from `config.toml`; each `AgentSwarm` object item can still select a different configured alias through `model_alias`.

Verify the fork build:

```bash
KIMI_CODE_NO_AUTO_UPDATE=1 node "$HOME/kimi-code-multimodel-swarm/apps/kimi-code/dist/main.mjs" --version
```

Expected output:

```text
0.31.0+swarm.1
```

Do **not** run `kimi upgrade` for this source build. The official updater does not maintain this fork; update the checkout and rebuild it instead.

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

Routing precedence is:

1. Item `model_alias`
2. Top-level `model` selection (`primary` or `secondary`)
3. Agent profile, configured secondary model, or caller-model inheritance

There is no alias or thinking fallback. An unknown alias or unsupported explicit thinking level fails instead of silently switching models. Resumed subagents keep their recorded actual model; writing a model name in the resume prompt does not rebind them. To change a task's model, launch a new object item with the previous context included.

String items never select a model; they retain the normal profile, configured secondary-model, or caller-model behavior. Mentioning `provider/model-a` in ordinary task prose does not route to it. Use the object form whenever model selection matters.

Each child starts with its own context. Put relevant paths, constraints, known facts, and expected output in the task text; the child does not automatically receive the parent conversation.

## Optional workflow plugin

Inside this fork's TUI, install the plugin from the local checkout:

```text
/plugins install ~/kimi-code-multimodel-swarm/plugins/multi-model-swarm
```

Then run `/reload` or start a new session. The plugin adds:

- `/multi-model-swarm:run` — parse several `alias::task` sections and issue one routed swarm.
- `/multi-model-swarm:doctor` — check the fork capability and installed plugin version without reading model configuration or making network calls.
- `/multi-model-swarm:smoke` — after explicit confirmation, make exactly two real model calls.
- A `PreToolUse` guard that capability-gates object items and defensively rejects malformed or incomplete item calls before any child starts.

Example:

```text
/multi-model-swarm:run provider/model-a::review the API || provider/model-b@high::review the tests
```

The plugin is copied into Kimi Code's managed plugin directory at install time. After every source update, reinstall it from the checkout using the same `/plugins install ~/kimi-code-multimodel-swarm/plugins/multi-model-swarm` command, then run `/reload` or `/new`.

The fork itself works without the plugin. The plugin provides guidance, compatibility checks, and safer command shortcuts only. Its manifest keeps the startup guidance in `sessionStart.skill`; it does not add a system prompt.

## Update the source build

```bash
cd "$HOME/kimi-code-multimodel-swarm"
git pull --ff-only
pnpm install --frozen-lockfile
pnpm run build:packages
pnpm -C apps/kimi-code run build
```

After rebuilding, reinstall the plugin as described above. Keep launching through the `KIMI_CODE_NO_AUTO_UPDATE=1 node ...` command rather than `kimi upgrade`.

## Fork compatibility

The CLI exports these process variables for hooks and child commands:

- `KIMI_CODE_CAPABILITIES` includes `agent-swarm-item-models-v1`.
- `KIMI_CODE_SWARM_VERSION` contains the running fork version (`0.31.0+swarm.1` for this release).

Core changes are limited to per-item routing support in the agent engines, runtime compatibility metadata, and per-row requested/actual model display in the TUI. A scheduled CI workflow checks the fork against current upstream `main`; it never pushes or opens issues automatically.

## Development

```bash
pnpm exec vitest run apps/kimi-code/test/utils/multi-model-swarm-hook.test.ts apps/kimi-code/test/cli/version.test.ts apps/kimi-code/test/cli/main.test.ts apps/kimi-code/test/tui/components/messages/agent-swarm-progress.test.ts
pnpm --filter @moonshot-ai/kimi-code typecheck
pnpm -C apps/kimi-code run build
```

Real-provider smoke tests are intentionally not part of CI because they require credentials, network access, and quota.

## License

Released under the [MIT License](LICENSE). Upstream copyright remains with its respective authors.
