---
id: T-058
title: Instructions as short config-rendered templates in a .claude/ folder, one file per type, with project overrides
sprint: 2026-10-05
urgent: false
status: done
owner: bug-flow
rolled: 0
order: -7
created: 2026-10-06
---
## Goal
User's words: "create a task and work on it at the end so that you open for me a md file with all the instructions of better-tasks, skill.md, claude.md and so on which is loaded when the plugin is loaded by a user"

What it means:
- Make one Markdown file that collects every instruction text better-tasks puts in front of the model when a user has the plugin loaded:
  - the lead/coordinator rules the hooks inject;
  - the teammate rules;
  - every skills/*/SKILL.md;
  - the agent definitions (teammate-easy/normal/hard);
  - the CLAUDE.md block it adds;
  - the MCP server instructions and tool descriptions;
  - the prompt.submit context lines;
  - anything else injected.
- Each part is headed with where it comes from (file path, hook) and when it loads (always, lead only, teammate only, on skill load).
- Generate it from the source, not by hand, so it can be made again; a script is welcome.
- Open it for the user in their editor when done.

Timing: the user said "at the end", so start once T-057 (which changes these instructions) is merged. The file then shows the current text.

## Notes
Video: [T-058.mp4](../tasks_videos/T-058.mp4)
- 2026-10-06: Queued for bug-flow after T-057 is merged
- 2026-10-06: Done (commit 44a45cb). What changed:
  - docs/instructions.md (~530 lines): every instruction text better-tasks loads, each part headed with its Source and when it Loads: the lead's rules, a teammate's prompt, the context on each user message, the CLAUDE.md pointer, the three agent types, every skill (with its "Settings" filled in), the PR template, the tools (description and input), the commands. Grep `^## Part:`.
  - Generated, not hand-written: `bun scripts/instructions-doc.ts` runs the real hooks on a fake engine (scripts/instructions/dump.tsx, copied into a scratch plugin and run by `claude plugin test`), so the texts are exactly what the model gets. `--check` says whether it is current; `--open` opens it. CONTRIBUTING.md lists it.
  - Rendered with the defaults, videos on, and this repo's config.json (straight to main, off-screen on); the header says so. Other settings change some lines.
  - Checks: the generator runs twice the same (--check current); claude plugin test . 324 pass; tsc clean.
  - Not done: opening it in the user's editor myself (off-screen: the user's screen is theirs). The lead opens it: `open /Users/iosif/Documents/Projects/better-tasks/docs/instructions.md`.

### For the user
Links:
Local build (opened when you ask): open /Users/iosif/Documents/Projects/better-tasks/docs/instructions.md
Question:
T-058 One file with every better-tasks instruction
What changed: docs/instructions.md now holds every text better-tasks gives the lead and the teammates (rules, skills, tools, the CLAUDE.md section), each with where it comes from and when it loads. It is made from the code, so it can be remade any time.
To try it: ask me to open it.
Is everything OK?
- 2026-10-06: User's change request after reading docs/instructions.md (verbatim):
"improve the finishing, nd repalce it with a scenario how the task is handled, make sure to integrate also the 10 minutes timer to check for progress,  also simplify what is displayed to the user, usually you want to create the video with the requested fix/feature and after user approval, you can run the tests, PR tests and so on.. creating the video is like a functional test/integration test.. keep the instructions short and to the point, remove all the details and just guide the overall idea, as claude know usually what to do if the instructions are clear and short, also, git flow straitng to main or different settings, these must be rendered based on the config, and make sure that if the config is changed in the middle of a session you just send the new section to override the old one, but on a new startup the context is clean; make sure to keep these instructions in a docs flder, with if statements based on cofnigs so developers can evaluate them and propose fixes.. and then you can use them directly.. also, inside a project, when you want to override something, you can just create the same file, allow referencing and then just add additional things or completly repalce it.. make this the way to override the instructions or extend them.. not with file path configs and so on.. the file path can be referenced with @/ so that behaviour still can be used.. by default you will extend the instructions usually.. use something like jinja to render the conditional things.. or something lighter, make sure to cleanup all these instructions, make it clear easy to follow and shorter, kind of let the model know what is the best to be done, and you just present the principles or high level plan"

What this asks for:
1. **The instruction texts move into a docs folder.** They become the single source the plugin loads directly. They are templates: conditionals on config (git flow, videos, PR per task, off-screen and so on) use a light template syntax, Jinja-like or lighter. Developers can read them, evaluate them and propose fixes there. No more instruction text hard-coded in hooks.
2. **Config-dependent rendering.** Only the sections that match the current config are sent.
   - If the config changes mid-session, send just the re-rendered section, marked as overriding the old one.
   - A new session starts with a clean context, rendered once.
3. **Project overrides by file.** A project overrides or extends an instruction by creating a file with the same name in the project.
   - Extending is the default: the project text is added after the plugin's.
   - The project file can also fully replace the plugin's.
   - The plugin file can be referenced with @/... includes.
   - This replaces any file-path config settings for overrides.
4. **Rewrite everything shorter.** Give principles and a high-level plan, not step-by-step details; Claude knows what to do when the instructions are clear and short.
5. **The finishing section becomes a scenario of how a task is handled, end to end.** In that scenario:
   - A 10-minute progress-check timer is part of it.
   - The before/after video of the requested fix or feature is made first. It serves as the functional/integration test and is what the user sees.
   - Only after the user approves come the full tests, PR checks and so on.
   - Simplify what is shown to the user.
6. **docs/instructions.md** (the generated all-in-one view) stays, rendered from the new templates.

### Plan for the rework (2026-10-06, for the user to approve)
**Folder layout.** All instruction text moves out of the hooks into `docs/instructions/` (the hooks only render and send it):
- `lead.md`: who the lead is, filing, routing. Principles, short.
- `task-flow.md`: the scenario below; it replaces "Finishing".
- `teammate.md`: who a teammate is, its area, its notes.
- `parts/`: `git-flow.md`, `video.md`, `testing.md`, `bugs.md`, `models.md`, … included where needed.
- `skills/done.md`, `skills/video.md`, …: the skill bodies. `skills/*/SKILL.md` keeps only its name and description (Claude Code needs that) plus one include line.
- `docs/instructions.md` stays: the all-in-one view, generated from these files.

**Template syntax.** A small Jinja subset, no dependency (about 80 lines):
- `{% if gitFlow == "direct" %} … {% elif … %} … {% else %} … {% endif %}`
- `{{ devBranch }}` for a value; `{% include "parts/video.md" %}` for another file.
- A condition is a setting name (true or false), `==` or `!=` a string, `not`, `and`, `or`.
- A test renders every file under every git flow × videos × off-screen combination. It fails on an unknown setting or a tag left in the output.

**Project overrides, by file.** The project puts a file at the same path under `.claude/better-tasks/` (e.g. `.claude/better-tasks/task-flow.md`):
- By default its text is added after the plugin's.
- `replace: true` in its front matter replaces the plugin's text instead.
- `@/task-flow.md` on a line of its own pulls in the plugin's file at that point (so the override can wrap it), and `@./docs/x.md` pulls in a project file.
- Override files are templates too.
- This replaces today's `.claude/tasks/coordinator.md` / `teammate.md` overrides with their `<!-- extend -->` marker, and the `instructions` setting's list of paths. At the first start, existing ones are moved over once, with a one-line notice.

**Rendering, and changes mid-session.**
- At session start everything is rendered once from the config; the system prompt stays as rendered, so its cache holds.
- Before each user message, the sections are rendered again and compared with what was sent. A changed one (the git flow, videos, …) is sent once in that message's context: "Settings changed: this replaces the <name> section above". The lead also passes it to running teammates.
- A new session starts clean, with one render.

**The task scenario (`task-flow.md`), roughly:**
1. The user asks → the lead files a task and routes it to an owner.
2. The teammate captures the BEFORE, makes the change, runs quick checks.
3. The teammate records the before/after video on its build. That video is the functional test and the thing the user sees.
4. The lead shows the user the video and one short question: what changed, "OK?". One task per question, no jargon.
5. Every 10 quiet minutes (statusEvery) the lead checks progress: it nudges a silent or stuck teammate and asks about finished work.
6. The user says yes → the full tests, then the PR and its checks (per the git flow) → the lead merges and closes. The user asks for changes → back to step 2.
7. A bug found on the way → its own task, the same scenario, merged into main or into the task's branch.

**Shorter.** Every file gives the principles and the plan, not steps, aiming at half today's length. Details Claude knows by itself go.

**For the user to decide:**
(a) The override folder: `.claude/better-tasks/`, or keep `.claude/tasks/`?
(b) Should the skill bodies move into `docs/instructions/skills/`?
(c) Should the `instructions` setting be dropped (moved over automatically)?
- 2026-10-06: User: "and no, keep them in .claude/ in a special folder, with one file per instruction type.. so that they can be easily overwritten". So the templates don't go in docs/. They go in a dedicated folder under .claude/, with one file per instruction type (lead rules, teammate prompt, each skill and so on). A project overrides or extends one by putting a file with the same name in its own .claude/<same folder>/.
- 2026-10-06: The user's own words already answer the plan's questions:
- (a) The folder: the templates live in `.claude/better-tasks/` in the plugin, one file per instruction type, and a project overrides them at the same path, `.claude/better-tasks/`. Nothing goes in docs/instructions/. Only the generated all-in-one `docs/instructions.md` stays in docs/.
- (b) Yes: the skill bodies move into that folder too, one file per skill.
- (c) Yes: drop the `instructions` setting ("not with file path configs") and move existing overrides over automatically.
The rest of the plan stands. Build it.
- 2026-10-06: Building (the lead said to skip the plan). Design decisions:
  - Templates live in the plugin's `.claude/better-tasks/`, one file per instruction type: lead.md, teammate.md, status-check.md, and one per skill (done.md, testing.md, video.md, pull-request.md, contribute.md). The settings skill stays generated (it documents the settings).
  - Override: the project puts the same file name in its own `.claude/better-tasks/`. By default it extends (added after the plugin's text). `replace: true` in its front matter replaces it. `@/<file>` on a line of its own pulls in the plugin's file there; `@./<path>` pulls in a project file. Override files are templates too; HTML comments are notes for people and never reach the model. When the project is better-tasks itself (same folder), there's no double.
  - Template syntax: `{{ name }}`, `{% if cond %} / {% elif %} / {% else %} / {% endif %}`; cond = name, not, ==/!= "string", and/or. A line holding only a tag leaves no blank line. An unknown name is an error (the test fails), so a template can't silently drift from the settings.
  - Runtime reads the .md files directly through the engine (a plugin can't import .md). The tests can't read files, so `bun scripts/templates.ts` writes them into tests/templates.gen.ts for the fake engine (`--check` says when it is stale).
  - Mid-session: the lead's rules are rendered once at session start and stay as they are in the system prompt (cache kept). Before each user message they and the teammate rules are rendered again; a changed `## ` section is sent once in that message's context as replacing the old one, and the lead forwards teammate sections to running teammates. A new session starts clean.
  - Kept as is for now: the `instructions` setting (project rule files listed by path) and the .claude/tasks/ task-template.md and tips.md; the old .claude/tasks/coordinator.md and teammate.md overrides still read (follow-up: move them to .claude/better-tasks/).
