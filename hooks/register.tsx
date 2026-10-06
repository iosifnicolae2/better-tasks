import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, ToolCallInput } from 'claude-code'

import type { Activity, CacheStep, StatusCheck, Task, Teammate, TurnFacts } from '../types'
import { activityOf } from './activity'
import { realigned, rollOver } from './boundary'
import { subagentTtl } from './cache'
import { OFF_LINE } from './projectsetup'
import { addSource, hasTeamInstall, maySelfCommit, needsPin, pinCommit, pinnedTag, repoUrl, SHARED_SETTINGS, TEAM_COMMIT, TEAM_NO, TEAM_QUESTION, TEAM_SETTING, TEAM_YES, TEAMMATE_INSTALL, updateCommit, withTeamInstall } from './teaminstall'
import { activeInstall, declaresMarketplace, DECLINED_KEY, listArgv, lsRemoteArgv, MANAGED_SETTINGS, offeredRelease, pinTarget, refreshArgv, releaseTags, repinArgv, restartLine, UPDATE_HEADER, UPDATE_NO, UPDATE_YES, updateArgv, updateQuestion } from './updatecheck'
import type { Install } from './updatecheck'
import { excludeWorktrees, IDE_SETTING } from './intellij'
import { migrateFolder } from './migrate'
import { DEFAULT_TYPE, leadModelRules, teammateModelRules, teammateTypes } from './models'
import { CONTRIBUTE_POINTER, contributeSkillSettings, readUpstreamPr, saveUpstreamPr, UPSTREAM_PR_TOOL } from './contribute'
import { contextBlock, footerText, isPerson, isQuestion, resolvedIn, unclosedLine, unfiledLine, withRules } from './coordinator'
import { ENABLE_OPTION, QUESTION, SETTING_KEY, SETUP_TOAST, setupArgv, setupVerdict, videoPointer, videoSkillSettings, voiceDir } from './demovideo'
import { FLOW_ASK_HEADER, flowOfAnswer, flowOptions, flowQuestion, hasPrs, leadRules, lookAt, prBodyRules, prSkillSettings, recommend, teammateRules as flowRules, usesWorktree, WORKTREE_COMMAND_RULES } from './gitflow'
import type { GitFlow, Probe } from './gitflow'
import { instructionLines, instructionsBlock } from './instructions'
import { findPrTemplate } from './prtemplate'
import { coordinatorTestingRules, testingPointer, testingSkillSettings } from './testenv'
import { GH_UPDATE_TOAST, ghProblem, ghUpdateArgv, ghUpdateVerdict, hasGitHub, prCoordinatorRules, PR_TEAMMATE_RULES } from './pullrequest'
import type { Io } from './io'
import { PANE_COMMANDS, registerPane } from './pane'
import { registerScreen, SCREEN_COMMANDS, SCREEN_TOOLS } from './screen'
import { hasPointer, pointerPrompt, RESTART_TEXT, SETUP_PROMPT, teamsState, waitingLine } from './setup'
import { projectSettings, readOverrides, saveProjectValue } from './settings'
import type { Settings } from './settings'
import { sprintStart } from './sprints'
import { isOpen, listTasks, saveTask, today, whenOf } from './tasks'
import { contextTokens, isActive, predecessorOf, refreshTeam } from './team'
import { fillSkill, ourSkill } from './skills'
import type { SkillName } from './skills'
import { projectText } from './texts'
import { IGNORE_COMMIT, isNotIgnored, withIgnoreLine, WORKTREES_FOLDER } from './ignoreworktrees'
import { spawnTask, withSummary } from './spawn'
import { fingerprintOf, NO_CHECK, statusDecision, statusPrompt } from './status'
import { startupTips } from './tips'
import { runTool, TOOLS } from './tools'

// Wires the parts to the engine. `$` and the state refs stay in this file (the
// validator follows neither across an import); the parts get `ioOf($)`.
// Settings are read per call (settingsNow): the plugin's options with the project's config.json over them.

/** The tools that file a user's message: as a new task, or on an existing one. */
const FILING_TOOLS = ['task_create', 'task_update', 'task_note']

let pluginOptions: PluginOptions = {}
let loggedProblems = ''
let loggedMissing = ''
let loggedMissingTemplate = ''
let voiceSetup: Promise<void> | undefined
let ghUpdate: Promise<void> | undefined

const NO_OPTION = 'No'
/** A setup question waits for an empty prompt box this long (the user is not typing), checked every POLL_MS. */
const QUIET_MS = 2000
const POLL_MS = 250
/** Still typing after this long: the questions wait for the next session. */
const GIVE_UP_MS = 10 * 60_000

const tasksState = atom({ plugin: 'better-tasks', key: 'tasks' } as const, [] as Task[])
const teamState = atom({ plugin: 'better-tasks', key: 'team' } as const, [] as Teammate[])
const tokensState = atom({ plugin: 'better-tasks', key: 'tokens' } as const, {} as Record<string, number>)
const activityState = atom({ plugin: 'better-tasks', key: 'activity' } as const, {} as Record<string, Activity>)
const cacheStepsState = atom({ plugin: 'better-tasks', key: 'cacheSteps' } as const, {} as Record<string, CacheStep>)
const statusState = atom({ plugin: 'better-tasks', key: 'statusCheck' } as const, NO_CHECK as StatusCheck)
const noticeState = atom({ plugin: 'better-tasks', key: 'notice' } as const, '')
const footerState = atom({ plugin: 'better-tasks', key: 'footer' } as const, '')
const resolvedState = atom({ plugin: 'better-tasks', key: 'resolved' } as const, [] as string[])
/** The teammate agent types as last registered (JSON of their specs); '' until they are (models.ts). */
const typesState = atom({ plugin: 'better-tasks', key: 'teammateTypes' } as const, '')
const turnState = atom({ plugin: 'better-tasks', key: 'turn' } as const, { asked: false, filed: false, question: false, prompted: false } as TurnFacts)

