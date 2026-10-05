const IDE_BUNDLE = /^(com\.jetbrains\.|com\.google\.android\.studio|com\.microsoft\.VSCode|com\.todesktop\.)/;
export function openCommand(editor, file, host) {
    if (editor === 'auto')
        return autoCommand(file, host);
    if (editor === 'default')
        return ['open', file];
    if (editor === 'idea' && !host.hasIdeaCli)
        return ['open', '-a', 'IntelliJ IDEA', file];
    return [editor, file];
}
/** The IDE Claude runs inside (by its app id when macOS gave one), else the default app. */
function autoCommand(file, host) {
    if (host.bundleId !== undefined && IDE_BUNDLE.test(host.bundleId))
        return ['open', '-b', host.bundleId, file];
    if (host.terminalEmulator?.startsWith('JetBrains'))
        return openCommand('idea', file, host);
    if (host.termProgram === 'vscode')
        return ['code', file];
    return ['open', file];
}
