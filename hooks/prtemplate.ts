import type { Files } from './io'

// The template a PR's description fills in: the path in config.json's "prTemplate", else the project's
// own where GitHub and GitLab look, else better-tasks' (templates/pull_request_template.md). better-tasks
// never adds its template to the repo by itself: the settings page does it when the user presses Enter.

/** Where GitHub looks for one template, in its order. */
export const TEMPLATE_FILES = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'pull_request_template.md',
  'PULL_REQUEST_TEMPLATE.md',
  'docs/pull_request_template.md',
  'docs/PULL_REQUEST_TEMPLATE.md',
]

/** Folders of several templates (GitHub's, GitLab's): their default.md, else the first .md. */
export const TEMPLATE_FOLDERS = ['.github/PULL_REQUEST_TEMPLATE', '.gitlab/merge_request_templates']

/** Where the settings page adds better-tasks' template to a project that has none. */
export const NEW_TEMPLATE = '.github/pull_request_template.md'

export const shippedTemplate = (pluginRoot: string) => `${pluginRoot}/templates/pull_request_template.md`

export type PrTemplate = {
  /** Absolute. */
  path: string
  /** custom: config.json's prTemplate; project: found in the repo; shipped: better-tasks' own. */
  source: 'custom' | 'project' | 'shipped'
  /** The custom path that isn't there (the others were looked at instead). */
  missing?: string
}

type Reader = Pick<Files, 'read' | 'list'>

const absolute = (root: string, path: string) => (path.startsWith('/') ? path : `${root}/${path}`)
const exists = (files: Reader, path: string) => files.read(path).then(() => true, () => false)

async function inFolder(files: Reader, folder: string): Promise<string | undefined> {
  const names = (await files.list(folder).catch(() => [])).map(entry => entry.name).filter(name => name.toLowerCase().endsWith('.md')).sort()
  const name = names.find(one => one.toLowerCase() === 'default.md') ?? names[0]
  return name === undefined ? undefined : `${folder}/${name}`
}

export async function findPrTemplate(files: Reader, root: string, custom: string, pluginRoot: string): Promise<PrTemplate> {
  const wanted = custom.trim()
  if (wanted && (await exists(files, absolute(root, wanted)))) return { path: absolute(root, wanted), source: 'custom' }
  const missing = wanted ? { missing: wanted } : {}
  for (const file of TEMPLATE_FILES) {
    if (await exists(files, `${root}/${file}`)) return { path: `${root}/${file}`, source: 'project', ...missing }
  }
  for (const folder of TEMPLATE_FOLDERS) {
    const found = await inFolder(files, `${root}/${folder}`)
    if (found) return { path: found, source: 'project', ...missing }
  }
  return { path: shippedTemplate(pluginRoot), source: 'shipped', ...missing }
}

/** The template's path as the settings page shows it: relative to the project. */
export function shownPath(template: PrTemplate, root: string): string {
  return template.path.startsWith(`${root}/`) ? template.path.slice(root.length + 1) : template.path
}