export const register: Register = (on, options) => {
  pluginOptions = options
  registerPane(on, options)
  registerScreen(on, options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (await isOffHere($)) {
      await declareCommands($)
      $.ui.log(OFF_LINE)
      return started
    }
    await declareTools($)
    await declareCommands($)
    await useLongCache($).catch(error => logFailure($, 'the 1-hour cache', error))
    const moved = await migrateFolder(ioOf($)).catch(error => `better-tasks: moving the old task folder failed: ${error}`)
    if (moved) $.ui.log(moved)
    await keepWorktreesFromIde($).catch(error => logFailure($, 'excluding the worktrees in IntelliJ', error))
    if (!(await setUpTeams($))) return started
    await update($, typesState, () => '')
    await syncTeammateTypes($, await settingsNow($)).catch(error => logFailure($, 'the teammate agent types', error))
    if (e.isInteractive) await pointUserRules($).catch(error => logFailure($, 'the CLAUDE.md pointer', error))
    if (e.isInteractive) void startQuestions($).catch(error => logFailure($, 'the startup questions', error))
    const startedAt = await $.clock.now()
    await update($, statusState, () => ({ ...NO_CHECK, activeAt: startedAt }))
    await tick($).catch(error => logFailure($, 'the first refresh', error))
    $.clock.every(60_000, () => tick($))
    const tips = await startupTips(ioOf($), await settingsNow($)).catch(() => [])
    for (const line of tips) $.ui.log(line)
    return started
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const footer = await read($, footerState)
    return footer ? next({ ...e, props: { ...e.props, modes: [...e.props.modes, footer] } }) : next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await teamsOn($)) || (await isOffHere($))) return composed
    const settings = await settingsNow($)
    const testing = coordinatorTestingRules(settings.offScreen)
    const flow = leadRules(settings.gitFlow, binOf($), settings.devBranch, prCoordinatorRules(settings.openPrInBrowser, binOf($)))
    const models = (await read($, typesState)) ? leadModelRules(settings.models) : ''
    const instructions = await instructionsNow($, settings)
    const rules = [await projectText(ioOf($), 'coordinator'), models, testing, flow, instructions, CONTRIBUTE_POINTER].filter(Boolean).join('\n\n')
    return { sections: withRules(composed.sections, e.traits, e.tools, rules) }
  })

  // Our skills follow the settings in force: their path filled in, their settings under their title (skills.ts).
  on('skill.prompt', async ($, e, next) => {
    const computed = await next(e)
    const skill = ourSkill(e.skill)
    if (!skill) return computed
    return { text: fillSkill(computed.text, $.plugin.root, await skillSettings($, skill)) }
  })

  // A setting turned on in /config (composer) or on our settings page (turnedOn): set up what it needs.
  on('config.set', { key: /^better-tasks\./ }, async ($, e, next) => {
    const written = await next(e)
    if (written.value === true) void setUpTurnedOn($, e.key)
    return written
  })
  on('state.set', { plugin: 'better-tasks', key: 'turnedOn' }, async ($, e, next) => {
    const written = await next(e)
    void setUpTurnedOn($, `better-tasks.${(e.value as { field: string }).field}`)
    return written
  })

  on('prompt.submit', async ($, e, next) => {
    const isOwnCheck = e.origin.kind === 'plugin' && e.origin.name === 'better-tasks'
    if (isOwnCheck) {
      const unclosed = unclosedLine(await unclosedIds($))
      return next({ ...e, context: [...(e.context ?? []), await contextBlock(ioOf($), await settingsNow($), unclosed)] })
    }
    if (!isPerson(e.origin) || (await isOffHere($))) return next(e)
    const now = await $.clock.now()
    await update($, statusState, check => ({ ...check, activeAt: now, quiet: 0 }))
    const state = teamsState(await $.env.get('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'), (await $.settings.read()).env)
    if (state !== 'on') return next({ ...e, context: [...(e.context ?? []), waitingLine(state)] })
    const reminder = unfiledLine(await read($, turnState))
    await update($, turnState, () => ({ asked: false, filed: false, question: isQuestion(e.text), prompted: true }))
    const settings = await settingsNow($)
    await syncTeammateTypes($, settings).catch(() => undefined)
    const notices = [await read($, noticeState), unclosedLine(await unclosedIds($)), reminder].filter(Boolean).join('\n')
    const block = await contextBlock(ioOf($), settings, notices)
    await update($, noticeState, () => '')
    await showStatus($, settings)
    return next({ ...e, context: [...(e.context ?? []), block] })
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const answered = await next(e)
    if (e.agentId !== undefined) return answered
    await update($, turnState, facts => ({ ...facts, asked: true }))
    const resolved = resolvedIn((answered.result as { answers?: unknown } | undefined)?.answers, (await settingsNow($)).tasks.prefix)
    if (resolved.length > 0) await update($, resolvedState, ids => [...new Set([...ids, ...resolved])])
    return answered
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (!e.name || !(await teamsOn($)) || (await isOffHere($))) return next(e)
    const settings = await settingsNow($)
    const task = spawnTask(await listTasks(ioOf($)), e.prompt, e.name, settings.tasks.prefix)
    const named = task ? withSummary(e, task) : { description: e.description, prompt: e.prompt }
    const teammate = await projectText(ioOf($), 'teammate')
    const handover = await handoverOf($, e.name)
    const hasTypes = (await read($, typesState)) !== ''
    const type = e.subagent_type ?? (hasTypes ? DEFAULT_TYPE : undefined)
    const stuck = hasTypes ? teammateModelRules(settings.models, type) : ''
    const testing = testingPointer(settings.offScreen)
    const videos = settings.demoVideos ? videoPointer(settings.videoQuality) : ''
    const flow = flowRules(settings.gitFlow, binOf($), settings.devBranch, PR_TEAMMATE_RULES)
    const isWorktree = usesWorktree(settings.gitFlow, settings.worktree) && !e.isolation
    const commands = isWorktree || e.isolation === 'worktree' ? WORKTREE_COMMAND_RULES : ''
    const instructions = await instructionsNow($, settings)
    const prompt = [named.prompt, handover, teammate, stuck, testing, videos, flow, commands, instructions].filter(Boolean).join('\n\n')
    return next({
      ...e,
      description: named.description,
      prompt,
      ...(type === undefined ? {} : { subagent_type: type }),
      ...(isWorktree ? { isolation: 'worktree' as const } : {}),
    })
  })

  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const now = await $.clock.now()
      const text = activityOf(String(e.tool), e)
      await update($, activityState, all => ({ ...all, [agentId]: { text, at: now } }))
      await refreshTeam(ioOf($))
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, statusState, check => ({ ...check, busy: true, activeAt: now }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId === undefined) {
      const now = await $.clock.now()
      await update($, statusState, check => ({ ...check, busy: false, activeAt: now }))
    }
    if (agentId !== undefined) {
      await update($, activityState, ({ [agentId]: _ended, ...rest }) => rest)
      await refreshTeam(ioOf($))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    if (agentId !== undefined && result.usage) {
      const tokens = contextTokens(result.usage)
      const step = { at: await $.clock.now(), read: result.usage.cache_read_input_tokens, created: result.usage.cache_creation_input_tokens }
      await update($, tokensState, all => ({ ...all, [agentId]: tokens }))
      await update($, cacheStepsState, all => ({ ...all, [agentId]: step }))
      await refreshTeam(ioOf($))
    }
    return result
  })

  on('tool.call', { tool: 'mcp__better-tasks__task_create' }, ($, e) => serveTool($, e, 'task_create'))
  on('tool.call', { tool: 'mcp__better-tasks__task_update' }, ($, e) => serveTool($, e, 'task_update'))
  on('tool.call', { tool: 'mcp__better-tasks__task_list' }, ($, e) => serveTool($, e, 'task_list'))
  on('tool.call', { tool: 'mcp__better-tasks__sprint_goal' }, ($, e) => serveTool($, e, 'sprint_goal'))
  on('tool.call', { tool: 'mcp__better-tasks__team_status' }, ($, e) => serveTool($, e, 'team_status'))
  on('tool.call', { tool: 'mcp__better-tasks__project_init' }, ($, e) => serveTool($, e, 'project_init'))
  on('tool.call', { tool: 'mcp__better-tasks__task_note' }, ($, e) => serveTool($, e, 'task_note'))
  on('tool.call', { tool: 'mcp__better-tasks__task_search' }, ($, e) => serveTool($, e, 'task_search'))
  on('tool.call', { tool: 'mcp__better-tasks__upstream_pr' }, async ($, e) => {
    const answer = String((e as { answer?: unknown }).answer ?? 'ask')
    return { result: await saveUpstreamPr(ioOf($), await claudeDirOf($), answer) }
  })
}