- 2026-10-06: User, giving an example of the level of detail wanted: "for example for testing, you just have to say the principles.. setup an environment for testing like a user, use the best mcp tools to interact with it, setup them in the specified testing display..  test it like a user, identify bugs and unexpected problems and raise them to the user with a recorded video and so on". So the testing file (and every other one) states only principles like these:
- set up an environment to test like a user;
- use the best MCP tools to drive it, on the configured test display;
- test like a user;
- find bugs and surprises, and raise them to the user with a recorded video.
No step-by-step recipes.
- 2026-10-06: User on the video instructions (verbatim): "same for the video, create different screens, naration instructions.. write the explanation as a collegue is explaining the bug fix/feature, also you can include real recordings or just screenshtos, when movemenet is needed or advanced things, use recordings.. (also, make the rectangle, pointers and so on a bit smaller so i can see the items easier on the screen.. but you do this as default settings in the python script..)"

So:
- The video file states principles only:
  - separate screens or scenes;
  - narration written the way a colleague would explain the fix or feature;
  - screenshots are fine, but use real recordings when movement or something advanced needs showing.
- Also part of this task (the user chose to keep it here): make the highlight rectangles, pointers and other annotations a bit smaller, so the items on screen are easier to see. Do it as the new default values in the video Python script, not as an instruction.
- 2026-10-06: User's general rule (verbatim): "as a general rule, don't complicate the instructions with details, move the details as defaults in the scripts which will be used as cli tools, with light instructions of what's available".
So:
- Any detail in today's instructions (flags, sizes, paths, sequences) moves into the scripts (bin/*) as defaults. The scripts become CLI tools that do the right thing with no arguments, and each has a --help.
- The instruction files only say what tools are available and what each is for, in a line or so each.
- 2026-10-06: Rework done (commit e3a7ab6, on top of 44a45cb; neither pushed). What changed:
  - Every instruction is now a template in `.claude/better-tasks/`: lead.md, teammate.md, status-check.md, done.md, testing.md, video.md, pull-request.md, contribute.md. The hooks only render and send them; the rule texts in hooks/*.ts are gone. Each SKILL.md keeps its name and description; its text is the template.
  - Syntax (hooks/template.ts): `{{ name }}` and `{% if %}/{% elif %}/{% else %}/{% endif %}`, with not, and, or, ==/!=. An unknown name is an error; a test renders every file under every flow × videos × off-screen × model combination.
  - Overrides: the project's `.claude/better-tasks/<same name>` is added after the plugin's text; `replace: true` in its front matter replaces it; `@/<file>` pulls in the plugin's file, `@./<path>` a project file. A broken override is logged and left out. project_init and the settings page now offer `.claude/better-tasks/lead.md` and `teammate.md`; old `.claude/tasks/coordinator.md` and `teammate.md` overrides still read the same way as before.
  - Mid-session: the lead's rules are rendered at session start and stay in its system prompt. A changed setting → the next user message carries only the changed `## ` sections, once, plus the teammate sections for the lead to forward. A new session starts clean.
  - "Finishing" became "How a task goes": BEFORE → change → video (the functional test) → one short question → the 10-minute status check → after the yes, full tests and the PR, then merge and close; bugs follow the same path. The lead's rules went from about 75 to about 40 lines.
  - docs/instructions.md is regenerated from the templates; CONTRIBUTING and README say where the templates live and how to override one.
  - Checks: claude plugin test . 319 pass; tsc clean; templates/instructions-doc/settings-doc --check current; skills-check. Real session (`claude --plugin-dir <repo> -p`) in a scratch project: the rendered rules come through, and a project `.claude/better-tasks/lead.md` with an `{% if gitFlow == "direct" %}` line is added after them.
  - Not done / follow-ups: the `openPrInBrowser` setting and bin/open-pr.sh are no longer used by the rules (PRs now open after the yes); the `instructions` setting (project rule files by path) is kept; task-template.md and tips.md stay in .claude/tasks/. Video: at the finish.

- 2026-10-06: Principles rework done (commit abb677a, after e3a7ab6 and 44a45cb; none pushed). What changed:
  - Every template now states principles, not recipes (testing as the user's example). All 8 files total ~150 lines; the lead's rules ~45 lines. They name the tools in a line each; details live in the scripts.
  - Scripts as CLI tools with defaults: `--help` on land.sh, video-branch.sh, open-pr.sh, demo-video.sh (it shows the spec format), task_pr.py. `task_pr.py open <id> --here` opens a worktree's PR with its video, so the PR skill is one command for every flow.
  - Video defaults (bin/demo_video.py): thinner box lines, smaller arrow heads, label and subtitles; a box without an arrow gets one automatically. The video template says: separate scenes, narration like a colleague explaining, screenshots or real recordings when movement matters.
  - Dropped the `instructions` setting. At the first start a project's old `.claude/tasks/coordinator.md` / `teammate.md` move to `.claude/better-tasks/lead.md` / `teammate.md` (extend stays extend, a plain one gets `replace: true`), and an `instructions` value becomes a "Project rules" section in both; the key leaves config.json. One log line says what moved.
  - `openPrInBrowser` used again: the lead shows the PR before merging.
  - Checks: claude plugin test . 315 pass; tsc clean; skills-check, templates and instructions-doc current; a real session (`claude --plugin-dir`) shows the new rules plus a project override. A test video renders with the smaller marks and the automatic arrow.
  - Note: while checking the scripts I ran bin/away.sh --help, which turned the user's screens off until the next input (told the lead; away has since added --help).

- 2026-10-06: Finished: full tests pass (315). Video made with the new script defaults (smaller marks, automatic arrows): the old Finishing rules vs the new lead.md template, then a project override. Straight to main: no PR; commits 44a45cb, e3a7ab6, abb677a are final.

- 2026-10-06: land.sh index bug fixed (commit 3b5b5ae). Cause: after committing, land.sh refreshed the shared index for its paths with `git reset`, but silently gave up when another git command held index.lock, leaving the commit staged as reverted. Now it waits up to 10 s for the lock (one reset for all its paths) and, if still locked, prints the exact `git reset -q -- <paths>` to run. Reproduced and checked in a scratch repo with a held lock; a peer's unstaged change stays untouched. The video has the before/after of it as its last scene. Full tests pass (315).

### For the user
Links:
Local result: [.claude/better-tasks/](file:///Users/iosif/Documents/Projects/better-tasks/.claude/better-tasks/) (the templates) and [docs/instructions.md](file:///Users/iosif/Documents/Projects/better-tasks/docs/instructions.md) (all of them rendered). Live: `claude --plugin-dir /Users/iosif/Documents/Projects/better-tasks` in a new session.
Question:
T-058 Short instruction templates you can override
What changed: each instruction is a short file of principles in .claude/better-tasks/, filled in from your settings; a project adds to one, or replaces it, with a file of the same name. The details moved into the scripts as defaults (each has --help). Videos have smaller boxes and arrows by default.
To try it: open the folder and docs/instructions.md.
Is everything OK?
- 2026-10-06: User accepted T-058 and said to fix the land.sh bug bug-flow found "in the same task". The bug: after land.sh commits, the shared index can keep the old versions of those files, so `git status` shows "MM" and `git diff --cached` shows a staged revert. A plain `git commit` would undo it. Fix it as part of the finish, with its before/after in the video.
- 2026-10-06: Instructions are short principle templates in .claude/better-tasks/ rendered from settings, overridable per project by file; details moved into script defaults with --help; smaller video marks; docs/instructions.md generated; land.sh index-lock fix
