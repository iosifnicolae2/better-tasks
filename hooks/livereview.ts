// Live review (setting liveReview): while a teammate tests on the test screen, bin/live-review.sh records it and
// sends the frames that changed to a Gemini Live session, with the user's own AI Studio key from the macOS Keychain.
// Gemini reports what the teammate asked it to watch and flags anything not OK, each at its second in the recording;
// the teammate then reviews those moments. This file is the part both sides share: bin/live_review.mjs imports it
// (Node strips the types, so it imports nothing) and the settings page reads where the key is kept.

/** The Keychain item: this service, account "global" or a project's root path (that project's own key wins). */
export const KEYCHAIN_SERVICE = 'better-tasks gemini'
export const GLOBAL_ACCOUNT = 'global'

/** The Live API model (ai.google.dev/gemini-api/docs/live-api); BT_LIVE_REVIEW_MODEL overrides it. */
export const DEFAULT_MODEL = 'gemini-3.8-live'
/** Frames a second looked at: a screenshot each. */
export const FPS = 1
/** A frame's width as sent: enough to read a UI's text. */
export const FRAME_WIDTH = 1280
/** Every this many seconds the frames that changed go to Gemini as one turn, each after its "t=<seconds>s". */
export const TURN_SECONDS = 3
/** With nothing changed this long, the latest frame goes anyway, so a stuck screen gets noticed. */
export const QUIET_SECONDS = 10
/** The small grey picture of a frame that tells whether it changed (see isChanged). */
export const THUMB = { width: 192, height: 108 }
/** How long a report shows at least on a video: until the next of its kind, but never shorter. */
export const FLAG_SECONDS = 4

/** Paid-tier prices of the Live models, USD per million tokens (ai.google.dev/gemini-api/docs/pricing, 2026-10). */
export const PRICES = {
  input: { TEXT: 0.75, AUDIO: 3, IMAGE: 1, VIDEO: 1 },
  output: { TEXT: 4.5, AUDIO: 12 },
} as const

// ---- The key ----

export type KeyPlace = 'project' | 'global' | 'none'

/** `live-review.sh key status` prints where the key in use is kept. */
export function keyPlaceOf(output: string): KeyPlace {
  const word = output.trim()
  return word === 'project' || word === 'global' ? word : 'none'
}

export const keyArgv = (root: string, ...args: string[]) => ['/bin/sh', `${root}/bin/live-review.sh`, 'key', ...args]

// ---- What Gemini reports ----

export type Severity = 'info' | 'warning' | 'error'

/**
 * One report: "step" narrates what is on screen and what just happened, as a tester's notes; "watch" answers the
 * teammate's instructions; "flag" is something not OK it found on its own.
 */
export type Observation = {
  /** Seconds into the recording. */
  at: number
  kind: 'step' | 'watch' | 'flag'
  severity: Severity
  text: string
  /** Where on the recording, in its pixels: [x, y, w, h]. */
  box?: [number, number, number, number]
}

export type Usage = { prompt: Record<string, number>; response: Record<string, number> }

/** review.json, written beside the recording. */
export type Review = {
  video: string
  model: string
  watch: string
  /** The recording's size in pixels. */
  size: [number, number]
  seconds: number
  observations: Observation[]
  usage: Usage
}

/**
 * The one function Gemini calls: a report. Schema types as the Gemini API spells them. Non-blocking, and answered
 * silently (live_review.mjs), so a report costs no extra turn.
 */
export const OBSERVE_TOOL = {
  name: 'observe',
  behavior: 'NON_BLOCKING',
  description: 'Records one observation of the screen under test. Call it once per distinct thing; never repeat one already reported.',
  parameters: {
    type: 'OBJECT',
    properties: {
      at: { type: 'NUMBER', description: 'The "t=" seconds of the frame that shows it.' },
      kind: { type: 'STRING', enum: ['step', 'watch', 'flag'], description: 'step: what is on screen and what just happened. watch: about what you were asked to check. flag: anything else that is not OK.' },
      severity: { type: 'STRING', enum: ['info', 'warning', 'error'] },
      text: { type: 'STRING', description: 'One short sentence: what is on screen, quoting visible text exactly.' },
      box: { type: 'ARRAY', items: { type: 'INTEGER' }, description: 'Where it is: [ymin, xmin, ymax, xmax], each 0-1000 of the frame.' },
    },
    required: ['at', 'kind', 'severity', 'text'],
  },
} as const