/** The teammate agent types follow the settings: registered again when they change, in force from the next turn (models.ts). */
async function syncTeammateTypes($: EngineInterface, settings: Settings): Promise<void> {
  const types = teammateTypes(settings.models)
  const key = JSON.stringify(types)
  if (key === (await read($, typesState))) return
  for (const type of types) await $.agent.register(type)
  await update($, typesState, () => key)
}

/** Registers every tool and command on its own: one refusal (a taken name) leaves the rest working. */
async function declareTools($: EngineInterface): Promise<void> {
  for (const tool of [...TOOLS, ...SCREEN_TOOLS, UPSTREAM_PR_TOOL]) {
    await $.tool.register(tool).catch(error => logFailure($, `tool ${tool.name}`, error))
  }
}

/** The commands stay even where better-tasks is off: /better-tasks config is how to look and turn it on. */
async function declareCommands($: EngineInterface): Promise<void> {
  for (const command of [...PANE_COMMANDS, ...SCREEN_COMMANDS]) {
    await $.command.register(command).catch(error => logFailure($, `/${command.name}`, error))
  }
}

/** From the first run, whatever the git flow, IntelliJ skips .claude/worktrees/ (intellij.ts; on by default); a project without .idea/ is left as it is. */
async function keepWorktreesFromIde($: EngineInterface): Promise<void> {
  if (!(await settingsNow($)).excludeWorktreesFromIde) return
  const line = await excludeWorktrees(ioOf($), await ideaFilesOf($))
  if (line) $.ui.log(line)
}

/** The names in the project's .idea/; undefined when it has none (no JetBrains IDE). */
async function ideaFilesOf($: EngineInterface): Promise<string[] | undefined> {
  return $.fs.list(`${await $.session.root()}/.idea`).then(entries => entries.map(entry => entry.name), () => undefined)
}

function logFailure($: EngineInterface, what: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error)
  $.ui.log(`better-tasks: ${what} failed: ${reason}`)
}

/**
 * The 1-hour prompt cache for teammates and the main conversation (setting `longCache`), unless the user
 * chose a TTL already. Set in this process's environment, which Claude Code reads per request.
 */
