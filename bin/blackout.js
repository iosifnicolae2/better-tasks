// Covers every screen in black until the first mouse move or key press.
// Run: osascript -l JavaScript bin/blackout.js [safetySeconds]
// Prints "black" once the windows are up; exits 1 if they could not be made.
// The caller keeps the displays awake (caffeinate -d), so the Mac never locks.
ObjC.import('Cocoa')
ObjC.import('CoreGraphics')
ObjC.import('stdlib')

const ANY_INPUT = 4294967295 // kCGAnyInputEventType
const COMBINED_SESSION = 0 // kCGEventSourceStateCombinedSessionState
const GRACE_SECONDS = 1 // ignores the key-up of the command that started us
const DISPLAY_SERVICES = '/System/Library/PrivateFrameworks/DisplayServices.framework'

function run(argv) {
  const safetySeconds = Number(argv[0]) || Infinity
  const app = $.NSApplication.sharedApplication
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory)

  const windows = $.NSScreen.screens.js.map(blackWindow)
  if (windows.length === 0) return fail('no screens')
  app.activateIgnoringOtherApps(true)
  $.NSCursor.hide
  const savedBrightness = dimDisplays()
  say('black')

  const shownAt = Date.now()
  while (!userIsBack(shownAt) && secondsSince(shownAt) < safetySeconds) {
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.25))
  }

  restoreBrightness(savedBrightness)
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

/** Writes a line to stdout right away (console.log goes to stderr). */
function say(line) {
  const data = $.NSString.alloc.initWithUTF8String(`${line}\n`).dataUsingEncoding($.NSUTF8StringEncoding)
  $.NSFileHandle.fileHandleWithStandardOutput.writeData(data)
}

function fail(reason) {
  say(`failed: ${reason}`)
  $.exit(1)
}

// Brightness through Apple's private DisplayServices (what the brightness keys use).
// Best effort: displays it cannot read are skipped.
function dimDisplays() {
  const saved = new Map()
  try {
    if (!$.NSBundle.bundleWithPath(DISPLAY_SERVICES).load) return saved
    ObjC.bindFunction('DisplayServicesGetBrightness', ['int', ['unsigned int', 'float *']])
    ObjC.bindFunction('DisplayServicesSetBrightness', ['int', ['unsigned int', 'float']])
    for (const display of displayIds()) {
      const level = Ref()
      if ($.DisplayServicesGetBrightness(display, level) !== 0) continue
      saved.set(display, level[0])
      $.DisplayServicesSetBrightness(display, 0)
    }
  } catch (error) {
    say(`brightness skipped: ${error}`)
  }
  return saved
}

function restoreBrightness(saved) {
  for (const [display, level] of saved) $.DisplayServicesSetBrightness(display, level)
}

function displayIds() {
  return $.NSScreen.screens.js.map(screen =>
    screen.deviceDescription.objectForKey('NSScreenNumber').unsignedIntValue)
}
