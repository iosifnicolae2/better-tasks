// Covers every screen in black until the first mouse move or key press.
// Run:     osascript -l JavaScript bin/blackout.js <statusFile> [safetySeconds]
// Restore: osascript -l JavaScript bin/blackout.js --restore <statusFile>
// Writes "black" (or "failed: why") to <statusFile> once the windows are up, and the
// brightness it lowers to <statusFile>.brightness first, so --restore can put it back
// even if this process is killed (JXA cannot catch signals). bin/away.sh runs both.
ObjC.import('Cocoa')
ObjC.import('CoreGraphics')

const ANY_INPUT = 4294967295 // kCGAnyInputEventType
const COMBINED_SESSION = 0 // kCGEventSourceStateCombinedSessionState
const GRACE_SECONDS = 1 // ignores the key-up of the command that started us
const DISPLAY_SERVICES = '/System/Library/PrivateFrameworks/DisplayServices.framework'

function run(argv) {
  if (argv[0] === '--restore') return restoreBrightness(argv[1])
  const [statusFile, safety] = argv
  const safetySeconds = Number(safety) || Infinity
  const app = $.NSApplication.sharedApplication
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory)

  const windows = $.NSScreen.screens.js.map(blackWindow)
  if (windows.length === 0) return writeFile(statusFile, 'failed: no screens')
  app.activateIgnoringOtherApps(true)
  $.NSCursor.hide
  dimDisplays(statusFile)
  writeFile(statusFile, 'black')

  const shownAt = Date.now()
  while (!userIsBack(shownAt) && secondsSince(shownAt) < safetySeconds) {
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.25))
  }

  restoreBrightness(statusFile)
  $.NSCursor.unhide
  windows.forEach(window => window.orderOut(null))
}

function blackWindow(screen) {
  const window = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    screen.frame, $.NSWindowStyleMaskBorderless, $.NSBackingStoreBuffered, false)
  window.backgroundColor = $.NSColor.blackColor
  window.level = $.CGShieldingWindowLevel()
  window.collectionBehavior = $.NSWindowCollectionBehaviorCanJoinAllSpaces
    | $.NSWindowCollectionBehaviorStationary
    | $.NSWindowCollectionBehaviorFullScreenAuxiliary
  window.releasedWhenClosed = false
  window.setFrameDisplay(screen.frame, true)
  window.orderFrontRegardless
  return window
}

/** Asks how long since the last input, so no Accessibility permission is needed. */
function userIsBack(shownAt) {
  const idle = $.CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION, ANY_INPUT)
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
function dimDisplays(statusFile) {
  if (!loadDisplayServices()) return
  const saved = []
  for (const display of displayIds()) {
    const level = Ref()
    if ($.DisplayServicesGetBrightness(display, level) === 0) saved.push([display, level[0]])
  }
  writeFile(`${statusFile}.brightness`, JSON.stringify(saved))
  for (const [display] of saved) $.DisplayServicesSetBrightness(display, 0)
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

function displayIds() {
  return $.NSScreen.screens.js.map(screen =>
    screen.deviceDescription.objectForKey('NSScreenNumber').unsignedIntValue)
}