async function useLongCache($: EngineInterface): Promise<void> {
  if (!(await settingsNow($)).longCache) return
  const chosen = await $.settings.read()
  if ((await $.env.get('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL')) === undefined && chosen.subagentPromptCacheTtl === undefined) {
    await $.env.set('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL', '1h')
  }
  if ((await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL')) === undefined && chosen.promptCacheTtl === undefined) {
    await $.env.set('CLAUDE_CODE_PROMPT_CACHE_TTL', '1h')
  }
}

/** For a successor ("login-2"): where its predecessor's transcript is. */
async function handoverOf($: EngineInterface, name: string): Promise<string> {
  const predecessor = predecessorOf(await refreshTeam(ioOf($)), name)
  return predecessor ? `${predecessor.name}'s transcript, to search: ${await transcriptOf($, predecessor.id)}` : ''
}

/** Where a teammate's transcript is: ~/.claude/projects/<project>/<session>/subagents/, the file named for its id. */
async function transcriptOf($: EngineInterface, agentId: string): Promise<string> {
  const home = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? '~'}/.claude`
  const project = (await $.session.root()).replace(/[^A-Za-z0-9]/g, '-')
  const folder = `${home}/projects/${project}/${await $.session.id()}/subagents`
  const files = await $.fs.list(folder).catch(() => [])
  const file = files.find(entry => entry.name.includes(agentId) && entry.name.endsWith('.jsonl'))
  return file ? `${folder}/${file.name}` : `${folder}/ (the .jsonl file whose name holds ${agentId})`
}

/** The user's Claude Code folder: CLAUDE_CONFIG_DIR, else ~/.claude. */
async function claudeDirOf($: EngineInterface): Promise<string> {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? '~'}/.claude`
}

/** The settings a skill follows, as lines for its "## Settings"; '' when it follows none. */
async function skillSettings($: EngineInterface, skill: SkillName): Promise<string> {
  if (skill === 'contribute') return contributeSkillSettings(await readUpstreamPr(ioOf($), await claudeDirOf($)))
  const settings = await settingsNow($)
  if (skill === 'pull-request') return prSkillSettings(settings.gitFlow, settings.devBranch, await prBodyNow($, settings))
  if (skill === 'video') return videoSkillSettings(settings.videoQuality)
  return skill === 'testing' ? testingSkillSettings(settings.offScreen, settings.testScreen) : ''
}

async function teamsOn($: EngineInterface): Promise<boolean> {
  return (await $.env.get('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS')) === '1'
}

