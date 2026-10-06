
// The PR flows (gitflow.ts: worktree-prs, and dev-prs for the Finishing line): in worktree-prs each teammate
// works in its own worktree and finishes with a GitHub pull request, its before/after video (demovideo.ts)
// shown as a picture that opens the video with sound; the lead merges once the user approves.
// How a teammate opens and updates the PR is the pull-request skill; the prompt keeps a pointer.
// The parts that need `$` (the gh check and update) are in register.tsx; bin/gh-update.sh does the update.

/** `git remote -v` names a GitHub remote: only then is a PR per task possible. */
export const hasGitHub = (remotes: string) => /github\.com[:/]/.test(remotes)

/** `gh pr create --attach` uploads the video and its poster to GitHub; it came in gh 2.99.0. */
export const ATTACH_SINCE = [2, 99, 0] as const

/** What `gh --version` says about PRs with videos: undefined when gh will do. */
export function ghProblem(versionOutput: string | undefined): string | undefined {
  const match = versionOutput?.match(/gh version (\d+)\.(\d+)\.(\d+)/)
  if (!match) return 'PR per task needs the GitHub CLI: brew install gh, then gh auth login'
  const version = match.slice(1).map(Number)
  const index = version.findIndex((part, at) => part !== ATTACH_SINCE[at])
  const isOld = index !== -1 && (version[index] ?? 0) < ATTACH_SINCE[index]!
  return isOld ? `PR per task: gh ${version.join('.')} can't put the video in the PR; brew upgrade gh (2.99 or newer)` : undefined
}

export const GH_UPDATE_TOAST = 'Updating the GitHub CLI so PRs can carry their video: once, about a minute.'

export const ghUpdateArgv = (root: string) => ['/bin/sh', `${root}/bin/gh-update.sh`]

/** gh-update.sh's verdict, from its last line, checked again against the version it reports. */
export function ghUpdateVerdict(output: string): { isReady: boolean; text: string } {
  const last = output.trim().split('\n').pop() ?? ''
  const [word = '', ...rest] = last.split(' ')
  const version = rest.join(' ')
  if (word === 'failed:') return { isReady: false, text: `better-tasks: ${last}. PRs still work; their video goes on a branch.` }
  const problem = ghProblem(version)
  if (problem || !['ready', 'login'].includes(word)) {
    return { isReady: false, text: `better-tasks: ${problem ?? 'the gh update said nothing'}. PRs still work; their video goes on a branch.` }
  }
  const login = word === 'login' ? ' Sign in once: gh auth login.' : ''
  return { isReady: word === 'ready', text: `GitHub CLI updated (${version.split(' ')[2] ?? version}): PRs carry their video.${login}` }
}

