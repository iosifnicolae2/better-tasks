// The project's virtual display and its turns, for record-display.sh (which compiles and runs this).
//   display --lock <file> --name <name> --serial <n> [--size WxH]
//       makes the project's display once and keeps it (no screen redraws per recording), in a row below
//       the lowest physical screen, so the real screens never move. Kept until stopped (record-display.sh remove).
//       It looks like the main screen (see `look`); --size sets its "looks like" size instead, the scale still copied.
//   look                   prints the look the display copies: "w=.. h=.. scale=.. from=<screen>", the main
//                          screen's (the first real one when the main is virtual); from=fallback (1920x1080, 1x)
//                          when no real screen answers
//   fit <display id> [--size WxH]  sets the display's mode to that look at its scale (macOS may start it at 1x)
//   turn --lock <file> [--label text] [--max-seconds n] [--max-wait n] [--parent pid]
//       waits for the project's turn (flock: the kernel frees it if this process dies), then holds it
//       until stopped, until its time is up, or until the parent process ends.
//   info <display id>      prints "x=.. y=.. w=.. h=.. capture=.." (capture: screencapture -D's number)
//   arrange                moves every virtual display into the row below the lowest physical screen
//   screens                prints each real screen as "<display id><tab><name>", e.g. "2<tab>DELL U2720Q"
//   virtuals               prints each virtual display's id, one per line (ours and other apps')
//   dim <file>             sets each external screen's brightness to 0 over DDC/CI (Apple silicon), saving
//                          the old levels to <file> first; virtual displays have no such link, so they stay on
//   undim <file>           puts the levels saved in <file> back, then removes it
//   ddc                    reads each external screen's power and brightness over DDC/CI, to see which answer
//   off <file> <ids> <pid> turns the given screens off as macOS does for an unplugged one (no signal, so each
//                          monitor goes to its own standby; virtual displays stay on), saving the ids to <file>
//                          first; prints "ready off <ids it turned off>", then holds until <pid> ends or a
//                          signal, and turns them back on
//   on <file>              turns the screens saved in <file> back on, then removes it (the fallback if off dies)
// Never DDC power or standby: on 2026-10-06 standby (VCP 0xD6=4) left an LG and a Philips dark, their
// own buttons dead and the LG still off after a replug. Brightness is safe: the monitor's buttons undo it.
// Each prints "ready ..." once it holds what it asked for, or "failed: why".
import AppKit
import CoreGraphics
import Foundation
import IOKit

struct Options {
  var lock = "", name = "better-tasks", label = ""
  var serial: UInt32 = 1, width = 0, height = 0 // 0: the real screen's
  var maxSeconds = 1200.0, maxWait = 1800.0
  var parent: pid_t = 0
}

func parseOptions(_ arguments: ArraySlice<String>) -> Options {
  var options = Options()
  var args = arguments.makeIterator()
  while let key = args.next() {
    let value = args.next() ?? ""
    switch key {
    case "--lock": options.lock = value
    case "--name": options.name = value
    case "--label": options.label = value
    case "--serial": options.serial = UInt32(value) ?? 1
    case "--max-seconds": options.maxSeconds = Double(value) ?? options.maxSeconds
    case "--max-wait": options.maxWait = Double(value) ?? options.maxWait
    case "--parent": options.parent = pid_t(value) ?? 0
    case "--size":
      let parts = value.split(separator: "x").compactMap { Int($0) }
      if parts.count == 2 { options.width = parts[0]; options.height = parts[1] }
    default: fail("unknown option \(key)")
    }
  }
  return options
}

func say(_ line: String) {
  print(line)
  fflush(stdout)
}

func fail(_ why: String) -> Never {
  say("failed: \(why)")
  exit(1)
}

func isAlive(_ pid: pid_t) -> Bool { pid <= 0 || kill(pid, 0) == 0 || errno == EPERM }

func openLock(_ path: String) -> Int32 {
  let fd = open(path, O_RDWR | O_CREAT, 0o644)
  if fd < 0 { fail("cannot open \(path)") }
  return fd
}

func writeHolder(_ fd: Int32, _ text: String) {
  ftruncate(fd, 0)
  _ = text.withCString { pwrite(fd, $0, strlen($0), 0) }
}

