// Keeps JetBrains IDEs (IntelliJ, WebStorm, PyCharm...) from indexing teammate worktrees.
// Claude Code puts each worktree, a full copy of the repo, in <project>/.claude/worktrees/, so the IDE
// sees it as project content and re-indexes a whole copy each time one is made, merged or removed.
// Asked once per project at setup (worktrees on and a .idea folder): the answer is the project setting
// excludeWorktreesFromIde. When yes, each session start marks that folder as excluded in the .idea module file.

export const WORKTREES_DIR = '.claude/worktrees'

export const IDE_SETTING = 'excludeWorktreesFromIde'
export const IDE_YES = 'Exclude it (recommended)'
export const IDE_NO = 'Leave IntelliJ as it is'
export const IDE_QUESTION =
  'This project is open in IntelliJ (it has a .idea folder). Each teammate works in a full copy of the project under ' +
  `${WORKTREES_DIR}/, and IntelliJ re-indexes every copy, which makes it slow. May better-tasks mark that folder as ` +
  `Excluded in IntelliJ, so it skips it? Change it later in .claude/tasks/config.json ("${IDE_SETTING}").`

/** Ask only in an IntelliJ project (a .idea folder) whose teammates use worktrees, and only until the user answers. */
export function shouldAskIde(usesWorktree: boolean, ideaFiles: string[] | undefined, answer: boolean | undefined): boolean {
  return usesWorktree && ideaFiles !== undefined && answer === undefined
}

const EXCLUDE_LINE = `<excludeFolder url="file://$MODULE_DIR$/${WORKTREES_DIR}" />`

export type IdeFiles = {
  root: () => Promise<string>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
}

/** The module files .idea/modules.xml lists, as absolute paths. */
export function modulePaths(modulesXml: string, root: string): string[] {
  const paths = [...modulesXml.matchAll(/filepath="([^"]+)"/g)].map(match => match[1]!)
  return paths.map(path => path.replaceAll('$PROJECT_DIR$', root))
}

/** Where `$MODULE_DIR$` points for a module file: its folder, or the project for one inside .idea/. */
export function moduleDir(imlPath: string): string {
  const dir = imlPath.slice(0, imlPath.lastIndexOf('/'))
  return dir.endsWith('/.idea') ? dir.slice(0, -'/.idea'.length) : dir
}

/**
 * The module file with the worktrees folder excluded under its content root, when that root is
 * the project itself; undefined when there is nothing to change.
 */
export function withWorktreesExcluded(iml: string, isProjectModule: boolean): string | undefined {
  if (!isProjectModule || iml.includes(`$MODULE_DIR$/${WORKTREES_DIR}"`)) return undefined
  const open = /(<content url="file:\/\/\$MODULE_DIR\$")\s*>\n?/
  const closed = /(<content url="file:\/\/\$MODULE_DIR\$")\s*\/>/
  const indent = (iml.match(/^([ \t]*)<content url="file:\/\/\$MODULE_DIR\$"/m)?.[1] ?? '    ') + '  '
  if (open.test(iml)) return iml.replace(open, (_, start: string) => `${start}>\n${indent}${EXCLUDE_LINE}\n`)
  if (closed.test(iml)) return iml.replace(closed, (_, start: string) => `${start}>\n${indent}${EXCLUDE_LINE}\n${indent.slice(2)}</content>`)
  return undefined
}

/** The module file IntelliJ IDEA itself writes for a plain folder, with the worktrees excluded. */
export function folderModule(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<module type="JAVA_MODULE" version="4">
  <component name="NewModuleRootManager" inherit-compiler-output="true">
    <exclude-output />
    <content url="file://$MODULE_DIR$">
      ${EXCLUDE_LINE}
    </content>
    <orderEntry type="inheritedJdk" />
    <orderEntry type="sourceFolder" forTests="false" />
  </component>
</module>
`
}

export function modulesXml(imlName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="ProjectModuleManager">
    <modules>
      <module fileurl="file://$PROJECT_DIR$/.idea/${imlName}" filepath="$PROJECT_DIR$/.idea/${imlName}" />
    </modules>
  </component>
</project>
`
}

/**
 * A project whose modules come from a build tool (Gradle, Maven, sbt...) keeps them out of .idea;
 * writing a module file there would add a second one, so such projects are left alone.
 */
export function isBuildToolProject(ideaFiles: string[], miscXml: string): boolean {
  const toolFiles = ['gradle.xml', 'sbt.xml', 'bsp.xml', 'kotlinc.xml']
  const isTool = ideaFiles.some(name => toolFiles.includes(name))
  return isTool || /ExternalStorageConfigurationManager" enabled="true"|MavenProjectsManager/.test(miscXml)
}

/**
 * Marks .claude/worktrees as excluded in the project's IntelliJ module; returns the line to log when it
 * changed something. A project with no .idea/ is left as it is.
 */
export async function excludeWorktrees(files: IdeFiles, ideaFiles: string[] | undefined): Promise<string | undefined> {
  if (ideaFiles === undefined) return undefined
  const root = await files.root()
  const idea = `${root}/.idea`
  const modules = await files.read(`${idea}/modules.xml`).catch(() => undefined)
  if (modules === undefined) return excludeInNewModule(files, root, ideaFiles)
  for (const path of modulePaths(modules, root)) {
    const iml = await files.read(path).catch(() => undefined)
    const changed = iml === undefined ? undefined : withWorktreesExcluded(iml, moduleDir(path) === root)
    if (changed === undefined) continue
    await files.write(path, changed)
    return `better-tasks: IntelliJ now skips ${WORKTREES_DIR}/ (teammate worktrees), so they are not indexed`
  }
  return undefined
}

/** IntelliJ keeps a plain folder's module only in its cache until it is changed; this writes it, excluded. */
async function excludeInNewModule(files: IdeFiles, root: string, ideaFiles: string[]): Promise<string | undefined> {
  const misc = await files.read(`${root}/.idea/misc.xml`).catch(() => '')
  if (isBuildToolProject(ideaFiles, misc)) return undefined
  const imlName = `${root.slice(root.lastIndexOf('/') + 1)}.iml`
  if (ideaFiles.includes(imlName)) return undefined
  await files.write(`${root}/.idea/${imlName}`, folderModule())
  await files.write(`${root}/.idea/modules.xml`, modulesXml(imlName))
  return `better-tasks: IntelliJ now skips ${WORKTREES_DIR}/ (teammate worktrees), so they are not indexed`
}
