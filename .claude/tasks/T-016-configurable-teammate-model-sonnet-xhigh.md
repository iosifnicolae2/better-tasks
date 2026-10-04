---
id: T-016
title: "Configurable teammate model: Opus low/medium/high for easy/normal/hard tasks"
sprint: 2026-10-05
urgent: false
status: done
owner: teammate-model
rolled: 0
order: 0
created: 2026-10-05
---
## Goal
User's request (verbatim): "allow ocnfiguring which model is used for teammates, by default use sonnet xhigh for easy and normal tasks and opus high for harder tasks or if the sonnet task is not achieving the goal, make these configurable"

What this means for the better-tasks plugin:
- New settings (in /better-tasks config, Claude Code's /config, and .claude/tasks/config.json, like the other settings):
  - default teammate model + effort: Sonnet 5.5, effort xhigh (easy and normal tasks);
  - hard-task model + effort: Opus 5.5, effort high (hard tasks: deep debugging, security, cross-cutting architecture);
  - escalation: when a Sonnet teammate isn't reaching the goal (fails, gets stuck, keeps going in circles), its successor runs on the hard-task model. Configurable on/off.
- The lead's Spawning rules (injected by the plugin) tell the lead which model and effort to pass when spawning, from these settings, and when to pick the hard-task model or escalate.
- Find out how a spawn can set the model and the effort level (Agent tool `model` param, agent definition frontmatter `model`/`effort`, e.g. the user's ~/.claude/agents/task-teammate.md which is Sonnet 5.5 xhigh). If effort can't be set per spawn, say how you handled it (e.g. the plugin ships its own agent definitions per model/effort).
- The user's global CLAUDE.md already says this as a personal rule; the plugin should make it a setting for everyone, with these defaults.

Done looks like: settings exist with these defaults, the lead rule uses them, tests cover them, committed on main (not pushed).

## Notes
- 2026-10-05: User changed the defaults: "no, use opus low for easy tasks, and med for normal and for hard use high, don't use sonnet as default". New defaults: easy tasks → Opus 5.5, effort low; normal tasks → Opus 5.5, effort medium; hard tasks → Opus 5.5, effort high. No Sonnet in the defaults (still pickable in the settings). Stuck or failing teammate: its successor moves one level up (easy→normal→hard). So three levels (easy/normal/hard), each with a configurable model + effort, instead of the earlier two.
- 2026-10-05: Superseded: the first build (two levels, Sonnet xhigh default; commits 531e333, ecd7813, 14e0219) was replaced by the three-level build below.
- 2026-10-05: Done, on main, not pushed. Commits: 4d09d18 (the three levels), b0667d7 (settings.svg regenerated). Earlier: 531e333, ecd7813, 14e0219 (the first, two-level build).

How a spawn sets model and effort: the Agent tool has a `model` param but no effort. The plugin registers one agent type per level at session start with $.agent.register (a type's definition carries both): `better-tasks:teammate-easy` (opus, low), `-normal` (opus, medium), `-hard` (opus, high). They follow the settings: registered again at the next message when a setting or config.json changes. Code: hooks/models.ts, hooks/register.tsx (syncTeammateTypes, the Agent tool.call hook, prompt.compose).

Settings (defaults): easyModel=opus, easyEffort=low, normalModel=opus, normalEffort=medium, hardModel=opus, hardEffort=high, escalate=true. Models: sonnet, opus, fable, haiku, inherit (the lead's own); efforts: low, medium, high, xhigh, max. Same places as the other settings: /better-tasks config (group "Teammate models", 7 rows), Claude Code /config ("Better Tasks: ..."), .claude/tasks/config.json.

Lead rule (appended after coordinator.md, like the video and PR rules, so a project's own coordinator.md keeps it): the lead picks the type, never `model`; easy (typo, text, small fix) -> teammate-easy; normal (ordinary feature or bug fix, and when unsure) -> teammate-normal; hard (deep debugging, security, several areas) -> teammate-hard. Escalation on: the successor of a teammate that fails, says it is stuck, goes in circles or gets the same fix asked twice moves one level up (easy -> normal -> hard); a hard one stays hard and the lead asks the user; a plain handover (high context, cold cache) keeps the type. Off: the successor keeps the type. Safety net: a named spawn with no subagent_type gets normal; a type the lead chose (also a user's own) is left alone; scouts untouched. A teammate below hard, escalation on, gets a "Stuck?" rule: write what it tried in the notes and tell the lead in one line. If registration fails: one log line, no rules, no rewrite.

Checked: 211 tests pass, tsc -p . 0 errors, claude plugin validate passes. Real runs (claude --plugin-dir, lead on haiku): the three types are in the agent list; a named spawn with no type ran on claude-opus-5-5 with "effort":"medium" in its transcript; teammate-easy ran on opus with "low"; (first build) the hard type ran on opus with "high".

To check as the user (after the next release is installed): 1) /better-tasks config: group "Teammate models", Enter cycles each value, the line at the bottom explains the row. 2) Ask the lead to start a teammate, then look in ~/.claude/projects/<project>/<session>/subagents/agent-*.meta.json and agent-*.jsonl: agentType better-tasks:teammate-normal, "model":"claude-opus-5-5", "effort":"medium". 3) Change Normal-task effort, send any message: the next spawn uses it.

Not verified: whether the lead follows the escalation rule in practice (rule text only; the judgement is the model's), and the settings page on the user's real devices (tested through the plugin test host and the regenerated settings.svg). Limits: effort follows the type, so a `model` passed on the spawn overrides the model but not the effort. Also fixed on the way: pane.test AUTH fixture `as const`, because Claude Code 2.1.289's types made tsc report an error there.

README line to pass on (README.md is off-limits to me): under Features, "- 🧠 **A model per task:** teammates run on Opus at low, medium or high effort for easy, normal or hard work; a stuck one is replaced by one a level up. Change them in settings."
- 2026-10-05: Resolved by the user. "Teammate models" settings: easy/normal/hard levels, each a model + effort (default Opus low/medium/high), one agent type per level; the lead picks the level; a stuck teammate's successor moves one level up (escalate, on by default). README line not added.
