// Teammates' git worktrees live in .claude/worktrees/: at startup, a git project gets that folder in its
// .gitignore (once) and the change committed alone, so `git status` stops listing it.

export const WORKTREES_FOLDER = '.claude/worktrees/'
export const IGNORE_COMMIT = 'Keep agent worktrees (.claude/worktrees/) out of git'

/** True when `git check-ignore -n -v <folder>` printed a non-match ("::<tab>path"); anything else (a match, an error) is left alone. */
export function isNotIgnored(checkIgnoreOutput: string): boolean {
  return checkIgnoreOutput.startsWith('::')
}

/** The .gitignore text with the line added at the end, the rest kept. */
export function withIgnoreLine(gitignore: string | undefined, line: string): string {
  const text = gitignore ?? ''
  const separator = text === '' || text.endsWith('\n') ? '' : '\n'
  return `${text}${separator}${line}\n`
}
