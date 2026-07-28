---
description: Run several AgentSwarm tasks on explicitly selected models
---

Parse `$ARGUMENTS` as two or more sections separated by `||`. Each section must be `MODEL_ALIAS[ @THINKING] :: TASK`. Trim whitespace around every field.

If parsing fails, explain this usage and do not call tools:

`/multi-model-swarm:run provider/model-a::review the API || provider/model-b@high::review the tests`

Reject empty aliases, empty tasks, duplicate resulting task prompts, and more than 128 sections. If more than 8 distinct aliases are requested, ask the user to confirm before continuing.

Call `AgentSwarm` once, as the only tool call in that response. Include a non-empty `description`, use `prompt_template: "{{item}}"`, and convert each section to an object item with `item`, `model_alias`, and optional `thinking`. State that routing has no fallback: an invalid alias or thinking level must fail rather than silently use another model.
