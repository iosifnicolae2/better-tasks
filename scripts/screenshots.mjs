#!/usr/bin/env node
// Draws the README's pictures: runs the plugin's tests, takes each "SCREENSHOT {json}" line that
// tests/screenshots.test.ts prints (the pane's real tree), lays it out on a grid of terminal cells
// and writes docs/screenshots/<name>.svg in Claude Code's dark theme: the whole terminal in the
// fullscreen layout, Claude Code on the left (a hand-written scene per picture, see SCENES) and the
// real pane docked on the right. Usage: node scripts/screenshots.mjs

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs', 'screenshots')

// Claude Code's dark theme, as its binary spells it.
const THEME = {
  text: 'rgb(255,255,255)',
  claude: 'rgb(215,119,87)',
  suggestion: 'rgb(177,185,249)',
  success: 'rgb(78,186,101)',
  warning: 'rgb(255,193,7)',
  error: 'rgb(255,107,128)',
  subtle: 'rgb(80,80,80)',
  inactive: 'rgb(153,153,153)',
  userMessageBackground: 'rgb(55,55,55)',
  promptBorder: 'rgb(136,136,136)',
  permission: 'rgb(177,185,249)',
}
const BACKGROUND = 'rgb(24,24,24)'
const CELL = { width: 8.4, height: 19, font: 14, pad: 16 }

const colour = name => (name === undefined ? undefined : (THEME[name] ?? name))

// ---- Cells: a line is an array of { ch, fg, bg, bold, dim, italic, inverse } ----

const cell = (ch, style) => ({ ch, ...style })
const blank = (width, style = {}) => Array.from({ length: width }, () => cell(' ', style))
const fit = (line, width, style = {}) => [...line.slice(0, width), ...blank(Math.max(0, width - line.length), style)]

function styleOf(props = {}, inherited = {}) {
  return {
    ...inherited,
    ...(props.color && { fg: colour(props.color) }),
    ...(props.backgroundColor && { bg: colour(props.backgroundColor) }),
    ...(props.bold && { bold: true }),
    ...(props.italic && { italic: true }),
    ...(props.dimColor && { dim: true }),
    ...(props.inverse && { inverse: true }),
  }
}

/** A Text's characters with their styles, nested Texts included. */
function textCells(node, style) {
  const own = styleOf(node.props, style)
  return (node.children ?? []).flatMap(child =>
    typeof child === 'string' ? [...child].map(ch => cell(ch, own)) : textCells(child, own),
  )
}

/** A Button as the terminal draws it: plain, `k: label` with the hotkey in the accent colour. */
function buttonCells(node, style, focus) {
  const props = node.props ?? {}
  const label = props.label ?? (node.children ?? []).join('')
  const own = { ...styleOf(props, style), ...(props.key === focus && { inverse: true }) }
  const hotkey = props.plain && props.hotkey ? [...`${props.hotkey}`].map(ch => cell(ch, { ...own, fg: THEME.claude, dim: false })) : []
  const text = props.plain ? label : `[ ${label} ]`
  return [...hotkey, ...(hotkey.length ? [cell(':', own), cell(' ', own)] : []), ...[...text].map(ch => cell(ch, own))]
}

// ---- Layout: just enough of Ink's flexbox for the pane's trees ----

function natural(node, focus) {
  if (typeof node === 'string') return [...node].length
  const props = node.props ?? {}
  if (node.type === 'Text') return textCells(node, {}).length
  if (node.type === 'Button') return buttonCells(node, {}, focus).length
  if (node.type === 'Client') return props.width ?? 1
  if (typeof props.width === 'number') return props.width
  const frame = (props.borderStyle ? 2 : 0) + 2 * (props.paddingX ?? 0) + (props.paddingLeft ?? 0) + (props.marginLeft ?? 0)
  const kids = (node.children ?? []).filter(Boolean)
  if ((props.flexDirection ?? 'row') === 'column') return frame + Math.max(0, ...kids.map(kid => natural(kid, focus)))
  const gap = props.columnGap ?? props.gap ?? 0
  return frame + kids.reduce((sum, kid) => sum + natural(kid, focus), 0) + gap * Math.max(0, kids.length - 1)
}