/** Once per session: true when agent teams are on; else asks Claude to set them up, or says to restart. */
/** Once per machine: ask Claude to point the user's global CLAUDE.md at our team rules (the user approves the edit). */
async function pointUserRules($: EngineInterface): Promise<void> {
  if (await $.store.get('claudeMdAsked')) return
  const home = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? '~'}/.claude`
  const path = `${home}/CLAUDE.md`
  const text = await $.fs.read(path).catch(() => undefined)
  if (text !== undefined && hasPointer(text)) return
  await $.store.set('claudeMdAsked', true)
  void $.prompt.submit({ text: pointerPrompt(path, text !== undefined) }).catch(() => undefined)
}

/**
 * At startup, one after the other: the team question (or pinning a shared install), a newer release, then
 * asks once whether to turn on before/after videos, then which git flow
 * (only in a project with a GitHub remote, until one is saved in its config.json), then, with worktrees in an
 * IntelliJ project, whether IntelliJ may skip them. A setting already on gets what it needs.
 */
async function startQuestions($: EngineInterface): Promise<void> {
  if (await isOffHere($)) return
  await ignoreWorktrees($).catch(error => logFailure($, 'adding .claude/worktrees/ to .gitignore', error))
  await askTeamInstall($)
  await checkForUpdate($).catch(error => logFailure($, 'the update check', error))
  const settings = await settingsNow($)
  if (settings.demoVideos) {
    if (!(await isVoiceReady($))) await setUpVoice($)
  } else {
    await askToTurnOn($, { field: 'demoVideos', question: QUESTION, header: 'Videos' })
  }
  const { values } = await readOverrides(ioOf($))
  const isChosen = FLOW_KEYS.some(key => key in values) || settings.gitFlow !== 'direct'
  if (!isChosen) await askGitFlow($)
  else if (hasPrs(settings.gitFlow)) await checkGh($)
}

/** True when better-tasks is off in this project (the user said no to it here). */
async function isOffHere($: EngineInterface): Promise<boolean> {
  return !(await settingsNow($)).useBetterTasks
}

async function isGitRepo($: EngineInterface): Promise<boolean> {
  return $.process.run(['git', 'rev-parse', '--is-inside-work-tree']).then(done => done.exitCode === 0, () => false)
}

/**
 * In a git project whose shared settings don't have better-tasks yet: only me, or everyone on the project?
 * Shared unpinned (before pinning, or with autoUpdate): pinned to a release now, without asking.
 */
async function askTeamInstall($: EngineInterface): Promise<void> {
  const shared = await readShared($)
  if (needsPin(shared)) return pinShared($)
  if (hasTeamInstall(shared)) return
  if (await isGitRepo($)) await askToTurnOn($, { field: TEAM_SETTING, question: TEAM_QUESTION, header: 'Team', answers: [TEAM_YES, TEAM_NO] })
}

/** Adds better-tasks, pinned to a release, to the project's shared settings and commits only that file (teaminstall.ts). */
async function shareWithTeam($: EngineInterface): Promise<void> {
  const shared = await readShared($)
  if (needsPin(shared)) return pinShared($)
  if (hasTeamInstall(shared)) return
  const tag = await pinTagOf($, shared)
  if (tag === undefined) return $.ui.log(`better-tasks: could not find its latest release (offline?); not added to ${SHARED_SETTINGS} yet`)
  const changed = withTeamInstall(shared, tag)
  if (changed === undefined) return $.ui.log(`better-tasks: ${SHARED_SETTINGS} is not one JSON object; better-tasks was not added to it`)
  await $.fs.write(await sharedPath($), changed)
  const committed = await commitShared($, TEAM_COMMIT)
  if (committed.exitCode === 0) $.ui.log(`better-tasks: added to ${SHARED_SETTINGS}, pinned to ${tag}, and committed it. Push it; each teammate then installs it once: ${TEAMMATE_INSTALL}`)
  else $.ui.log(`better-tasks: added to ${SHARED_SETTINGS}, pinned to ${tag}, but committing it failed: ${committed.stderr.trim()}. Commit it yourself.`)
}

/** Shared unpinned: the marketplace pinned to the installed release, autoUpdate gone; committed when the git flow allows. */
async function pinShared($: EngineInterface): Promise<void> {
  const shared = await readShared($)
  const tag = await pinTagOf($, shared)
  const changed = tag === undefined ? undefined : withTeamInstall(shared, tag)
  if (tag === undefined || changed === undefined) return
  const hadEdits = await hasSharedEdits($)
  await $.fs.write(await sharedPath($), changed)
  const outcome = await selfCommit($, pinCommit(tag), hadEdits)
  $.ui.log(`better-tasks: pinned to ${tag} in ${SHARED_SETTINGS}, no auto-update (it took every new release unchecked). ${outcome}`)
}

/**
 * Startup: a release newer than the installed one or the project's pin is offered once per version (updatecheck.ts).
 * Yes moves the pin (when the project has one), updates the plugin and says to restart; No is not asked again.
 */
async function checkForUpdate($: EngineInterface): Promise<void> {
  const install = await installOf($)
  if (install === undefined) return
  const shared = await readShared($)
  const pinned = hasTeamInstall(shared) ? pinnedTag(shared) : undefined
  const offered = offeredRelease(await releasesOf($, shared), install.version, pinned, await $.store.get(DECLINED_KEY))
  if (offered === undefined) return
  const answer = await askSetup($, updateQuestion(offered), [UPDATE_YES, UPDATE_NO], UPDATE_HEADER)
  if (answer === UPDATE_NO) await $.store.set(DECLINED_KEY, offered)
  if (answer === UPDATE_YES) await updateTo($, offered, install)
}

async function updateTo($: EngineInterface, tag: string, install: Install): Promise<void> {
  const shared = await readShared($)
  const isPinnedHere = hasTeamInstall(shared) && pinnedTag(shared) !== undefined
  const hadEdits = await hasSharedEdits($)
  const run = async (argv: string[]) => $.process.run(argv, { cwd: await $.session.root(), timeoutMs: 180_000 })
  const isDeclared = await isDeclaredByUser($)
  const fetchArgv = isPinnedHere && !isDeclared ? repinArgv(addSource(shared), tag) : refreshArgv
  if (fetchArgv === undefined) return $.ui.log(`better-tasks: the better-tasks source in ${SHARED_SETTINGS} is not an owner/repo or https URL; update it yourself`)
  const moved = await run(fetchArgv)
  if (moved.exitCode !== 0) return $.ui.log(`better-tasks: could not fetch ${tag}: ${moved.stderr.trim()}`)
  if (isPinnedHere && isDeclared) await pinSharedTo($, shared, tag)
  const pinNote = isPinnedHere ? ` ${SHARED_SETTINGS} now pins ${tag}. ${await selfCommit($, updateCommit(tag), hadEdits)}` : ''
  const updated = await run(updateArgv(install.scope))
  const now = await installOf($)
  if (updated.exitCode !== 0 || now?.version !== tag.slice(1)) {
    return $.ui.log(`better-tasks: could not update to ${tag}: ${(updated.stderr || updated.stdout).trim()}. Try: ${updateArgv(install.scope).join(' ')}`)
  }
  $.ui.log(`${restartLine(tag)}${pinNote}`)
}

const sharedPath = async ($: EngineInterface) => `${await $.session.root()}/${SHARED_SETTINGS}`
const readShared = async ($: EngineInterface) => $.fs.read(await sharedPath($)).catch(() => undefined)

/** Writes the project's pin itself: `marketplace add` can't, when the user's settings declare the marketplace. */
async function pinSharedTo($: EngineInterface, shared: string | undefined, tag: string): Promise<void> {
  const pinned = withTeamInstall(shared, tag)
  if (pinned !== undefined) await $.fs.write(await sharedPath($), pinned)
}

/** True when the user's or managed settings declare the better-tasks marketplace (updatecheck.ts). */
async function isDeclaredByUser($: EngineInterface): Promise<boolean> {
  const files = [`${await claudeDirOf($)}/settings.json`, ...MANAGED_SETTINGS]
  const texts = await Promise.all(files.map(file => $.fs.read(file).catch(() => undefined)))
  return texts.some(declaresMarketplace)
}

/** The release to pin to: the installed one, or the repo's newest for a linked install (updatecheck.ts). */
async function pinTagOf($: EngineInterface, shared: string | undefined): Promise<string | undefined> {
  return pinTarget(await releasesOf($, shared), (await installOf($))?.version)
}

/** The release tags of the better-tasks repo the project uses (a fork's, when it names one); none offline. */
async function releasesOf($: EngineInterface, shared: string | undefined): Promise<string[]> {
  const listed = await $.process.run(lsRemoteArgv(repoUrl(shared)), { timeoutMs: 20_000 }).catch(() => undefined)
  return listed?.exitCode === 0 ? releaseTags(listed.stdout) : []
}

/** The install this session runs; undefined for a linked install (the user's own checkout). */
async function installOf($: EngineInterface): Promise<Install | undefined> {
  const listed = await $.process.run(listArgv, { timeoutMs: 30_000 }).catch(() => undefined)
  return listed?.exitCode === 0 ? activeInstall(listed.stdout, $.plugin.root, await $.session.root()) : undefined
}

async function hasSharedEdits($: EngineInterface): Promise<boolean> {
  const diff = await $.process.run(['git', '-C', await $.session.root(), 'diff', '--quiet', 'HEAD', '--', SHARED_SETTINGS])
  return diff.exitCode !== 0
}

/** Commits the shared settings alone. */
async function commitShared($: EngineInterface, message: string): Promise<{ exitCode: number; stderr: string }> {
  const git = async (...args: string[]) => $.process.run(['git', '-C', await $.session.root(), ...args])
  const added = await git('add', '--', SHARED_SETTINGS)
  return added.exitCode === 0 ? git('commit', '--quiet', '-m', message, '--only', '--', SHARED_SETTINGS) : added
}

/** A change better-tasks made on its own: committed when the git flow allows and the file had no other edits; returns the sentence saying which. */
async function selfCommit($: EngineInterface, message: string, hadEdits: boolean): Promise<string> {
  const settings = await settingsNow($)
  const branch = (await $.process.run(['git', '-C', await $.session.root(), 'symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim()
  if (hadEdits || !maySelfCommit(settings.gitFlow, branch, settings.devBranch)) return 'Commit it yourself.'
  const committed = await commitShared($, message)
  return committed.exitCode === 0 ? 'Committed; push it for your teammates.' : `Committing it failed: ${committed.stderr.trim()}. Commit it yourself.`
}

/** A git project's .gitignore gets .claude/worktrees/ once (ignoreworktrees.ts), committed alone; not from inside a worktree. */
async function ignoreWorktrees($: EngineInterface): Promise<void> {
  const root = await $.session.root()
  if (root.includes(`/${WORKTREES_FOLDER}`)) return
  const git = (...args: string[]) => $.process.run(['git', '-C', root, ...args])
  if (!isNotIgnored((await git('check-ignore', '-n', '-v', WORKTREES_FOLDER)).stdout)) return
  const hadEdits = (await git('diff', '--quiet', 'HEAD', '--', '.gitignore')).exitCode !== 0
  const path = `${root}/.gitignore`
  await $.fs.write(path, withIgnoreLine(await $.fs.read(path).catch(() => undefined), WORKTREES_FOLDER))
  if (hadEdits) return $.ui.log(`better-tasks: added ${WORKTREES_FOLDER} to .gitignore; it has your other edits too, so commit it yourself.`)
  const added = await git('add', '--', '.gitignore')
  const committed = added.exitCode === 0 ? await git('commit', '--quiet', '-m', IGNORE_COMMIT, '--only', '--', '.gitignore') : added
  if (committed.exitCode === 0) $.ui.log(`better-tasks: added ${WORKTREES_FOLDER} to .gitignore and committed it, so git status stops listing teammates' worktrees.`)
  else $.ui.log(`better-tasks: added ${WORKTREES_FOLDER} to .gitignore, but committing it failed: ${committed.stderr.trim()}. Commit it yourself.`)
}

