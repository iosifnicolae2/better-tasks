// PR per task (setting pullRequests): each teammate works in its own worktree and finishes with a GitHub
// pull request, its before/after video (demovideo.ts) playing in it; the lead merges once the user approves.
// The parts that need `$` (the gh check) are in register.tsx.

export const PR_SETTING_KEY = 'better-tasks.pullRequests'

/** `gh pr create --attach` uploads a video GitHub plays inline; it came in gh 2.99.0. */
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

export const PR_TEAMMATE_RULES = `## Pull request per task (on in this project)
You work in your own git worktree, on its own branch; the project's main checkout stays as it is. This setting is the user's ask for branches and PRs.
- Commit there as usual, small and often.
- Done: push to a short branch named for the task, \`git push -u origin HEAD:task/T-004\`, then open the PR against the branch the project's main checkout is on (usually main):
  \`gh pr create --base main --head task/T-004 --title "T-004 <task title>" --body-file <scratchpad>/pr.md\`
  The body, in plain words: what changed, how to test it, the task file path. With a demo video, put \`![Before/after video](<its absolute path>)\` where it belongs and add \`--attach <its absolute path>\`: gh uploads it and GitHub shows a player there. gh older than 2.99 has no --attach: leave the video out and say so in your notes.
- Your notes get the line "PR: <the url gh printed>".
- Request changes: commit and push to the same branch; the PR follows. A new video: \`gh pr edit <url> --body-file <scratchpad>/pr.md --attach <path>\`.
- Never merge it yourself: the lead merges once the user approves.`

export const PR_COORDINATOR_RULES = `## Pull request per task (on)
- A finished task's notes hold "PR: <url>". The Finishing question shows that url on a line of its own with nothing else on it, before the video link if there is one. "Mark as resolved" merges: its description says "merge the PR and close T-004".
- Mark as resolved: \`gh pr merge <url> --squash --delete-branch\`, then \`git pull --ff-only\` in the project, then close the task with the merge commit. The merge fails (a conflict)? The teammate updates its branch from main and pushes; then merge.
- Request changes: the teammate pushes to the same PR.`
