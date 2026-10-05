import { skillCall } from './skills'

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


/** A PR flow's last step in the teammate's prompt: the how-to is the pull-request skill (skills/pull-request). */
export const PR_DONE_LINE = `- The PR opens at done, before the user is asked, with its video: the \`${skillCall('pull-request')}\` skill (the done skill says when); that skill again when the lead asks you to update it. Never merge it yourself.`

export const PR_TEAMMATE_RULES = `## Pull request per task (on in this project)
You work in your own git worktree, on its own branch; the project's main checkout stays as it is. This setting is the user's ask for branches and PRs.
- Commit there as usual, small and often.
${PR_DONE_LINE}`

/** The openPrInBrowser setting's line: the PR, its video uploaded, is on screen and loaded when its question comes (never after the user approved). Its own line, so the dev-prs flow takes it too (finishingOf). */
export const openPrLine = (bin: string) =>
  `- A finished task with a PR: right before its question, run \`${bin}/open-pr.sh <url>\`: once the PR's video is uploaded it opens the PR in the default browser and waits a few seconds for the page to load; then ask. It says "not ready" (the video not uploaded yet): tell the teammate to finish its PR, and ask once it has. Never open it again after the user's answer.`

export const prCoordinatorRules = (openPrInBrowser: boolean, bin: string) => `## Pull request per task (on)
- A finished task's notes hold "PR: <url>"; its question links only the PR; the video's path and the PR sit above it, in Links. "Mark as resolved" merges: its description says "merge the PR and close T-004".${openPrInBrowser ? `\n${openPrLine(bin)}` : ''}
- Mark as resolved: \`gh pr merge <url> --squash --delete-branch\` (full tests still running: once they pass), then \`git pull --ff-only\` in the project, then close the task with the merge commit. The merge fails (a conflict)? Tell the teammate to update its PR; then merge.
- Request changes: the teammate pushes to the same PR.`
