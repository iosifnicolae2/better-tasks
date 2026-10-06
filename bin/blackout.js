// Turns the physical screens off until the first mouse move or key press: macOS disables them as if
// unplugged, so each monitor gets no signal and goes to its own standby (record-display.sh off). One
// screen stays on to hold the windows and the Dock (the built-in, else the main one), and it and any
// screen macOS won't turn off get a black window and brightness 0 instead (built-in and Apple screens
// through DisplayServices, other external screens over DDC/CI). Never DDC standby or power off (see
// bin/record_display.swift). Virtual displays (the projects' test and recording displays) stay on.
// Run:     osascript -l JavaScript bin/blackout.js <statusFile> <physicalIds> <displayHelper> [safetySeconds]
//          physicalIds: the real screens' display ids, "1,2"; empty: guessed (not our virtual vendor id).
//          displayHelper: bin/record-display.sh, for "off|on|dim|undim"; empty: black windows only.
// Plan:    osascript -l JavaScript bin/blackout.js --plan <physicalIds>  prints the screens it would cover
// Restore: osascript -l JavaScript bin/blackout.js --restore <statusFile> <displayHelper>
// Writes "black" (or "failed: why") to <statusFile> once the screens are dark. What it changes it notes
// first (<statusFile>.off, .brightness, .ddc), so --restore can undo it even if this process is
// killed (JXA cannot catch signals). bin/away.sh runs both.
ObjC.import('Cocoa')
ObjC.import('CoreGraphics')

const ANY_INPUT = 4294967295 // kCGAnyInputEventType
const HARDWARE_INPUT = 1 // kCGEventSourceStateHIDSystemState: the user's own mouse and keys, not posted events
const VIRTUAL_VENDOR = 0xB7A5 // record_display.swift's virtual displays
const GRACE_SECONDS = 1 // ignores the key-up of the command that started us
const DISPLAY_SERVICES = '/System/Library/PrivateFrameworks/DisplayServices.framework'

function run(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') return usage()
  if (argv[0] === '--restore') return restore(argv[1], argv[2])
  if (argv[0] === '--plan') return plan(physicalScreens(argv[1]).map(displayId)).join('\n')
  const [statusFile, physicalIds, displayHelper, safety] = argv
  const safetySeconds = Number(safety) || Infinity
  const app = $.NSApplication.sharedApplication
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory)

  const physical = physicalScreens(physicalIds).map(displayId)
  if (physical.length === 0) return writeFile(statusFile, 'failed: no physical screens')
  const kept = screenToKeep(physical)
  const { holder, off } = screensOff(statusFile, physical.filter(id => id !== kept), displayHelper)
  const lit = physical.filter(id => !off.includes(id))
  const windows = lit.map(id => [id, blackWindow(id)])
  if (windows.length > 0) {
    app.activateIgnoringOtherApps(true)
    $.NSCursor.hide
  }
  dimDisplays(statusFile, lit)
  if (off.length === 0) runHelper(displayHelper, 'dim', `${statusFile}.ddc`)
  writeFile(statusFile, 'black')

  const shownAt = Date.now()
  while (!userIsBack(shownAt) && secondsSince(shownAt) < safetySeconds) {
    windows.forEach(([id, window]) => fit(window, id)) // the layout changes as the other screens go off
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.25))
  }

  // Quickest first: the windows and the Mac's own brightness go at once, then the screens come back on.
  windows.forEach(([, window]) => window.orderOut(null))
  if (windows.length > 0) $.NSCursor.unhide
  $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.01)) // shows it now
  restore(statusFile, displayHelper)
  if (holder && holder.running) { holder.terminate; holder.waitUntilExit }
}

/** Starts the helper that holds the screens off while this process lives; returns it and the ids it turned off. */
function screensOff(statusFile, ids, displayHelper) {
  if (!displayHelper) return { holder: undefined, off: [] }
  const holder = $.NSTask.alloc.init
  const output = $.NSPipe.pipe
  holder.launchPath = '/bin/sh'
  holder.arguments = [displayHelper, 'off', `${statusFile}.off`, ids.join(','),
    String($.NSProcessInfo.processInfo.processIdentifier)]
  holder.standardOutput = output
  holder.launch
  const said = $.NSString.alloc.initWithDataEncoding(output.fileHandleForReading.availableData, $.NSUTF8StringEncoding).js
  const off = (said.match(/^ready off ([\d,]*)/) || ['', ''])[1].split(',').filter(Boolean).map(Number)
  $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.5)) // the screens' new layout
  return { holder, off }
}

/** The comment at the top of this file, which says how to run it. */
function usage() {
  const path = $.NSProcessInfo.processInfo.arguments.js.map(arg => arg.js).find(arg => arg.endsWith('blackout.js'))
  const lines = readFile(path).split('\n')
  return lines.slice(0, lines.findIndex(line => !line.startsWith('//'))).map(line => line.replace(/^\/\/ ?/, '')).join('\n')
}