/** The git flow question: the project looked at once for the recommendation, the answer saved in its config.json. */
/** A project that set any of these chose its flow already (the last two are the old switches). */
const FLOW_KEYS = ['gitFlow', 'pullRequests', 'worktree']

async function askGitFlow($: EngineInterface): Promise<void> {
  if (!(await hasGitHubRemote($))) return
  const recommended = recommend(await lookAt(await probeOf($)))
  const answer = await askSetup($, flowQuestion(recommended), flowOptions(recommended.flow), FLOW_ASK_HEADER)
  const flow = answer === undefined ? undefined : flowOfAnswer(answer)
  if (flow === undefined) return
  const problem = await saveProjectValue(ioOf($), 'gitFlow', flow)
  if (problem) $.ui.log(`better-tasks: ${problem}`)
  else await setUpFlow($, flow)
}

/** What a flow needs: gh for the PRs; for dev-prs, its branch, checked out here when made from this commit. */
async function setUpFlow($: EngineInterface, flow: GitFlow): Promise<void> {
  if (flow === 'dev-prs') await useDevBranch($, (await settingsNow($)).devBranch).catch(error => logFailure($, 'making the dev branch', error))
  if (hasPrs(flow)) await checkGh($)
  await keepWorktreesFromIde($)
}

/** Makes the dev branch at this commit and switches to it: the same commit, so no file changes. One that exists is left alone. */
async function useDevBranch($: EngineInterface, dev: string): Promise<void> {
  if (dev.startsWith('-')) return $.ui.log(`better-tasks: "${dev}" is not a branch name (devBranch in config.json)`)
  const git = (...args: string[]) => $.process.run(['git', ...args])
  if ((await git('branch', '--list', '--', dev)).stdout.trim()) {
    const current = (await git('symbolic-ref', '--quiet', '--short', 'HEAD')).stdout.trim()
    if (current !== dev) $.ui.log(`better-tasks: teammates land on ${dev}; this checkout is on ${current || 'no branch'}: git switch ${dev} when you're ready`)
    return
  }
  const switched = await git('switch', '--quiet', '--create', dev)
  if (switched.exitCode === 0) $.ui.log(`better-tasks: made the ${dev} branch here, from this commit: teammates land on it, PRs go to main`)
  else $.ui.log(`better-tasks: could not make the ${dev} branch: ${switched.stderr.trim()}`)
}

/** What looking at the project for the recommendation needs (gitflow.ts). */
async function probeOf($: EngineInterface): Promise<Probe> {
  return {
    root: await $.session.root(),
    run: (argv, timeoutMs) => $.process.run(argv, timeoutMs ? { timeoutMs } : undefined).then(done => done.stdout, () => undefined),
    list: path => $.fs.list(path),
    read: path => $.fs.read(path).catch(() => undefined),
  }
}

/** The project's instructions block (instructions.ts); a path that isn't there is one log line, once. */
async function instructionsNow($: EngineInterface, settings: Settings): Promise<string> {
  if (!settings.instructions) return ''
  const reader = { root: await $.session.root(), read: (path: string) => $.fs.read(path).catch(() => undefined), list: (path: string) => $.fs.list(path).catch(() => undefined) }
  const { lines, missing } = await instructionLines(reader, settings.instructions)
  const text = missing.join(', ')
  if (text && text !== loggedMissing) $.ui.log(`better-tasks: project instructions not found: ${text}`)
  loggedMissing = text
  return instructionsBlock(lines)
}