// MARK: displays

func onlineDisplays() -> [CGDirectDisplayID] {
  var count: UInt32 = 0
  CGGetOnlineDisplayList(0, nil, &count)
  var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
  CGGetOnlineDisplayList(count, &ids, &count)
  return Array(ids.prefix(Int(count)))
}

func activeDisplays() -> [CGDirectDisplayID] {
  var count: UInt32 = 0
  CGGetActiveDisplayList(0, nil, &count)
  var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
  CGGetActiveDisplayList(count, &ids, &count)
  return Array(ids.prefix(Int(count)))
}

/** Vendor and serial of every real screen, as the graphics hardware (IOKit) sees them. */
func hardwareScreens() -> [(vendor: UInt32, serial: UInt32?)] {
  var screens: [(vendor: UInt32, serial: UInt32?)] = []
  func each(_ serviceClass: String, _ body: (io_service_t) -> Void) {
    var iterator: io_iterator_t = 0
    guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching(serviceClass), &iterator) == KERN_SUCCESS else { return }
    while case let service = IOIteratorNext(iterator), service != 0 {
      body(service)
      IOObjectRelease(service)
    }
    IOObjectRelease(iterator)
  }
  func property(_ service: io_service_t, _ key: String) -> Any? {
    IORegistryEntryCreateCFProperty(service, key as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue()
  }
  each("IOMobileFramebuffer") { service in // Apple silicon
    guard let attributes = property(service, "DisplayAttributes") as? [String: Any],
          let product = attributes["ProductAttributes"] as? [String: Any],
          let vendor = (product["LegacyManufacturerID"] as? NSNumber)?.uint32Value else { return }
    screens.append((vendor, (product["SerialNumber"] as? NSNumber)?.uint32Value))
  }
  each("IODisplayConnect") { service in // Intel
    guard let vendor = (property(service, "DisplayVendorID") as? NSNumber)?.uint32Value else { return }
    screens.append((vendor, (property(service, "DisplaySerialNumber") as? NSNumber)?.uint32Value))
  }
  return screens
}

func isPhysical(_ id: CGDirectDisplayID, _ screens: [(vendor: UInt32, serial: UInt32?)]) -> Bool {
  CGDisplayIsBuiltin(id) != 0 || screens.contains { screen in
    screen.vendor == CGDisplayVendorNumber(id) && (screen.serial == nil || screen.serial == CGDisplaySerialNumber(id))
  }
}

typealias Arrangement = [CGDirectDisplayID: CGPoint]

func currentArrangement() -> Arrangement {
  Dictionary(uniqueKeysWithValues: activeDisplays().map { ($0, CGDisplayBounds($0).origin) })
}

/** The row below the lowest physical screen: where virtual displays go, left to right. */
func virtualRow(_ arrangement: Arrangement) -> (physical: Set<CGDirectDisplayID>, x: CGFloat, y: CGFloat)? {
  let screens = hardwareScreens()
  let physical = Set(arrangement.keys.filter { isPhysical($0, screens) && CGDisplayMirrorsDisplay($0) == kCGNullDirectDisplay })
  let lowest = physical.map { CGRect(origin: arrangement[$0]!, size: CGDisplayBounds($0).size) }
    .max { ($0.maxY, -$0.minX) < ($1.maxY, -$1.minX) }
  guard let lowest else { return nil }
  return (physical, lowest.minX, lowest.maxY)
}

/** Sets the given displays' places in one step; the others stay. */
func place(_ origins: Arrangement) {
  var config: CGDisplayConfigRef?
  guard !origins.isEmpty, CGBeginDisplayConfiguration(&config) == .success else { return }
  for (id, origin) in origins { CGConfigureDisplayOrigin(config, id, Int32(origin.x), Int32(origin.y)) }
  CGCompleteDisplayConfiguration(config, .forSession)
  RunLoop.main.run(until: Date().addingTimeInterval(0.5))
}

/** A new display shows up where macOS likes and may push the real screens aside. This puts it at the
 *  end of the row and every other display back where it was before (`before`), in one step. */