function physicalScreens(physicalIds) {
  const listed = String(physicalIds || '').split(',').filter(Boolean).map(Number)
  const isPhysical = listed.length > 0
    ? id => listed.includes(id)
    : id => $.CGDisplayVendorNumber(id) !== VIRTUAL_VENDOR
  return $.NSScreen.screens.js.filter(screen => isPhysical(displayId(screen)))
}

function displayId(screen) {
  return screen.deviceDescription.objectForKey('NSScreenNumber').unsignedIntValue
}

/** The screen that stays on, so the windows and the Dock move there and not to a virtual display. */
function screenToKeep(physical) {
  return physical.find(id => $.CGDisplayIsBuiltin(id)) ?? physical.find(id => id === $.CGMainDisplayID())
}

function plan(physical) {
  const name = id => $.NSScreen.screens.js.find(screen => displayId(screen) === id)?.localizedName.js
  return physical.map(id => `${id}\t${name(id)}\t${id === screenToKeep(physical) ? 'stays on, black and dimmed' : 'off'}`)
}

/** A display's frame in AppKit's coordinates, from CoreGraphics (current even while the layout changes). */
function frameOf(id) {
  const bounds = $.CGDisplayBounds(id)
  const mainHeight = $.CGDisplayBounds($.CGMainDisplayID()).size.height
  return $.NSMakeRect(bounds.origin.x, mainHeight - bounds.origin.y - bounds.size.height, bounds.size.width, bounds.size.height)
}

function fit(window, id) {
  const want = frameOf(id), have = window.frame
  if (want.origin.x !== have.origin.x || want.origin.y !== have.origin.y
    || want.size.width !== have.size.width || want.size.height !== have.size.height) window.setFrameDisplay(want, true)
}

function blackWindow(id) {
  const window = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    frameOf(id), $.NSWindowStyleMaskBorderless, $.NSBackingStoreBuffered, false)
  window.backgroundColor = $.NSColor.blackColor
  window.level = $.CGShieldingWindowLevel()
  window.collectionBehavior = $.NSWindowCollectionBehaviorCanJoinAllSpaces
    | $.NSWindowCollectionBehaviorStationary
    | $.NSWindowCollectionBehaviorFullScreenAuxiliary
  window.releasedWhenClosed = false
  window.setFrameDisplay(frameOf(id), true)
  window.orderFrontRegardless
  return window
}

/** Asks how long since the last input, so no Accessibility permission is needed. */
function userIsBack(shownAt) {
  const idle = $.CGEventSourceSecondsSinceLastEventType(HARDWARE_INPUT, ANY_INPUT)
  return idle < secondsSince(shownAt) - GRACE_SECONDS
}

function secondsSince(time) {
  return (Date.now() - time) / 1000
}

function writeFile(path, text) {
  $.NSString.alloc.initWithUTF8String(text)
    .writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null)
}

function readFile(path) {
  const text = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null)
  return text.isNil() ? undefined : text.js
}

// Brightness through Apple's private DisplayServices (what the brightness keys use).
// Best effort: displays it cannot read are skipped.
function dimDisplays(statusFile, displays) {
  if (!loadDisplayServices()) return
  const saved = []
  for (const display of displays) {
    const level = Ref()
    if ($.DisplayServicesGetBrightness(display, level) === 0) saved.push([display, level[0]])
  }
  writeFile(`${statusFile}.brightness`, JSON.stringify(saved))
  for (const [display] of saved) $.DisplayServicesSetBrightness(display, 0)
}

function restore(statusFile, displayHelper) {
  restoreBrightness(statusFile)
  runHelper(displayHelper, 'on', `${statusFile}.off`)
  runHelper(displayHelper, 'undim', `${statusFile}.ddc`)
}

// on: the screens noted in <file>; dim|undim: external screens' backlight over DDC/CI, a lit screen's
// fallback (a black window alone keeps an LCD lit). Each does nothing when its file is gone.
function runHelper(displayHelper, command, file) {
  if (!displayHelper) return
  const task = $.NSTask.alloc.init
  task.launchPath = '/bin/sh'
  task.arguments = [displayHelper, command, file]
  task.launch
  task.waitUntilExit
}

function restoreBrightness(statusFile) {
  const saved = readFile(`${statusFile}.brightness`)
  if (saved === undefined || !loadDisplayServices()) return
  for (const [display, level] of JSON.parse(saved)) $.DisplayServicesSetBrightness(display, level)
  $.NSFileManager.defaultManager.removeItemAtPathError(`${statusFile}.brightness`, null)
}

function loadDisplayServices() {
  try {
    if (!$.NSBundle.bundleWithPath(DISPLAY_SERVICES).load) return false
    ObjC.bindFunction('DisplayServicesGetBrightness', ['int', ['unsigned int', 'float *']])
    ObjC.bindFunction('DisplayServicesSetBrightness', ['int', ['unsigned int', 'float']])
    return true
  } catch (error) {
    return false
  }
}
