// The PR flows (gitflow.ts: worktree-prs, and dev-prs for the Finishing line): in worktree-prs each teammate
// works in its own worktree and finishes with a GitHub pull request, its before/after video (demovideo.ts)
// shown as a picture that opens the video with sound; the lead merges once the user approves.
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

export const PR_TEAMMATE_RULES = `## Pull request per task (on in this project)
You work in your own git worktree, on its own branch; the project's main checkout stays as it is. This setting is the user's ask for branches and PRs.
- Commit there as usual, small and often.
- The project has no GitHub remote (\`git remote -v\`)? No PR: commit as usual and say so in your notes. A video goes on the videos branch (video rules) if the project has a remote; your notes get its link.
- Done: push to a short branch named for the task, \`git push -u origin HEAD:task/T-004\`, then open the PR against the branch the project's main checkout is on (usually main):
  \`gh pr create --base main --head task/T-004 --title "T-004 <task title>" --body-file <scratchpad>/pr.md\`
  The body: as "The PR's description" below says. With a demo video, show its poster (demo-video.sh made it next to the video, same name, .png) as a picture that opens the video, the browser playing it with sound. Put these two lines right after the request and why, the text line right under the picture (alone, GitHub turns the link into its muted player; GitHub drops target="_blank", so the line tells how to get a new tab):
  \`[![Before/after video: click to play it with sound](<poster's absolute path>)](<video's absolute path>)\`
  \`Click the picture to play the video with sound (Cmd-click or Ctrl-click: in a new tab).\`
  and add \`--attach <poster's absolute path> --attach <video's absolute path>\`: gh uploads both and points the picture and its link at them.
- gh can't attach (older than 2.99, or the upload failed)? Put the video on the videos branch (video rules: video-branch.sh) and use what it prints in the two lines, with no --attach: its links in the picture line, its last line as the text line.
- Your notes get the line "PR: <the url gh printed>".
- Request changes: commit and push to the same branch; the PR follows. A new video: the same two lines and \`gh pr edit <url> --body-file <scratchpad>/pr.md --attach <poster> --attach <video>\`.
- Never merge it yourself: the lead merges once the user approves.`

export const PR_COORDINATOR_RULES = `## Pull request per task (on)
- A finished task's notes hold "PR: <url>". In Finishing, that url goes above and in the question like every link (Finishing), labeled "PR #<number>" above, and no video link: the PR's picture opens the video. "Mark as resolved" merges: its description says "merge the PR and close T-004".
- Mark as resolved: \`gh pr merge <url> --squash --delete-branch\`, then \`git pull --ff-only\` in the project, then close the task with the merge commit. The merge fails (a conflict)? The teammate updates its branch from main and pushes; then merge.
- Request changes: the teammate pushes to the same PR.`