func placeInRow(_ id: CGDirectDisplayID, before: Arrangement) {
  guard let row = virtualRow(before) else { return }
  let virtualInRow = before.filter { !row.physical.contains($0.key) && $0.value.y == row.y }
  let end = virtualInRow.map { $0.value.x + CGDisplayBounds($0.key).width }.max() ?? row.x
  var wanted = before
  wanted[id] = CGPoint(x: max(end, row.x), y: row.y)
  place(wanted.filter { CGDisplayBounds($0.key).origin != $0.value })
}

func arrangeAll() {
  guard let row = virtualRow(currentArrangement()) else { fail("no physical screen found") }
  var x = row.x
  var origins = Arrangement()
  for id in activeDisplays().filter({ !row.physical.contains($0) }).sorted() {
    origins[id] = CGPoint(x: x, y: row.y)
    x += CGDisplayBounds(id).width
  }
  place(origins)
  say("ready moved \(origins.count) virtual display(s) below the lowest physical screen")
}

func info(_ id: CGDirectDisplayID) {
  guard let index = activeDisplays().firstIndex(of: id) else { fail("display \(id) is gone") }
  let b = CGDisplayBounds(id)
  let scale = CGDisplayCopyDisplayMode(id).map { $0.pixelWidth / max(1, $0.width) } ?? 1
  say("x=\(Int(b.minX)) y=\(Int(b.minY)) w=\(Int(b.width)) h=\(Int(b.height)) scale=\(scale) capture=\(index + 1)")
}

/** How a screen looks: its size in points, pixels per point, and millimetres per pixel. */
struct Look {
  var width = 1920, height = 1080, scale = 1, millimetresPerPixel = 0.28, from = "fallback"
  var text: String { "w=\(width) h=\(height) scale=\(scale) from=\(from)" }
}

/** The main screen's look, so apps, text and recordings look the same there; the first real screen's when
 *  the main one is virtual; the fallback when no real screen answers. */
func realLook() -> Look {
  let screens = hardwareScreens()
  let physical = activeDisplays().filter { isPhysical($0, screens) && CGDisplayMirrorsDisplay($0) == kCGNullDirectDisplay }
  let main = CGMainDisplayID()
  guard let id = physical.contains(main) ? main : physical.first,
        let mode = CGDisplayCopyDisplayMode(id), mode.width > 0, mode.pixelWidth > 0 else { return Look() }
  let millimetres = CGDisplayScreenSize(id).width
  return Look(width: mode.width, height: mode.height, scale: max(1, mode.pixelWidth / mode.width),
              millimetresPerPixel: millimetres > 0 ? millimetres / Double(mode.pixelWidth) : 0.28 / Double(mode.pixelWidth / mode.width),
              from: screenNames()[id] ?? "Display \(id)")
}

/** The look the project's display gets: the real one, at --size when given. */
func wantedLook(_ options: Options) -> Look {
  var look = realLook()
  if options.width > 0 && options.height > 0 { look.width = options.width; look.height = options.height }
  return look
}

/** The real screens by the names System Settings shows ("Built-in Retina Display", "DELL U2720Q"). */
func screenNames() -> [CGDirectDisplayID: String] {
  Dictionary(NSScreen.screens.compactMap { screen -> (CGDirectDisplayID, String)? in
    guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { return nil }
    return (number.uint32Value, screen.localizedName)
  }, uniquingKeysWith: { first, _ in first })
}

func listScreens() {
  let screens = hardwareScreens()
  let names = screenNames()
  for id in activeDisplays() where isPhysical(id, screens) && CGDisplayMirrorsDisplay(id) == kCGNullDirectDisplay {
    say("\(id)\t\(names[id] ?? "Display \(id)")")
  }
}

func listVirtuals() {
  let screens = hardwareScreens()
  for id in activeDisplays() where !isPhysical(id, screens) { say("\(id)") }
}

// MARK: DDC/CI: the external screens' own controls, over the video cable

let ddcChip: UInt32 = 0x37, ddcHost: UInt32 = 0x51
let powerMode: UInt8 = 0xD6 // VCP code, read only (see the top: never written)
let brightness: UInt8 = 0x10