/** Gemini's standing instructions: narrate like a tester, the teammate's checks, then what to flag unasked. */
export function instructionsOf(watch: string): string {
  return [
    'You watch the screen of a software test as it happens and report through the observe function only. Never speak.',
    'Every few seconds you get the frames that changed, each after its time "t=<seconds>s"; a frame stays on screen until the next one.',
    'Report only what the frames show. Read every number and text off the screen exactly; never assume a step worked because it was expected to, and never describe a change you did not see.',
    'After each batch, call observe once for each new thing, with "at" the time of the frame that shows it. Never report a thing twice. Nothing new: call nothing.',
    'Narrate like a human tester taking notes: for each change on screen, kind "step", severity info: where the user is and what just happened, quoting what changed (e.g. "Settings page open; Editor shows code", "Pressed Enter: Editor now shows cursor").',
    `The tester asked you to check: ${watch.trim() || 'nothing in particular'}`,
    'For each of those checks, once a frame shows its outcome, report kind "watch": severity info if the screen shows it as asked, error if not, quoting what the screen shows instead.',
    'Also report kind "flag" for anything else that is not OK, unasked: error messages, crashes, warnings, glitches, cut-off or overlapping text, broken layout, empty areas that should have data, a loading or progress state still on screen 10 seconds later (say how long), wrong numbers or sums, typos, unexpected dialogs.',
  ].join('\n')
}

/**
 * Whether a frame differs from the last one sent, by their grey thumbnails (THUMB, one byte a pixel): a few
 * pixels changed clearly. The top rows (the menu bar's clock and meters) don't count.
 */
export function isChanged(last: Uint8Array | undefined, next: Uint8Array): boolean {
  if (!last || last.length !== next.length) return true
  const from = THUMB.width * Math.ceil(THUMB.height * 0.04)
  let changed = 0
  for (let i = from; i < next.length; i++) if (Math.abs(next[i]! - last[i]!) > 12 && ++changed >= 3) return true
  return false
}

/** A frame box from Gemini ([ymin, xmin, ymax, xmax], 0-1000) in the recording's pixels: [x, y, w, h]. */
export function boxOf(value: unknown, size: [number, number]): Observation['box'] {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(n => Number.isFinite(Number(n)))) return undefined
  const [ymin = 0, xmin = 0, ymax = 0, xmax = 0] = value.map(n => Math.min(1000, Math.max(0, Number(n))))
  if (xmax <= xmin || ymax <= ymin) return undefined
  const [width, height] = size
  const x = Math.round((xmin / 1000) * width)
  const y = Math.round((ymin / 1000) * height)
  return [x, y, Math.round((xmax / 1000) * width) - x, Math.round((ymax / 1000) * height) - y]
}

/**
 * A call's arguments as an observation, or undefined without text. Its time is the frame's Gemini names, any
 * time up to `now`; else `latest`, the newest frame it had been sent.
 */
export function observationOf(args: Record<string, unknown>, now: number, latest: number, size: [number, number]): Observation | undefined {
  const text = String(args.text ?? '').trim()
  if (!text) return undefined
  const said = Number(args.at)
  const at = Number.isFinite(said) && said >= 0 && said <= now ? said : latest
  const kind = args.kind === 'watch' || args.kind === 'step' ? args.kind : 'flag'
  const severity = args.severity === 'info' || args.severity === 'error' ? args.severity : 'warning'
  const box = boxOf(args.box, size)
  return { at: round(at), kind, severity, text, ...(box ? { box } : {}) }
}

/** Whether it says again what an earlier one of its kind said (Gemini repeats itself across turns). */
export function isRepeat(earlier: Observation[], one: Observation): boolean {
  const words = (text: string) => text.toLowerCase().replace(/\.(?!\d)/g, ' ').replace(/[^a-z0-9$%.]+/g, ' ').trim()
  return earlier.some(other => other.kind === one.kind && words(other.text) === words(one.text))
}

