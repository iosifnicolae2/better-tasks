import { VIDEO_SIZE } from './demovideo'
import { hasPrs, usesWorktree } from './gitflow'
import { describeChoice, typeOf } from './models'
import type { Settings } from './settings'
import type { Sources, Vars } from './template'
import { render, templateOf } from './template'
import { VIRTUAL_SCREEN } from './testenv'

// The instruction texts are files, one per kind, in the plugin's .claude/better-tasks/ (template.ts says how
// they render and how a project overrides one). This file names them and gathers the values they read.

/** The plugin's folder of instruction templates, under its root. */
export const TEMPLATES_DIR = '.claude/better-tasks'

export const RULE_FILES = ['lead.md', 'teammate.md', 'status-check.md', 'done.md', 'testing.md', 'video.md', 'pull-request.md', 'contribute.md'] as const
export type RuleFile = (typeof RULE_FILES)[number]

/** Facts that aren't settings: the teammate being spawned, the plugin's paths, the PR template. */
export type Facts = {
  pluginRoot: string
  hasTypes: boolean
  upstreamPr: string
  prTemplate: string
  hasOwnPrTemplate: boolean
  /** The teammate being spawned works in its own worktree. */
  isWorktree: boolean
  /** The teammate being spawned is on the hard level (no "stuck" rule: it can't go up). */
  isHard: boolean
  idleMinutes: number
}

export const NO_FACTS: Facts = { pluginRoot: '${CLAUDE_PLUGIN_ROOT}', hasTypes: true, upstreamPr: 'ask', prTemplate: '', hasOwnPrTemplate: false, isWorktree: false, isHard: false, idleMinutes: 10 }

/** Every value a template may read. */
export function varsOf(settings: Settings, facts: Facts): Vars {
  const { models } = settings
  const isWorktree = facts.isWorktree || usesWorktree(settings.gitFlow, settings.worktree)
  return {
    gitFlow: settings.gitFlow,
    devBranch: settings.devBranch,
    hasPr: hasPrs(settings.gitFlow) || isWorktree,
    isWorktree,
    demoVideos: settings.demoVideos,
    videoQuality: settings.videoQuality,
    videoSize: VIDEO_SIZE[settings.videoQuality],
    offScreen: settings.offScreen,
    testScreen: settings.testScreen,
    isVirtualScreen: settings.testScreen === VIRTUAL_SCREEN,
    statusEvery: settings.statusEvery,
    openPrInBrowser: settings.openPrInBrowser,
    escalate: models.escalate,
    hasTypes: facts.hasTypes,
    easyType: typeOf('easy'),
    normalType: typeOf('normal'),
    hardType: typeOf('hard'),
    easyChoice: describeChoice(models.easy),
    normalChoice: describeChoice(models.normal),
    hardChoice: describeChoice(models.hard),
    isStuckRule: facts.hasTypes && models.escalate && !facts.isHard,
    pluginRoot: facts.pluginRoot,
    bin: `${facts.pluginRoot}/bin`,
    upstreamPr: facts.upstreamPr,
    prTemplate: facts.prTemplate,
    hasOwnPrTemplate: facts.hasOwnPrTemplate,
    idleMinutes: facts.idleMinutes,
  }
}

/** One instruction file, the project's override applied, rendered with these values. */
export async function renderRule(name: RuleFile, sources: Sources, vars: Vars): Promise<string> {
  return render(await templateOf(name, sources), vars)
}

// ---- A setting changed mid-session ----

/** The lead's rules as its system prompt shows them (fixed for the session), and both texts as last sent. */
export type RulesSent = { shown: string; lead: string; teammate: string }

type Change = { changed: string[]; dropped: string[] }

/** What the lead reads once after a setting changed: the sections that replace its own, and those for its running teammates. */
export function rulesChangedNote(lead: Change, teammate: Change): string {
  const parts = ['better-tasks: a setting changed. The sections below replace the ones with the same heading in your better-tasks rules.']
  if (lead.changed.length > 0) parts.push(lead.changed.join('\n\n'))
  if (lead.dropped.length > 0) parts.push(`No longer in force: ${lead.dropped.join(', ')}.`)
  if (teammate.changed.length + teammate.dropped.length > 0) {
    const dropped = teammate.dropped.length > 0 ? `\nNo longer in force: ${teammate.dropped.join(', ')}.` : ''
    parts.push(`Send each running teammate, as replacing the same sections of its rules:\n\n${teammate.changed.join('\n\n')}${dropped}`)
  }
  return parts.join('\n\n')
}
