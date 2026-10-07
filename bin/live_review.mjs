// The live review itself, run by bin/live-review.sh (see there): records the test display, looks at it once a
// second and every few seconds sends the frames that changed (masked, scaled down, each after its time) to a
// Gemini Live session, then writes what Gemini reports into <out>/:
// recording.mov, review.json (hooks/livereview.ts's Review), review.md, review.srt and live.log (one line per
// report, as it comes). The key is read from the Keychain here and stays in this process.
// Usage: node live_review.mjs --out <dir> --capture <screencapture -D number> --root <project root>
//          [--watch <text>] [--mask x,y,w,h]... ; SIGTERM or SIGINT ends it.
// BT_LIVE_REVIEW_DEBUG=1 also writes messages.jsonl: every message from Gemini, and each turn's frame times.

import { execFile, execFileSync, spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { promisify } from 'node:util'

import {
  addUsage, clockOf, DEFAULT_MODEL, FPS, FRAME_WIDTH, GLOBAL_ACCOUNT, instructionsOf, isChanged, isRepeat, KEYCHAIN_SERVICE,
  markdownOf, OBSERVE_TOOL, observationOf, QUIET_SECONDS, shifted, srtOf, THUMB, TURN_SECONDS,
} from '../hooks/livereview.ts'

const run = promisify(execFile)
const options = parse(process.argv.slice(2))
const out = options.out
mkdirSync(out, { recursive: true })
const paths = {
  video: join(out, 'recording.mov'),
  frame: join(out, 'frame.jpg'), // screencapture can't write a dotfile (and still exits 0)
  sent: join(out, 'sent.jpg'),
  json: join(out, 'review.json'),
  md: join(out, 'review.md'),
  srt: join(out, 'review.srt'),
  log: join(out, 'live.log'),
}
const model = process.env.BT_LIVE_REVIEW_MODEL || DEFAULT_MODEL

const { GoogleGenAI, Modality } = await import(createRequire(join(process.env.BT_GENAI_HOME, 'package.json')).resolve('@google/genai'))
const ai = new GoogleGenAI({ apiKey: keyOf(options.root) })

// pending: frames that changed, not sent yet; latest: the newest frame's time sent; thumb: its grey thumbnail.
const state = { observations: [], usage: { prompt: {}, response: {} }, pending: [], latest: 0, sentAt: 0, thumb: undefined, handle: undefined, session: undefined, ending: false }
const recorder = spawn('screencapture', ['-v', '-x', '-D', options.capture, paths.video], { stdio: 'ignore' })
const started = Date.now()
const now = () => (Date.now() - started) / 1000
const size = await recordingSize()
log(`watching display ${options.capture} with ${model}; recording to ${paths.video}`)

await connect()
let lastProblem = ''
const ticks = setInterval(() => void tick().catch(skipped), 1000 / FPS)
const turns = setInterval(sendTurn, TURN_SECONDS * 1000)
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void finish())

// ---- The session ----

/** Opens (or resumes, after a goAway or a dropped connection) the Live session. */
async function connect() {
  state.session = await ai.live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: instructionsOf(options.watch),
      tools: [{ functionDeclarations: [OBSERVE_TOOL] }],
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: state.handle ? { handle: state.handle } : {},
    },
    callbacks: {
      onmessage: message => void onMessage(message),
      onerror: error => log(`Gemini error: ${error.message ?? error}`),
      onclose: event => {
        if (state.ending) return
        log(`connection closed (${event.reason || event.code}); resuming`)
        setTimeout(() => void connect().catch(error => log(`resume failed: ${error.message}`)), 1000)
      },
    },
  })
}

function onMessage(message) {
  if (process.env.BT_LIVE_REVIEW_DEBUG) appendFileSync(join(out, 'messages.jsonl'), `${JSON.stringify({ at: now(), ...message }, (key, value) => (key === 'data' ? `<${value.length}>` : value))}\n`)
  if (message.usageMetadata) addUsage(state.usage, message.usageMetadata)
  if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) state.handle = message.sessionResumptionUpdate.newHandle
  if (message.goAway && !state.ending) void connect().catch(error => log(`resume failed: ${error.message}`))
  const calls = message.toolCall?.functionCalls ?? []
  for (const call of calls) {
    const observation = call.name === OBSERVE_TOOL.name ? observationOf(call.args ?? {}, now(), state.latest, size) : undefined
    if (observation && !isRepeat(state.observations, observation)) {
      state.observations.push(observation)
      log(`${clockOf(observation.at)} ${observation.kind === 'flag' ? 'FLAG' : 'watch'}, ${observation.severity}: ${observation.text}`)
    }
  }
  if (calls.length > 0) {
    state.session?.sendToolResponse({ functionResponses: calls.map(call => ({ id: call.id, name: call.name, response: { result: 'ok' }, scheduling: 'SILENT' })) })
    save(now())
  }
}