/** Moves every observation by `shift` seconds (the recording started that much after the clock), kept in [0, seconds]. */
export function shifted(observations: Observation[], shift: number, seconds: number): Observation[] {
  return observations.map(one => ({ ...one, at: round(Math.min(seconds, Math.max(0, one.at - shift))) }))
}

// ---- Writing it down ----

/** "1:05" */
export function clockOf(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** "step", "watch, info", "FLAG, error" */
export const labelOf = (one: Observation) => (one.kind === 'step' ? 'step' : `${one.kind === 'flag' ? 'FLAG' : 'watch'}, ${one.severity}`)

/** The list for the task file and the PR: "- 0:12 FLAG, error: The save button does nothing." */
export function listOf(observations: Observation[]): string {
  if (observations.length === 0) return '- No observations.'
  return [...observations].sort((a, b) => a.at - b.at).map(one => `- ${clockOf(one.at)} ${labelOf(one)}: ${one.text}`).join('\n')
}

/** review.md: what was watched, the cost, then the list. */
export function markdownOf(review: Review): string {
  const count = (kind: Observation['kind'], one: string, many: string) => {
    const n = review.observations.filter(other => other.kind === kind).length
    return `${n} ${n === 1 ? one : many}`
  }
  return [
    `# Live review of ${review.video}`,
    `Gemini (${review.model}) watched ${clockOf(review.seconds)} of the test for: ${review.watch.trim().replace(/\.$/, '') || 'nothing in particular'}.`,
    `${count('step', 'step', 'steps')} noted, ${count('watch', 'check', 'checks')} reported, ${count('flag', 'flag', 'flags')}. Cost about $${costOf(review.usage).toFixed(3)}.`,
    '',
    listOf(review.observations),
    '',
  ].join('\n')
}

/** SubRip subtitles: each observation until the next of its kind, FLAG_SECONDS at least, cut short by the end of the video. */
export function srtOf(observations: Observation[], seconds: number): string {
  const time = (value: number) => {
    const ms = Math.round(Math.max(0, value) * 1000)
    const pad = (n: number, width = 2) => String(n).padStart(width, '0')
    return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
  }
  const ordered = [...observations].sort((a, b) => a.at - b.at)
  return ordered
    .map((one, index) => {
      const next = ordered.slice(index + 1).find(other => other.kind === one.kind)
      const end = Math.min(seconds, Math.max(one.at + FLAG_SECONDS, next?.at ?? seconds))
      return `${index + 1}\n${time(one.at)} --> ${time(end)}\n${labelOf(one)}: ${one.text}\n`
    })
    .join('\n')
}

// ---- Cost ----

/** Adds one usage message's token counts by modality; thinking, and output given without modalities, count as text. */
export function addUsage(total: Usage, metadata: Record<string, unknown> | undefined): Usage {
  const add = (into: Record<string, number>, details: unknown) => {
    for (const entry of Array.isArray(details) ? details : []) {
      const { modality, tokenCount } = entry as { modality?: string; tokenCount?: number }
      if (modality && Number.isFinite(tokenCount)) into[modality] = (into[modality] ?? 0) + Number(tokenCount)
    }
  }
  add(total.prompt, metadata?.promptTokensDetails)
  if (metadata?.responseTokensDetails) add(total.response, metadata.responseTokensDetails)
  else add(total.response, [{ modality: 'TEXT', tokenCount: Number(metadata?.responseTokenCount ?? 0) }])
  add(total.response, [{ modality: 'TEXT', tokenCount: Number(metadata?.thoughtsTokenCount ?? 0) }])
  return total
}

/** USD at PRICES; a modality without a price counts as text. */
export function costOf(usage: Usage): number {
  const sum = (counts: Record<string, number>, prices: Record<string, number>) =>
    Object.entries(counts).reduce((total, [modality, tokens]) => total + (tokens * (prices[modality] ?? prices.TEXT ?? 0)) / 1e6, 0)
  return sum(usage.prompt, PRICES.input) + sum(usage.response, PRICES.output)
}

const round = (value: number) => Math.round(value * 10) / 10
