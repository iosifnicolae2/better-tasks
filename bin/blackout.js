// Covers the physical screens in black until the first mouse move or key press; virtual
// displays (the projects' test and recording displays) stay on, so teammates keep working.
// Run:     osascript -l JavaScript bin/blackout.js <statusFile> <physicalIds> [safetySeconds]
//          physicalIds: the real screens' display ids, "1,2"; empty: guessed (not our virtual vendor id).
// Plan:    osascript -l JavaScript bin/blackout.js --plan <physicalIds>  prints the screens it would cover
// Restore: osascript -l JavaScript bin/blackout.js --restore <statusFile>
// Writes "black" (or "failed: why") to <statusFile> once the windows are up, and the
// brightness it lowers to <statusFile>.brightness first, so --restore can put it back
// even if this process is killed (JXA cannot catch signals). bin/away.sh runs both.
ObjC.import('Cocoa')
ObjC.import('CoreGraphics')

const ANY_INPUT = 4294967295 // kCGAnyInputEventType
const HARDWARE_INPUT = 1 // kCGEventSourceStateHIDSystemState: the user's own mouse and keys, not posted events
const VIRTUAL_VENDOR = 0xB7A5 // record_display.swift's virtual displays
const GRACE_SECONDS = 1 // ignores the key-up of the command that started us
const DISPLAY_SERVICES = '/System/Library/PrivateFrameworks/DisplayServices.framework'

function run(argv) {
  if (argv[0] === '--restore') return restoreBrightness(argv[1])
  if (argv[0] === '--plan') return physicalScreens(argv[1]).map(describe).join('\n')
  const [statusFile, physicalIds, safety] = argv
  const safetySeconds = Number(safety) || Infinity
  const app = $.NSApplication.sharedApplication
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory)

  const screens = physicalScreens(physicalIds)
  if (screens.length === 0) return writeFile(statusFile, 'failed: no physical screens')
  const windows = screens.map(blackWindow)
  app.activateIgnoringOtherApps(true)
  $.NSCursor.hide
  dimDisplays(statusFile, screens.map(displayId))
  writeFile(statusFile, 'black')

  const shownAt = Date.now()
  while (!userIsBack(shownAt) && secondsSince(shownAt) < safetySeconds) {
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.25))
  }

  restoreBrightness(statusFile)
  $.NSCursor.unhide
  windows.forEach(window => window.orderOut(null))
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

function describe(screen) {
  return `${displayId(screen)}\t${screen.localizedName.js}`
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
