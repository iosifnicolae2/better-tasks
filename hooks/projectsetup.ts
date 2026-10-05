// Per-project setup (config.json): who gets better-tasks (teaminstall.ts), then whether its task files go in
// git (tasksInGit), asked once each. useBetterTasks is not asked: false in config.json keeps better-tasks quiet here.

export const USE_SETTING = 'useBetterTasks'
export const OFF_LINE = `better-tasks is off in this project ("${USE_SETTING}": false in .claude/tasks/config.json; set it to true and restart to turn it on)`

export const GIT_SETTING = 'tasksInGit'
export const GIT_YES = 'Yes (recommended)'
export const GIT_NO = 'No'

/** The task folder's question; `folder` is where the task files live (.claude/tasks by default). */
export function gitQuestion(folder: string): string {
  return `Keep the task files (${folder}/) in git, so the team sees the same tasks?`
}

/** .gitignore's text with the folder added; undefined when it is ignored already. */
export function withIgnored(gitignore: string | undefined, folder: string): string | undefined {
  const entry = `${folder.replace(/^\/+|\/+$/g, '')}/`
  const lines = (gitignore ?? '').split('\n').map(line => line.trim().replace(/^\//, ''))
  if (lines.includes(entry) || lines.includes(entry.slice(0, -1))) return undefined
  const text = gitignore ?? ''
  const separator = text === '' || text.endsWith('\n') ? '' : '\n'
  return `${text}${separator}${entry}\n`
}
