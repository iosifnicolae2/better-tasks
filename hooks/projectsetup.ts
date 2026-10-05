// The first setup questions in a project, once each (config.json): use better-tasks here at all
// (useBetterTasks), then who gets it (teaminstall.ts), then whether its task files go in git (tasksInGit).

export const USE_SETTING = 'useBetterTasks'
export const USE_YES = 'Yes, use it here'
export const USE_NO = 'No, not in this project'
export const USE_QUESTION = [
  'Use better-tasks in this project?',
  'Yes: it keeps this project\'s tasks as Markdown files in .claude/tasks/, shows the sprint board, and lets Claude ' +
    'hand work to teammates. A few more setup questions follow.',
  'No: better-tasks stays quiet here: no board, no task rules, no more questions. To turn it on later, set ' +
    `"${USE_SETTING}": true in .claude/tasks/config.json (or delete that line to be asked again), then restart Claude Code.`,
  'Use better-tasks here?',
].join('\n\n')

export const OFF_LINE = `better-tasks is off in this project ("${USE_SETTING}": false in .claude/tasks/config.json; set it to true and restart to turn it on)`

export const GIT_SETTING = 'tasksInGit'
export const GIT_YES = 'Yes, keep them in git (recommended)'
export const GIT_NO = 'No, keep them out of git'

/** The task folder's question; `folder` is where the task files live (.claude/tasks by default). */
export function gitQuestion(folder: string): string {
  return [
    `Keep the task files (${folder}/) in git?`,
    'Yes: they are committed like code, so the task history is kept and teammates see the same tasks.',
    `No: better-tasks adds ${folder}/ to .gitignore, so the tasks stay on this computer only.`,
    'Keep the task files in git?',
  ].join('\n\n')
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