/** One frame: masked, scaled to a JPEG; kept for the next turn when it changed. */
async function tick() {
  if (state.ending) return
  const at = now()
  await grab()
  const { stdout: thumb } = await run('ffmpeg', ['-y', '-v', 'error', '-i', paths.frame, '-filter_complex', frameFilter(),
    '-map', '[sent]', '-q:v', '5', paths.sent, '-map', '[thumb]', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer' })
  if (!isChanged(state.thumb, thumb) && at - state.sentAt < QUIET_SECONDS) return
  state.thumb = thumb
  state.sentAt = at
  state.pending.push({ at: Math.round(at * 10) / 10, data: readFileSync(paths.sent).toString('base64') })
}

/** The frames that changed since the last turn, each after its time, as one turn; Gemini answers with calls. */
function sendTurn(closing = '') {
  if (!state.session || (state.pending.length === 0 && !closing)) return
  const frames = state.pending.splice(0)
  const parts = frames.flatMap(frame => [{ text: `t=${frame.at}s` }, { inlineData: { mimeType: 'image/jpeg', data: frame.data } }])
  state.latest = frames.at(-1)?.at ?? state.latest
  state.session.sendClientContent({ turns: [{ role: 'user', parts: [...parts, { text: closing || 'Report what is new.' }] }], turnComplete: true })
  if (process.env.BT_LIVE_REVIEW_DEBUG) appendFileSync(join(out, 'messages.jsonl'), `${JSON.stringify({ at: now(), sent: frames.map(frame => frame.at) })}\n`)
}

/** Logs why a frame was skipped, once until the reason changes. */
function skipped(error) {
  const problem = String(error.message).split('\n')[0]
  if (problem !== lastProblem) log(`frame skipped: ${problem}`)
  lastProblem = problem
}

/** The masks, filled black at the display's own pixels; then the frame scaled to FRAME_WIDTH, and its grey thumbnail. */
function frameFilter() {
  const masked = ['[0:v]', ...options.masks.map(([x, y, w, h]) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=black:t=fill,`)].join('')
  return `${masked}split[a][b];[a]scale=${FRAME_WIDTH}:-2[sent];[b]scale=${THUMB.width}:${THUMB.height},format=gray[thumb]`
}

// ---- The end ----

/** Asks for the last reports, ends the recording, writes the review with times on the recording's clock. */
async function finish() {
  if (state.ending) return
  clearInterval(ticks)
  clearInterval(turns)
  sendTurn(`t=${Math.round(now())}s: the test has ended. Report anything you have not reported yet.`)
  await new Promise(resolve => setTimeout(resolve, 8000))
  state.ending = true
  state.session?.close()
  const wall = now()
  recorder.kill('SIGINT')
  await new Promise(resolve => recorder.once('exit', resolve))
  const seconds = await duration(paths.video).catch(() => wall)
  save(seconds, Math.max(0, wall - seconds))
  for (const path of [paths.frame, paths.sent]) rmSync(path, { force: true })
  log(`done: ${paths.md}`)
  process.exit(0)
}

/** Writes review.json, review.md and review.srt; `shift`: how much later than the clock the recording began. */
function save(seconds, shift = 0) {
  const observations = shifted(state.observations, shift, seconds)
  const review = { video: paths.video, model, watch: options.watch, size, seconds, observations, usage: state.usage }
  writeFileSync(paths.json, `${JSON.stringify(review, null, 2)}\n`)
  writeFileSync(paths.md, markdownOf(review))
  writeFileSync(paths.srt, srtOf(observations, seconds))
}

// ---- Helpers ----

/** The key: the project's own, else the global one; never written anywhere. */
function keyOf(root) {
  for (const account of [root, GLOBAL_ACCOUNT]) {
    try {
      const key = execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (key) return key
    } catch {}
  }
  console.error('better-tasks: no Gemini API key: set one on the settings page (/better-tasks config, "Gemini API key") or with live-review.sh key set')
  process.exit(1)
}

/** A screenshot of the test display to paths.frame. */
async function grab() {
  rmSync(paths.frame, { force: true })
  await run('screencapture', ['-x', '-D', options.capture, '-t', 'jpg', paths.frame])
  if (!existsSync(paths.frame)) throw new Error(`screencapture wrote no frame of display ${options.capture}`)
}

async function recordingSize() {
  await grab()
  const { stdout } = await run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', paths.frame])
  const number = name => Number(stdout.match(new RegExp(`${name}: (\\d+)`))?.[1] ?? 0)
  return [number('pixelWidth'), number('pixelHeight')]
}

async function duration(video) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video])
  const seconds = Number(stdout.trim())
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('no duration')
  return seconds
}

function log(line) {
  appendFileSync(paths.log, `${line}\n`)
  console.log(line)
}

function parse(argv) {
  const parsed = { watch: '', masks: [] }
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1] ?? '']
    if (flag === '--mask') parsed.masks.push(value.split(',').map(Number))
    else parsed[flag.replace(/^--/, '')] = value
  }
  for (const required of ['out', 'capture', 'root']) {
    if (!parsed[required]) {
      console.error(`live_review.mjs: --${required} is missing`)
      process.exit(2)
    }
  }
  return parsed
}