/** The I2C links of the external screens; the built-in screen and virtual displays have none. */
func externalLinks() -> [IOAVService] {
  var links: [IOAVService] = []
  var iterator: io_iterator_t = 0
  guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("DCPAVServiceProxy"), &iterator) == KERN_SUCCESS else { return [] }
  while case let service = IOIteratorNext(iterator), service != 0 {
    let location = IORegistryEntryCreateCFProperty(service, "Location" as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue() as? String
    if location == "External", let link = IOAVServiceCreateWithService(kCFAllocatorDefault, service) {
      links.append(link.takeRetainedValue())
    }
    IOObjectRelease(service)
  }
  IOObjectRelease(iterator)
  return links
}

/** A DDC packet: its bytes, then their checksum (which counts the host's addresses too). */
func ddcPacket(_ bytes: [UInt8]) -> [UInt8] {
  bytes + [bytes.reduce(UInt8(0x6E ^ 0x51), ^)]
}

func ddcWrite(_ link: IOAVService, _ code: UInt8, _ value: UInt16) -> Bool {
  var packet = ddcPacket([0x84, 0x03, code, UInt8(value >> 8), UInt8(value & 0xFF)])
  for _ in 0..<3 {
    if IOAVServiceWriteI2C(link, ddcChip, ddcHost, &packet, UInt32(packet.count)) == kIOReturnSuccess { return true }
    usleep(20_000)
  }
  return false
}

func ddcRead(_ link: IOAVService, _ code: UInt8) -> (current: UInt16, max: UInt16)? {
  var request = ddcPacket([0x82, 0x01, code])
  var reply = [UInt8](repeating: 0, count: 12)
  for _ in 0..<3 {
    usleep(20_000)
    guard IOAVServiceWriteI2C(link, ddcChip, ddcHost, &request, UInt32(request.count)) == kIOReturnSuccess else { continue }
    usleep(50_000)
    guard IOAVServiceReadI2C(link, ddcChip, ddcHost, &reply, UInt32(reply.count)) == kIOReturnSuccess,
          reply[2] == 0x02, reply[3] == 0, reply[4] == code else { continue }
    return (UInt16(reply[8]) << 8 | UInt16(reply[9]), UInt16(reply[6]) << 8 | UInt16(reply[7]))
  }
  return nil
}

/** Saves "<screen index> <level>" per external screen that answers, then sets each to 0. */
func dim(_ file: String) {
  let levels = externalLinks().enumerated().compactMap { index, link in
    ddcRead(link, brightness).map { (index, link, $0.current) }
  }
  let saved = levels.map { "\($0.0) \($0.2)\n" }.joined()
  guard (try? saved.write(toFile: file, atomically: true, encoding: .utf8)) != nil else { fail("cannot write \(file)") }
  let done = levels.filter { ddcWrite($0.1, brightness, 0) }.count
  say("ready dimmed \(done) screen(s)")
}

func undim(_ file: String) {
  guard let saved = try? String(contentsOfFile: file, encoding: .utf8) else { return say("ready nothing to undim") }
  let links = externalLinks()
  var done = 0
  for line in saved.split(separator: "\n") {
    let parts = line.split(separator: " ").compactMap { Int($0) }
    if parts.count == 2, parts[0] < links.count, ddcWrite(links[parts[0]], brightness, UInt16(parts[1])) { done += 1 }
  }
  try? FileManager.default.removeItem(atPath: file)
  say("ready undimmed \(done) screen(s)")
}

func listDdc() {
  let describe = { (value: (current: UInt16, max: UInt16)?) in value.map { "\($0.current)/\($0.max)" } ?? "no answer" }
  for (index, link) in externalLinks().enumerated() {
    say("external \(index + 1): power \(describe(ddcRead(link, powerMode))), brightness \(describe(ddcRead(link, brightness)))")
  }
}

