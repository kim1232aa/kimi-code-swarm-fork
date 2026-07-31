---
description: Check whether this CLI supports per-item AgentSwarm model routing
---

Run this local command once with `Bash`; it reads only the runtime capability/version environment and this installed plugin's manifest. Do not read `config.toml`, credentials, model aliases, or make network calls.

```bash
node "${KIMI_CODE_HOME:-$HOME/.kimi-code}/plugins/managed/multi-model-swarm/bin/doctor.mjs"
```

Report the command's `PASS`, `WARN`, or `FAIL` result exactly. If the managed plugin path is missing, tell the user to install or reinstall the plugin from the current source checkout; do not substitute a hard-coded version.