/** The PR description's rules, from the template it fills in (prtemplate.ts); a custom path that isn't there is one log line, once. */
async function prBodyNow($: EngineInterface, settings: Settings): Promise<string> {
  if (!hasPrs(settings.gitFlow)) return ''
  const template = await findPrTemplate(ioOf($), await $.session.root(), settings.prTemplate, $.plugin.root)
  const missing = template.missing ?? ''
  if (missing && missing !== loggedMissingTemplate) $.ui.log(`better-tasks: PR template not found: ${missing}; using ${template.path}`)
  loggedMissingTemplate = missing
  return prBodyRules(template)
}

/** The plugin's scripts folder (land.sh, task_pr.py, …). */
const binOf = ($: EngineInterface) => `${$.plugin.root}/bin`

/** A setting's on/off question: `field` is its key in the project's config.json. */
/** `answers`: the yes and no labels, when "Enable (recommended)" and "No" don't say what happens. */
type TurnOnQuestion = { field: string; question: string; header: string; answers?: [yes: string, no: string] }

/**
 * Asks once per project: the answer, on or off, is saved in its config.json, so another project is asked
 * at its own first start. Dismissed or answered in free text, it is asked again next session.
 * Enable also sets the setting up. Returns the answer just saved; undefined when none was.
 */
async function askToTurnOn($: EngineInterface, ask: TurnOnQuestion): Promise<boolean | undefined> {
  if (ask.field in (await readOverrides(ioOf($))).values) return undefined
  const [yes, no] = ask.answers ?? [ENABLE_OPTION, NO_OPTION]
  const answer = await askSetup($, ask.question, [yes, no], ask.header)
  if (answer !== yes && answer !== no) return undefined
  const problem = await saveProjectValue(ioOf($), ask.field, answer === yes)
  if (problem) {
    $.ui.log(`better-tasks: ${problem}`)
    return undefined
  }
  if (answer === yes) await setUpTurnedOn($, `better-tasks.${ask.field}`)
  return answer === yes
}

/**
 * A setup question pops up on its own, so a key meant for the prompt box could answer it: Enter picks the
 * highlighted option (the recommended one, first). So it waits until the user is not typing. Returns the
 * answer; undefined for a dismissal (asked again next session) or a user who never stopped typing.
 */
async function askSetup($: EngineInterface, question: string, options: string[], header: string): Promise<string | undefined> {
  if (!(await untilNotTyping($))) return undefined
  return $.ui.ask(question, { options, header }).catch(() => undefined)
}

/** True once the prompt box has stayed empty for QUIET_MS; false when that never happens within GIVE_UP_MS. */
async function untilNotTyping($: EngineInterface): Promise<boolean> {
  const start = await $.clock.now()
  let quietSince = start
  for (let now = start; now - start < GIVE_UP_MS; now = await $.clock.now()) {
    if ((await $.prompt.read()).text !== '') quietSince = now
    else if (now - quietSince >= QUIET_MS) return true
    await $.clock.sleep(POLL_MS)
  }
  return false
}

async function hasGitHubRemote($: EngineInterface): Promise<boolean> {
  return $.process.run(['git', 'remote', '-v']).then(done => hasGitHub(done.stdout), () => false)
}

/**
 * What a setting needs once turned on: the voice for videos; for a git flow chosen on the settings page, its setup;
 * worktrees in an IntelliJ project, the IntelliJ question; a yes to it, the exclusion now.
 */
async function setUpTurnedOn($: EngineInterface, key: string): Promise<void> {
  if (key === SETTING_KEY) await setUpVoice($)
  if (key === 'better-tasks.gitFlow') await setUpFlow($, (await settingsNow($)).gitFlow)
  if (['better-tasks.gitFlow', 'better-tasks.worktree', `better-tasks.${IDE_SETTING}`].includes(key)) await keepWorktreesFromIde($)
  if (key === `better-tasks.${TEAM_SETTING}`) await shareWithTeam($)
}

/** PR per task needs gh, 2.99 or newer for the video: updates it when it is missing or older (bin/gh-update.sh). */
async function checkGh($: EngineInterface): Promise<void> {
  const version = await $.process.run(['gh', '--version']).then(done => done.stdout, () => undefined)
  if (ghProblem(version)) await updateGh($)
}

/** One gh update at a time: turning the setting on while startup's runs joins it. */
function updateGh($: EngineInterface): Promise<void> {
  ghUpdate ??= runGhUpdate($)
    .catch(error => logFailure($, 'the gh update', error))
    .finally(() => (ghUpdate = undefined))
  return ghUpdate
}

async function runGhUpdate($: EngineInterface): Promise<void> {
  $.ui.toast(GH_UPDATE_TOAST, { timeoutMs: 8000 })
  let output = ''
  for await (const piece of $.process.spawn({ argv: ghUpdateArgv($.plugin.root) })) {
    if ('stream' in piece && piece.stream === 'stdout') output += piece.text
  }
  const verdict = ghUpdateVerdict(output)
  $.ui.toast(verdict.text, { timeoutMs: 8000 })
  if (!verdict.isReady) $.ui.log(verdict.text)
}

/** One Kokoro setup at a time (bin/kokoro-setup.sh): turning videos on twice joins the running one. */
function setUpVoice($: EngineInterface): Promise<void> {
  voiceSetup ??= runVoiceSetup($)
    .catch(error => logFailure($, 'the Kokoro voice setup', error))
    .finally(() => (voiceSetup = undefined))
  return voiceSetup
}

async function runVoiceSetup($: EngineInterface): Promise<void> {
  $.ui.toast(SETUP_TOAST, { timeoutMs: 8000 })
  let output = ''
  for await (const piece of $.process.spawn({ argv: setupArgv($.plugin.root) })) {
    if ('stream' in piece && piece.stream === 'stdout') output += piece.text
  }
  const verdict = setupVerdict(output)
  $.ui.toast(verdict.text, { timeoutMs: 8000 })
  if (!verdict.isReady) $.ui.log(verdict.text)
}