/** A display that looks like `look`: its size in points, backed by scale times as many pixels (HiDPI). */
func makeDisplay(_ options: Options, _ look: Look) -> CGVirtualDisplay {
  let (pixelsWide, pixelsHigh) = (look.width * look.scale, look.height * look.scale)
  let descriptor = CGVirtualDisplayDescriptor()
  descriptor.queue = DispatchQueue.main
  descriptor.name = options.name
  descriptor.maxPixelsWide = UInt32(pixelsWide)
  descriptor.maxPixelsHigh = UInt32(pixelsHigh)
  descriptor.sizeInMillimeters = CGSize(width: Double(pixelsWide) * look.millimetresPerPixel,
                                        height: Double(pixelsHigh) * look.millimetresPerPixel)
  descriptor.vendorID = 0xB7A5 // the same ids each time: macOS puts the project's display back where it was
  descriptor.productID = 0x0001
  descriptor.serialNum = options.serial
  guard let display = CGVirtualDisplay(descriptor: descriptor) else { fail("macOS refused to make a virtual display") }
  let settings = CGVirtualDisplaySettings()
  settings.hiDPI = look.scale > 1 ? 1 : 0
  settings.modes = [CGVirtualDisplayMode(width: UInt(look.width), height: UInt(look.height), refreshRate: 30)]
  if !display.apply(settings) { fail("macOS refused the display's look \(look.text)") }
  for _ in 0..<50 where !activeDisplays().contains(display.displayID) {
    RunLoop.main.run(until: Date().addingTimeInterval(0.1))
  }
  if !activeDisplays().contains(display.displayID) { fail("the virtual display did not come up") }
  return display
}

/** macOS offers the look's mode at 1x and at its scale, and may start at 1x: this picks the one at its scale.
 *  Run from another process than the display's keeper, which sees no modes for its own display. */
func fit(_ id: CGDirectDisplayID, _ look: Look) {
  let options = [kCGDisplayShowDuplicateLowResolutionModes: kCFBooleanTrue] as CFDictionary
  let pixelsWide = look.width * look.scale
  for _ in 0..<25 {
    if CGDisplayCopyDisplayMode(id)?.pixelWidth == pixelsWide { say("ready \(look.text)"); exit(0) }
    let modes = CGDisplayCopyAllDisplayModes(id, options) as? [CGDisplayMode] ?? []
    if let mode = modes.first(where: { $0.width == look.width && $0.height == look.height && $0.pixelWidth == pixelsWide }) {
      var config: CGDisplayConfigRef?
      if CGBeginDisplayConfiguration(&config) == .success {
        CGConfigureDisplayWithDisplayMode(config, id, mode, nil)
        CGCompleteDisplayConfiguration(config, .forSession)
      }
    }
    RunLoop.main.run(until: Date().addingTimeInterval(0.2))
  }
  fail("macOS kept display \(id) at \(CGDisplayCopyDisplayMode(id).map { $0.pixelWidth / max(1, $0.width) } ?? 0)x, not \(look.scale)x")
}

// MARK: screens off: disabled, as if unplugged; macOS keeps it after we exit, so every way out turns them on

typealias SetDisplayEnabled = @convention(c) (CGDisplayConfigRef?, CGDirectDisplayID, Bool) -> CGError
let setDisplayEnabled = dlsym(dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_NOW),
                              "SLSConfigureDisplayEnabled").map { unsafeBitCast($0, to: SetDisplayEnabled.self) }

/** Turns each display on or off, one by one (macOS may refuse one, e.g. the last); returns those it took. */
func setEnabled(_ ids: [CGDirectDisplayID], _ enabled: Bool) -> [CGDirectDisplayID] {
  guard let setDisplayEnabled else { return [] }
  return ids.filter { id in
    var config: CGDisplayConfigRef?
    guard CGBeginDisplayConfiguration(&config) == .success else { return false }
    guard setDisplayEnabled(config, id, enabled) == .success else { CGCancelDisplayConfiguration(config); return false }
    return CGCompleteDisplayConfiguration(config, .forSession) == .success
  }
}

