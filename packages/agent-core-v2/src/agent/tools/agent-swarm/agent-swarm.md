Launch multiple subagents from one prompt template, existing agent resumes, or both.

Use AgentSwarm when many subagents should run the same kind of task over different inputs. The placeholder is exactly `{{item}}`. For example, with `prompt_template` set to `Review {{item}} for likely regressions.` and `items` set to `["src/a.ts", "src/b.ts"]`, AgentSwarm launches two new subagents with those two concrete prompts. For a few differently-shaped tasks, make separate `Agent` calls in one message instead.

Use `resume_agent_ids` to continue subagents that already exist from earlier work, such as ones that failed or timed out: map each agent id to the prompt for that resumed subagent (usually `continue` if no extra information is needed). You may combine `resume_agent_ids` with `items` in the same call to resume existing subagents and launch new ones. Do not duplicate resumed work in `items`. Resumed subagents always keep their originally bound model; writing a model name in the resume prompt does not rebind them. To change a task's model, launch a new object item with the previous context included.

String items keep the normal model binding: top-level `model`, profile preference, configured secondary model, or the caller's model. Object items never select a model just because their text mentions one. Use the strict object form only when an item needs its own model or thinking level:

```json
{"item":"task text","model_alias":"provider/model","thinking":"high"}
```

`model_alias` must be the exact configured model key. An invalid alias or unsupported thinking level is rejected, together with every other item preflight, before any subagent starts; there is no model fallback. Templates receive only the `item` text.

Each of these is enforced — a violation is rejected before any subagent starts: provide at least 2 `items` unless you pass `resume_agent_ids`; whenever `items` are present, `prompt_template` is required and must contain `{{item}}`; and the filled-in prompts must be distinct (two items that expand to the same prompt are rejected).

Use enough subagents to keep the work focused and parallel. AgentSwarm supports up to 128 subagents, and launches are queued automatically, so it is safe to split large tasks into many clear, independent items.

If `AgentSwarm` is called, that call must be the only tool call in the response.