async function isVoiceReady($: EngineInterface): Promise<boolean> {
  const dir = voiceDir({
    custom: await $.env.get('BETTER_TASKS_KOKORO'),
    dataHome: await $.env.get('XDG_DATA_HOME'),
    home: await $.env.get('HOME'),
  })
  return $.fs.read(`${dir}/.ready`).then(() => true, () => false)
}

async function setUpTeams($: EngineInterface): Promise<boolean> {
  const state = teamsState(await $.env.get('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'), (await $.settings.read()).env)
  if (state === 'restart') {
    $.ui.toast(RESTART_TEXT)
    $.ui.status(RESTART_TEXT)
  }
  if (state === 'missing') {
    $.ui.status('better-tasks: agent teams are off')
    void $.prompt.submit({ text: SETUP_PROMPT })
  }
  return state === 'on'
}

function ioOf($: EngineInterface): Io {
  const io: Io = {
    root: () => $.session.root(),
    now: () => $.clock.now(),
    sessionId: () => $.session.id(),
    read: path => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    list: path => $.fs.list(path),
    publishTasks: tasks => update($, tasksState, () => tasks),
    agents: () => $.agent.list(),
    window: async () => (await $.session.usage()).context.window,
    tokens: () => read($, tokensState),
    activities: () => read($, activityState),
    publishTeam: team => update($, teamState, () => team),
    cacheSteps: () => read($, cacheStepsState),
    cacheTtl: async () =>
      subagentTtl({
        subagentEnv: await $.env.get('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL'),
        subagentSetting: (await $.settings.read().catch(() => ({}) as Record<string, unknown>)).subagentPromptCacheTtl,
        oneHourEnv: await $.env.get('ENABLE_PROMPT_CACHING_1H'),
        force5mEnv: await $.env.get('FORCE_PROMPT_CACHING_5M'),
      }),
    run: argv => $.process.run(argv),
    config: () => projectSettings(io, pluginOptions),
  }
  return io
}

function settingsNow($: EngineInterface): Promise<Settings> {
  return projectSettings(ioOf($), pluginOptions)
}

/** One dim line when the project's config.json has problems (each bad key is skipped, the rest still applies). */
async function logConfigProblems($: EngineInterface): Promise<void> {
  const { problems } = await readOverrides(ioOf($))
  const text = problems.join('; ')
  if (text === loggedProblems) return
  loggedProblems = text
  if (text) $.ui.log(`better-tasks: config.json: ${text}. Using the other settings.`)
}

async function serveTool($: EngineInterface, e: ToolCallInput, name: string) {
  const facts = await read($, turnState)
  const answer = await runTool(ioOf($), { name, input: e as never, facts, agentId: e.agentId }, await settingsNow($))
  const isFiling = FILING_TOOLS.includes(name) && e.agentId === undefined && !('deny' in answer)
  if (isFiling) await update($, turnState, turn => ({ ...turn, filed: true }))
  return answer
}

/** Sprint progress in the footer; the status line stays free for what needs attention. */
async function showStatus($: EngineInterface, settings: Settings): Promise<void> {
  const start = sprintStart(await today(ioOf($)), settings.sprint)
  const tasks = await read($, tasksState)
  await update($, footerState, () => footerText(tasks, start, settings.sprint))
}

/** Once a minute: a new sprint? then fresh tasks, team and status line. */
async function tick($: EngineInterface): Promise<void> {
  const settings = await settingsNow($)
  await logConfigProblems($)
  await checkSprint($, settings)
  await realign($, settings)
  await refreshTeam(ioOf($))
  await showStatus($, settings)
  await checkStatus($, settings).catch(error => logFailure($, 'the status check', error))
}

/** After a quiet spell with open work, one prompt asks the coordinator to move it forward (see status.ts). */
async function checkStatus($: EngineInterface, settings: Settings): Promise<void> {
  const now = await $.clock.now()
  const day = await today(ioOf($))
  const isNear = (task: Task) => isOpen(task) && ['now', 'this-sprint'].includes(whenOf(task, day, settings.sprint))
  const tasks = (await read($, tasksState)).filter(isNear)
  const team = (await read($, teamState)).filter(isActive)
  const check = await read($, statusState)
  const { fire, check: next } = statusDecision({
    now,
    every: settings.statusEvery,
    check,
    hasWork: tasks.length > 0 || team.length > 0,
    composerText: (await $.prompt.read().catch(() => ({ text: '' }))).text,
    fingerprint: fingerprintOf(tasks, team, await unclosedIds($)),
  })
  await update($, statusState, () => next)
  if (fire) void $.prompt.submit({ text: statusPrompt(Math.round((now - check.activeAt) / 60_000)) }).catch(() => undefined)
}

/** The tasks the user resolved that are still open; closed ones leave the list, so a reopened task is not closed again. */
async function unclosedIds($: EngineInterface): Promise<string[]> {
  const open = new Set((await listTasks(ioOf($))).filter(isOpen).map(task => task.id))
  const ids = (await read($, resolvedState)).filter(id => open.has(id))
  await update($, resolvedState, () => ids)
  return ids
}

/** Keeps every task on a sprint boundary when the sprint length or start day changes. */
async function realign($: EngineInterface, settings: Settings): Promise<void> {
  const current = sprintStart(await today(ioOf($)), settings.sprint)
  const tasks = await listTasks(ioOf($))
  for (const task of realigned(tasks, current, settings.sprint)) await saveTask(ioOf($), task)
}

async function checkSprint($: EngineInterface, settings: Settings): Promise<void> {
  const key = `sprint:${await $.session.root()}`
  const current = sprintStart(await today(ioOf($)), settings.sprint)
  const seen = (await $.store.get(key)) as string | undefined
  if (seen !== undefined && seen < current) {
    const rolled = await rollOver(ioOf($), seen, current, settings.sprint)
    $.ui.toast(rolled.toast)
    await update($, noticeState, () => rolled.notice)
  }
  if (seen !== current) await $.store.set(key, current)
}