/** Draws a node into `width` cells across; returns its lines. */
function draw(node, width, focus, style = {}) {
  if (node === null || node === undefined || node === false || node === '') return []
  if (typeof node === 'string') return [fit([...node].map(ch => cell(ch, style)), width, style)]
  const props = node.props ?? {}
  if (node.type === 'Text') return [fit(textCells(node, style), width, styleOf({}, style))]
  if (node.type === 'Button') return [fit(buttonCells(node, style, focus), width, style)]
  if (node.type === 'Client') return [fit([cell('✻', { ...style, fg: THEME.claude })], width, style)]
  const own = styleOf({ backgroundColor: props.backgroundColor }, style)
  const left = (props.marginLeft ?? 0)
  const border = props.borderStyle ? 1 : 0
  const padX = props.paddingX ?? 0
  const padLeft = (props.paddingLeft ?? 0) + padX
  const inner = Math.max(0, width - left - 2 * border - padLeft - padX)
  const kids = (node.children ?? []).filter(kid => kid !== null && kid !== undefined && kid !== false && kid !== '')
  let lines = (props.flexDirection ?? 'row') === 'column' ? column(kids, inner, focus, own) : row(kids, props, inner, focus, own)
  if (typeof props.height === 'number') lines = [...lines.slice(0, props.height), ...Array.from({ length: Math.max(0, props.height - lines.length) }, () => blank(inner, own))]
  lines = lines.map(line => [...blank(padLeft, own), ...fit(line, inner, own), ...blank(padX, own)])
  if (border) {
    const edge = { fg: colour(props.borderColor) ?? THEME.inactive }
    const across = inner + padLeft + padX
    lines = [
      [cell('╭', edge), ...Array.from({ length: across }, () => cell('─', edge)), cell('╮', edge)],
      ...lines.map(line => [cell('│', edge), ...line, cell('│', edge)]),
      [cell('╰', edge), ...Array.from({ length: across }, () => cell('─', edge)), cell('╯', edge)],
    ]
  }
  return lines.map(line => [...blank(left, style), ...line])
}

function column(kids, width, focus, style) {
  return kids.flatMap(kid => {
    const top = typeof kid === 'object' ? (kid.props?.marginTop ?? 0) : 0
    const bottom = typeof kid === 'object' ? (kid.props?.marginBottom ?? 0) : 0
    return [
      ...Array.from({ length: top }, () => blank(width, style)),
      ...draw(kid, width, focus, style),
      ...Array.from({ length: bottom }, () => blank(width, style)),
    ]
  })
}

function row(kids, props, width, focus, style) {
  const gap = props.columnGap ?? props.gap ?? 0
  const widths = kids.map(kid => natural(kid, focus))
  const used = widths.reduce((sum, one) => sum + one, 0) + gap * Math.max(0, kids.length - 1)
  const grower = kids.findIndex(kid => typeof kid === 'object' && (kid.props?.flexGrow ?? 0) > 0)
  let spacing = kids.map((_, index) => (index === 0 ? 0 : gap))
  if (grower >= 0) widths[grower] = Math.max(0, widths[grower] + width - used)
  else if (used > width) {
    const shrink = Math.max(0, kids.findIndex(kid => typeof kid === 'object' && (kid.props?.flexShrink ?? 1) > 0 && kid.props?.width === undefined))
    widths[shrink] = Math.max(0, widths[shrink] - (used - width))
  } else if (props.justifyContent === 'space-between' && kids.length > 1) {
    spacing = spacing.map((space, index) => (index === kids.length - 1 ? space + width - used : space))
  }
  const drawn = kids.map((kid, index) => draw(kid, widths[index], focus, style))
  const height = Math.max(1, ...drawn.map(lines => lines.length))
  return Array.from({ length: height }, (_, y) =>
    fit(drawn.flatMap((lines, index) => [...blank(spacing[index], style), ...(lines[y] ?? blank(widths[index], style))]), width, style),
  )
}

// ---- The terminal around the pane: Claude Code itself, hand-written per picture ----

