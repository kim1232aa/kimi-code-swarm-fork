---
name: using-multi-model-swarm
description: Route AgentSwarm object items to explicit configured model aliases.
---

This fork extends `AgentSwarm.items` with strict object items:

```json
{"item":"task text","model_alias":"provider/model","thinking":"high"}
```

- `model_alias` must be an exact configured alias. Invalid aliases or explicit thinking levels fail; there is no model fallback.
- String items keep the normal profile, secondary-model, or caller-model behavior; an alias in ordinary task prose is just text and does not select that model. The plugin rejects only explicit alias labels (an item that is exactly an alias, or a parenthesized alias tag) and directs those calls to the object form.
- When calling `AgentSwarm` directly with `items`, always provide a non-empty `description`, `prompt_template: "{{item}}"`, and at least two distinct task items. The plugin defensively rejects missing templates, missing placeholders, empty task text, and duplicate expanded prompts before subagents start. Resume-only requests do not need a template.
- Before claiming a routed run succeeded, verify each child's actual model metadata; TUI requested-model labels and task text are not routing evidence.
- Resumed subagents keep their recorded actual model. Writing a model name in the resume prompt does not rebind them; to change a task's model, launch a new object item with the previous context included.
- Each child starts with its own context. Put all task-specific context, paths, constraints, and expected output in `item` or `prompt_template`.
- Prefer `/multi-model-swarm:run` for several routed tasks, `/multi-model-swarm:doctor` for a static compatibility check, and `/multi-model-swarm:smoke` only when the user approves two real provider calls.
