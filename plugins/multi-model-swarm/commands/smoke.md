---
description: Make two approved real calls to verify per-item model routing
---

Treat `$ARGUMENTS` as exactly two whitespace-separated configured model aliases. If there are not exactly two, show:

`/multi-model-swarm:smoke provider/model-a provider/model-b`

Before any provider call, use `AskUserQuestion` to confirm that the user approves network access and quota usage for these exact two aliases. If they do not approve, stop.

After approval, call `AgentSwarm` once, as the only tool call in that response, with `prompt_template: "{{item}}"` and exactly two object items. Bind the first item to the first alias and the second item to the second alias. Each task should return a short route marker and no tool calls. Report tool success or the exact routing error; never claim success from the requested alias alone.
