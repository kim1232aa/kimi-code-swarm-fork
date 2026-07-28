---
name: using-multi-model-swarm
description: Route AgentSwarm object items to explicit configured model aliases.
---

This fork extends `AgentSwarm.items` with strict object items:

```json
{"item":"task text","model_alias":"provider/model","thinking":"high"}
```

- `model_alias` must be an exact configured alias. Invalid aliases or explicit thinking levels fail; there is no model fallback.
- String items keep the normal profile, secondary-model, or caller-model behavior. Never put a model alias inside string item text: it does not select that model, and this fork rejects configured aliases there to prevent silent inheritance.
- Before claiming a routed run succeeded, verify each child wire's `config.update.modelAlias` or `llm.request.model`; TUI labels and task text are not routing evidence.
- Each child starts with its own context. Put all task-specific context, paths, constraints, and expected output in `item` or `prompt_template`.
- Prefer `/multi-model-swarm:run` for several routed tasks, `/multi-model-swarm:doctor` for a static compatibility check, and `/multi-model-swarm:smoke` only when the user approves two real provider calls.
