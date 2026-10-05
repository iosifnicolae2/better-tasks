import { describe, expect, test } from 'claude-code/testing'

import { excludeWorktrees, folderModule, IDE_QUESTION, IDE_SETTING, isBuildToolProject, moduleDir, modulePaths, withWorktreesExcluded } from '../hooks/intellij'
import type { IdeFiles } from '../hooks/intellij'

const ROOT = '/Users/a/shop'
const EXCLUDE = '<excludeFolder url="file://$MODULE_DIR$/.claude/worktrees" />'

const IDEA_MODULE = `<?xml version="1.0" encoding="UTF-8"?>
<module type="JAVA_MODULE" version="4">
  <component name="NewModuleRootManager" inherit-compiler-output="true">
    <exclude-output />
    <content url="file://$MODULE_DIR$" />
    <orderEntry type="inheritedJdk" />
  </component>
</module>
`

const WEB_MODULE = `<?xml version="1.0" encoding="UTF-8"?>
<module type="WEB_MODULE" version="4">
  <component name="NewModuleRootManager">
    <content url="file://$MODULE_DIR$">
      <excludeFolder url="file://$MODULE_DIR$/dist" />
    </content>
  </component>
</module>
`

const modulesXml = (filepath: string) =>
  `<project version="4"><component name="ProjectModuleManager"><modules><module fileurl="file://${filepath}" filepath="${filepath}" /></modules></component></project>`

function memory(seed: Record<string, string>): IdeFiles & { files: Map<string, string> } {
  const files = new Map(Object.entries(seed))
  return {
    files,
    root: async () => ROOT,
    read: async path => files.get(path) ?? Promise.reject(new Error(`ENOENT ${path}`)),
    write: async (path, text) => void files.set(path, text),
  }
}

describe('IntelliJ skips the teammate worktrees', () => {
  test('a self-closing content root opens up to hold the exclude', () => {
    const changed = withWorktreesExcluded(IDEA_MODULE, true)!
    expect(changed).toContain(`<content url="file://$MODULE_DIR$">\n      ${EXCLUDE}\n    </content>`)
    expect(changed).toContain('<orderEntry type="inheritedJdk" />')
  })

  test("an open content root keeps its own excludes and gets this one", () => {
    const changed = withWorktreesExcluded(WEB_MODULE, true)!
    expect(changed).toContain(`<content url="file://$MODULE_DIR$">\n      ${EXCLUDE}\n      <excludeFolder url="file://$MODULE_DIR$/dist" />`)
  })

  test('done once: an excluded module, or one rooted elsewhere, is left alone', () => {
    expect(withWorktreesExcluded(withWorktreesExcluded(IDEA_MODULE, true)!, true)).toBeUndefined()
    expect(withWorktreesExcluded(IDEA_MODULE, false)).toBeUndefined()
    expect(withWorktreesExcluded('<module><component name="NewModuleRootManager" /></module>', true)).toBeUndefined()
  })

  test('$MODULE_DIR$ of a module file in .idea/ is the project', () => {
    expect(moduleDir(`${ROOT}/.idea/shop.iml`)).toBe(ROOT)
    expect(moduleDir(`${ROOT}/shop.iml`)).toBe(ROOT)
    expect(moduleDir(`${ROOT}/api/api.iml`)).toBe(`${ROOT}/api`)
    expect(modulePaths(modulesXml('$PROJECT_DIR$/.idea/shop.iml'), ROOT)).toEqual([`${ROOT}/.idea/shop.iml`])
  })

  test("the project's module file gets the exclude", async () => {
    const io = memory({ [`${ROOT}/.idea/modules.xml`]: modulesXml('$PROJECT_DIR$/shop.iml'), [`${ROOT}/shop.iml`]: IDEA_MODULE })
    expect(await excludeWorktrees(io, ['modules.xml', 'workspace.xml'])).toContain('IntelliJ now skips .claude/worktrees/')
    expect(io.files.get(`${ROOT}/shop.iml`)).toContain(EXCLUDE)
    expect(await excludeWorktrees(io, ['modules.xml', 'workspace.xml'])).toBeUndefined()
  })

  test('a plain folder project (its module only in the IDE cache) gets the module file IntelliJ would write', async () => {
    const io = memory({ [`${ROOT}/.idea/misc.xml`]: '<project><component name="ProjectRootManager" /></project>' })
    expect(await excludeWorktrees(io, ['misc.xml', 'vcs.xml', 'workspace.xml'])).toContain('IntelliJ now skips')
    expect(io.files.get(`${ROOT}/.idea/shop.iml`)).toBe(folderModule())
    expect(io.files.get(`${ROOT}/.idea/modules.xml`)).toContain('filepath="$PROJECT_DIR$/.idea/shop.iml"')
  })

  test('no .idea/, or modules from Gradle or Maven: nothing is written', async () => {
    const io = memory({ [`${ROOT}/.idea/misc.xml`]: '<component name="ExternalStorageConfigurationManager" enabled="true" />' })
    expect(await excludeWorktrees(io, undefined)).toBeUndefined()
    expect(await excludeWorktrees(io, ['misc.xml', 'workspace.xml'])).toBeUndefined()
    expect(await excludeWorktrees(memory({}), ['gradle.xml', 'misc.xml'])).toBeUndefined()
    expect(isBuildToolProject(['misc.xml'], '<component name="MavenProjectsManager">')).toBe(true)
    expect(io.files.size).toBe(1)
  })
})

test('the IntelliJ question says why in plain words and where to change it', () => {
  expect(IDE_QUESTION).toContain('re-indexes every copy')
  expect(IDE_QUESTION).toContain(IDE_SETTING)
})