func screensOff(_ file: String, _ ids: [CGDirectDisplayID], parent: pid_t) -> Never {
  guard parent > 0 else { fail("off needs the pid it holds for") }
  guard (try? ids.map { "\($0)\n" }.joined().write(toFile: file, atomically: true, encoding: .utf8)) != nil else { fail("cannot write \(file)") }
  let done = setEnabled(ids, false)
  say("ready off \(done.map(String.init).joined(separator: ","))")
  for signalNumber in [SIGTERM, SIGINT, SIGHUP] {
    signal(signalNumber, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
    source.setEventHandler { screensOn(file) }
    source.resume()
    signalSources.append(source)
  }
  while isAlive(parent) { RunLoop.main.run(until: Date().addingTimeInterval(0.1)) }
  screensOn(file)
}

func screensOn(_ file: String) -> Never {
  guard let saved = try? String(contentsOfFile: file, encoding: .utf8) else { say("ready nothing to turn on"); exit(0) }
  let ids = saved.split(separator: "\n").compactMap { CGDirectDisplayID($0) }
  let done = setEnabled(ids, true)
  try? FileManager.default.removeItem(atPath: file)
  say("ready on \(done.count) screen(s)")
  exit(0)
}

// MARK: modes

func onSignalsExit() {
  for signalNumber in [SIGTERM, SIGINT, SIGHUP] {
    signal(signalNumber, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
    source.setEventHandler { exit(0) }
    source.resume()
    signalSources.append(source)
  }
}

/** Keeps the project's one display until `remove` or logout: each removal and first creation re-lays out the displays. */
func keepDisplay(_ options: Options) -> Never {
  let lock = openLock(options.lock)
  if flock(lock, LOCK_EX | LOCK_NB) != 0 { fail("this project's display is already kept by another process") }
  let before = currentArrangement()
  let look = wantedLook(options)
  let display = makeDisplay(options, look)
  placeInRow(display.displayID, before: before)
  writeHolder(lock, "pid \(getpid()) display \(display.displayID) \(look.text)\n")
  say("ready id=\(display.displayID) pid=\(getpid()) look=\(look.width)x\(look.height)@\(look.scale)")
  onSignalsExit()
  RunLoop.main.run()
  exit(0)
}

func holdTurn(_ options: Options) -> Never {
  let fd = openLock(options.lock)
  let deadline = Date().addingTimeInterval(options.maxWait)
  var toldWaiting = false
  while flock(fd, LOCK_EX | LOCK_NB) != 0 {
    if !toldWaiting {
      let holder = (try? String(contentsOfFile: options.lock, encoding: .utf8)) ?? ""
      say("waiting: another recording in this project has the display (\(holder.trimmingCharacters(in: .whitespacesAndNewlines)))")
      toldWaiting = true
    }
    if !isAlive(options.parent) { exit(0) }
    if Date() > deadline { fail("still taken after \(Int(options.maxWait)) s") }
    Thread.sleep(forTimeInterval: 1)
  }
  writeHolder(fd, "pid \(getpid()) \(options.label) since \(ISO8601DateFormatter().string(from: Date()))\n")
  say("ready pid=\(getpid())")
  onSignalsExit()
  let end = Date().addingTimeInterval(options.maxSeconds)
  while Date() < end && isAlive(options.parent) {
    RunLoop.main.run(until: Date().addingTimeInterval(1))
  }
  exit(0)
}

var signalSources: [DispatchSourceSignal] = []
let arguments = CommandLine.arguments.dropFirst()
switch arguments.first {
case "display": keepDisplay(parseOptions(arguments.dropFirst()))
case "turn": holdTurn(parseOptions(arguments.dropFirst()))
case "fit": fit(CGDirectDisplayID(arguments.dropFirst().first ?? "") ?? 0, wantedLook(parseOptions(arguments.dropFirst(2))))
case "look": say(wantedLook(parseOptions(arguments.dropFirst())).text)
case "info": info(CGDirectDisplayID(arguments.dropFirst().first ?? "") ?? 0)
case "arrange": arrangeAll()
case "screens": listScreens()
case "virtuals": listVirtuals()
case "dim": dim(arguments.dropFirst().first ?? "")
case "undim": undim(arguments.dropFirst().first ?? "")
case "ddc": listDdc()
case "off":
  let rest = Array(arguments.dropFirst())
  guard rest.count == 3 else { fail("usage: record_display off <file> <ids> <pid>") }
  screensOff(rest[0], rest[1].split(separator: ",").compactMap { CGDirectDisplayID($0) }, parent: pid_t(rest[2]) ?? 0)
case "on": screensOn(arguments.dropFirst().first ?? "")
default: fail("usage: record_display display|turn|look|fit|info|arrange|screens|virtuals|dim|undim|ddc|off|on ...")
}
