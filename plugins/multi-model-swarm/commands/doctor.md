---
description: Check whether this CLI supports per-item AgentSwarm model routing
---

Run one local `Bash` command that reads only `KIMI_CODE_CAPABILITIES` and `KIMI_CODE_SWARM_VERSION` from the process environment. Do not read `config.toml`, credentials, model aliases, or make network calls.

Report:

- `PASS` when `KIMI_CODE_CAPABILITIES`, split on commas and trimmed, contains `agent-swarm-item-models-v1`.
- The exact `KIMI_CODE_SWARM_VERSION`, or `missing`.
- `WARN` when the capability exists but the runtime version differs from this plugin version, `0.29.2+swarm.1`.
- `FAIL` when the capability is absent, with the instruction to launch the fork rather than official Kimi Code.
