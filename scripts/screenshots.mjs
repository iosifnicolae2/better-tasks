#!/usr/bin/env node
// Draws the README's pictures: runs the plugin's tests, takes each "SCREENSHOT {json}" line that
// tests/screenshots.test.ts prints (the pane's real tree), lays it out on a grid of terminal cells
// and writes docs/screenshots/<name>.svg in Claude Code's dark theme. Usage: node scripts/screenshots.mjs

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
  const lines = draw(shot.tree, shot.columns, shot.focus)
  writeFileSync(join(OUT, `${shot.name}.svg`), svg(lines, shot.columns))
  console.log(`docs/screenshots/${shot.name}.svg  ${shot.columns}×${lines.length}`)
}
if (shots.length === 0) {
  console.error('No SCREENSHOT lines: did tests/screenshots.test.ts run?')
  process.exit(1)
}
