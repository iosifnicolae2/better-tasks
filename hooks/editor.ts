import type { Editor } from './settings'

// Which command opens a file, for each editor setting. Pure: the pane reads the environment.

/** Facts about the app Claude runs inside, from its environment. */
export type HostApp = {
  /** macOS's __CFBundleIdentifier of the app that started the shell (com.jetbrains.intellij). */
  bundleId?: string
  /** TERMINAL_EMULATOR: "JetBrains-JediTerm" in a JetBrains terminal. */
  terminalEmulator?: string
  /** TERM_PROGRAM: "vscode" in VS Code and its forks. */
  termProgram?: string
  /** Whether the `idea` command is on PATH. */
  hasIdeaCli: boolean
}

const IDE_BUNDLE = /^(com\.jetbrains\.|com\.google\.android\.studio|com\.microsoft\.VSCode|com\.todesktop\.)/

export function openCommand(editor: Editor, file: string, host: HostApp): string[] {
  if (editor === 'auto') return autoCommand(file, host)
  if (editor === 'default') return ['open', file]
  if (editor === 'idea' && !host.hasIdeaCli) return ['open', '-a', 'IntelliJ IDEA', file]
  return [editor, file]
}

/** The IDE Claude runs inside (by its app id when macOS gave one), else the default app. */
function autoCommand(file: string, host: HostApp): string[] {
  if (host.bundleId !== undefined && IDE_BUNDLE.test(host.bundleId)) return ['open', '-b', host.bundleId, file]
  if (host.terminalEmulator?.startsWith('JetBrains')) return openCommand('idea', file, host)
  if (host.termProgram === 'vscode') return ['code', file]
  return ['open', file]
}