/** Columns for Claude Code's side (about 60 %); the pane takes the rest after a one-cell border. */
const LEFT = 84
const STATUS = 'Sprint 41 · 1/4 done'

// A scene's line: [text, theme key or undefined, { bold, dim, bg }] pieces. The conversation is
// made up for the picture; the pane on the right is the real one.
const you = text => [['> ', 'subtle', { bg: 'userMessageBackground' }], [text, 'text', { bg: 'userMessageBackground', fill: true }]]
const says = text => [['⏺ ', 'text'], [text, 'text']]
const tool = (name, args) => [['⏺ ', 'success'], [name, 'text', { bold: true }], ...(args ? [[`(${args})`, 'text']] : [])]
const result = text => [['  ⎿  ', 'subtle'], [text, 'inactive']]
const gap = () => []

// Tasks start now by default: created, then routed to the teammate that owns the area.
const CREATED = [
  you('the Add to cart button loses clicks, fix it'),
  gap(),
  tool('better-tasks - task_create (MCP)', 'title: "Add to cart loses clicks", …'),
  result('Created T-007 (currently working on): .claude/tasks/T-007.md. Route it now.'),
  gap(),
  tool('better-tasks - team_status (MCP)', ''),
  result('shop · idle · context 41 % · cache warm 52m'),
  gap(),
  tool('SendMessage', 'to: "shop", message: "Add to cart loses clicks · T-007 …"'),
  result('Sent'),
  gap(),
  says('T-007 is with shop: it owns the cart, its cache is warm and it has room.'),
  gap(),
]

/** What the person is typing in Claude Code's prompt box, per picture. */
const TYPED = { board: 'create a task for next sprint to speed up the search', actions: '/better-tasks' }

const SCENES = {
  board: CREATED,
  actions: [...CREATED, you('/better-tasks'), result('Sprint board opened.')],
  moving: [
    you('what’s left in this sprint?'),
    gap(),
    tool('better-tasks - task_list (MCP)', 'sprint: "current"'),
    result('T-007 [doing] … · T-001 [todo] … · T-004 [todo] …'),
    gap(),
    says('Three open: T-007 is with shop, T-001 and T-004 wait. Rate limiting'),
    says('matters more for the launch, so I moved T-004 above T-001.'),
    gap(),
  ],
  settings: [...CREATED, you('/better-tasks config'), result('Sprint board opened.')],
}

function sceneLine(pieces, width) {
  const line = pieces.flatMap(([text, key, options = {}]) =>
    [...text].map(ch => cell(ch, { fg: colour(key), bold: options.bold, bg: colour(options.bg) })),
  )
  const fill = pieces.find(([, , options]) => options?.fill)?.[2]
  return fit(line, width, fill ? { bg: colour(fill.bg) } : {})
}

/** Claude Code's side: the conversation from the top, the prompt box and its footer at the bottom. */
function claudeSide(scene, rows, typed = '') {
  const width = LEFT - 2
  const border = { fg: THEME.promptBorder }
  const prompt = [
    [cell('╭', border), ...Array.from({ length: width - 2 }, () => cell('─', border)), cell('╮', border)],
    [
      cell('│', border), cell(' ', {}), cell('>', { fg: THEME.text }), cell(' ', {}),
      ...[...typed].map(ch => cell(ch, { fg: THEME.text })), cell(' ', { bg: THEME.text }),
      ...blank(width - 6 - [...typed].length), cell('│', border),
    ],
    [cell('╰', border), ...Array.from({ length: width - 2 }, () => cell('─', border)), cell('╯', border)],
  ]
  const mode = [...'  ⏵⏵ accept edits on (shift+tab to cycle)'].map(ch => cell(ch, { fg: THEME.permission }))
  const status = [...STATUS].map(ch => cell(ch, { fg: THEME.inactive }))
  const footer = [...mode, ...blank(Math.max(1, width - mode.length - status.length)), ...status]
  const room = rows - prompt.length - 1
  const talk = scene.slice(-room).map(pieces => sceneLine(pieces, width))
  const lines = [...talk, ...Array.from({ length: room - talk.length }, () => blank(width)), ...prompt, fit(footer, width)]
  return lines.map(line => [cell(' ', {}), ...line, cell(' ', {})])
}

