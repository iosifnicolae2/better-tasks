import { WORKTREES_FOLDER } from './ignoreworktrees'

// A teammate's worktree without Claude Code's isolation checks (setting worktreeSandbox, off by default).
// With isolation "worktree", Claude Code refuses every command whose git it can't verify stays in the
// worktree (a subshell, a variable, a heredoc: "too complex to verify") and every edit of a main-checkout
// file, and those checks can't be turned off. So better-tasks makes the worktree itself, where
// `claude --worktree <name>` would (.claude/worktrees/<name>, branch worktree-<name>), and spawns the
// teammate without isolation, told to work in it. Its permission mode decides as for any agent.

export type OwnWorktree = { path: string; branch: string }

/** A teammate's name as a folder and branch name: lower case letters, digits and dashes. */
export function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'teammate'
}

export function ownWorktreeOf(root: string, name: string): OwnWorktree {
  const slug = slugOf(name)
  return { path: `${root}/${WORKTREES_FOLDER}${slug}`, branch: `worktree-${slug}` }
}

/** The worktrees `git worktree list --porcelain` names. */
export function worktreePaths(porcelain: string): string[] {
  return porcelain.split('\n').flatMap(line => (line.startsWith('worktree ') ? [line.slice('worktree '.length)] : []))
}

/**
 * Where a new worktree branches from, as Claude Code's: worktree.baseRef "head" → HEAD; else the remote's
 * default branch (`git rev-parse --abbrev-ref origin/HEAD`, "origin/main") when it is known, else HEAD.
 */
export function baseOf(baseRef: unknown, originHead: string): string {
  const remote = originHead.trim()
  return baseRef === 'head' || !remote.startsWith('origin/') ? 'HEAD' : remote
}

/** `git worktree add`'s arguments: a new branch from base, or the branch an earlier worktree left. */
export function addArgs(worktree: OwnWorktree, base: string, hasBranch: boolean): string[] {
  return hasBranch ? ['worktree', 'add', worktree.path, worktree.branch] : ['worktree', 'add', '-b', worktree.branch, worktree.path, base]
}

/** The files a new worktree gets copied in, as Claude Code's: gitignored ones that .worktreeinclude matches. */
export function includedFiles(ignored: string, matched: string): string[] {
  const isIgnored = new Set(ignored.split('\n').filter(Boolean))
  return matched.split('\n').filter(path => path && isIgnored.has(path))
}