/** The whole terminal: Claude Code, the dock's border with the pane's title, the pane. */
function terminal(scene, pane, paneColumns, typed) {
  const rows = Math.max(pane.length + 1, 26)
  const left = claudeSide(scene, rows, typed)
  const edge = { fg: THEME.subtle }
  const title = fit([...' Sprint '].map(ch => cell(ch, { fg: THEME.text, bold: true })), paneColumns)
  const right = [title, ...pane]
  return Array.from({ length: rows }, (_, y) => [...left[y], cell('│', edge), ...fit(right[y] ?? [], paneColumns)])
}

// ---- SVG ----

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function svg(lines, columns) {
  const width = Math.ceil(columns * CELL.width + 2 * CELL.pad)
  const height = Math.ceil(lines.length * CELL.height + 2 * CELL.pad)
  const parts = []
  lines.forEach((line, y) => {
    const top = CELL.pad + y * CELL.height
    line.forEach((one, x) => {
      const bg = one.inverse ? (one.fg ?? THEME.text) : one.bg
      if (bg) parts.push(`<rect x="${(CELL.pad + x * CELL.width).toFixed(1)}" y="${top}" width="${CELL.width + 0.6}" height="${CELL.height}" fill="${bg}"/>`)
    })
    let x = 0
    while (x < line.length) {
      const start = line[x]
      let text = ''
      let end = x
      const same = other => other.fg === start.fg && other.bold === start.bold && other.dim === start.dim && other.italic === start.italic && other.inverse === start.inverse
      while (end < line.length && same(line[end])) text += line[end++].ch
      if (text.trim() !== '') {
        const fill = start.inverse ? (start.bg ?? BACKGROUND) : (start.fg ?? THEME.text)
        const attributes = [
          `x="${(CELL.pad + x * CELL.width).toFixed(1)}"`,
          `y="${top + CELL.height * 0.75}"`,
          `fill="${fill}"`,
          start.bold ? 'font-weight="bold"' : '',
          start.italic ? 'font-style="italic"' : '',
          start.dim ? 'opacity="0.55"' : '',
          `textLength="${(text.length * CELL.width).toFixed(1)}"`,
        ].filter(Boolean)
        parts.push(`<text ${attributes.join(' ')} xml:space="preserve">${escape(text)}</text>`)
      }
      x = end
    }
  })
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="JetBrains Mono, SF Mono, Menlo, Consolas, monospace" font-size="${CELL.font}">`,
    `<rect width="100%" height="100%" rx="8" fill="${BACKGROUND}"/>`,
    ...parts,
    '</svg>',
    '',
  ].join('\n')
}

// ---- Run ----

// The test runner reports on stderr, the tests' console lines included; a failing test elsewhere
// does not stop the pictures.
const run = () => {
  try {
    execFileSync('claude', ['plugin', 'test', ROOT], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    return ''
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
}
let output = run()
if (!output.includes('SCREENSHOT ')) {
  // A passing run exits 0 and execFileSync hands back stdout only: run once more through a shell.
  output = execFileSync('sh', ['-c', 'claude plugin test "$0" 2>&1', ROOT], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}
const shots = output.split('\n').filter(line => line.startsWith('SCREENSHOT ')).map(line => JSON.parse(line.slice('SCREENSHOT '.length)))
mkdirSync(OUT, { recursive: true })
for (const shot of shots) {
  const pane = draw(shot.tree, shot.columns, shot.focus)
  const lines = terminal(SCENES[shot.name] ?? [], pane, shot.columns, TYPED[shot.name])
  const columns = LEFT + 1 + shot.columns
  writeFileSync(join(OUT, `${shot.name}.svg`), svg(lines, columns))
  console.log(`docs/screenshots/${shot.name}.svg  ${columns}×${lines.length}`)
}
if (shots.length === 0) {
  console.error('No SCREENSHOT lines: did tests/screenshots.test.ts run?')
  process.exit(1)
}
