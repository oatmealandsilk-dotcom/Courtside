import ImageIO
import UIKit
import UniformTypeIdentifiers

/*
 * iOS's own saved pictures of the launch screen (Nov 2, owner: "if someone selects night, then the
 * opening screen is always night, if it's day it's always day … It shouldn't ever load black and load
 * into white or vise versa").
 *
 * The very first frame after the icon is tapped is not drawn by the app at all: iOS draws a picture of
 * the launch screen it saved earlier, before any of the app runs, one picture per light and dark mode
 * of the phone (in the app's own Library/SplashBoard/Snapshots/<bundle id> - {DEFAULT GROUP} folder,
 * .ktx files in Apple's own picture format; seen on the iOS 27 simulator, Nov 2). Nothing Apple offers
 * lets an app pick which look that picture has. What this does, as LLDynamicLaunchScreen does
 * (github.com/internetWei/LLDynamicLaunchScreen, shipped in App Store apps since 2021):
 *
 *  - draws the launch screen itself in both looks, from the same storyboard iOS uses (LaunchDrawing);
 *  - tells which of iOS's pictures is the light one and which the dark one by comparing each with
 *    those two drawings, and only ever touches a picture that closely matches one of them (so the
 *    drawings are proved to be what iOS would draw, and nothing that is not a launch picture is ever
 *    touched); a copy of each is kept to put back;
 *  - writes the look picked over every one of them (light and dark mode alike), in iOS's own picture
 *    format where the phone can write it, and reads the result back before it goes in;
 *  - puts iOS's own pictures back when the setting is the phone's mode again.
 *
 * iOS throws its pictures away and draws new ones after an app update, a change of language or text
 * size, and whenever it likes. A picture iOS made itself is told apart from ours by its size and date
 * (the records below), so that open simply shows the phone's look (as before this change) and the
 * pictures are put right again a few seconds later, for the next open.
 *
 * Off unless the app's code switches it on (src/lib/launchLook.ts). Native code: a new App Store build.
 */
final class LaunchSnapshots {
  static let shared = LaunchSnapshots()

  /// What is known about each of iOS's pictures, by its path inside iOS's folder.
  struct Record: Codable {
    /// The phone's mode iOS drew it for: "light", "dark", or "other" (not a launch picture we recognise: never touched).
    var mode: String
    /// The look written over it ("light" or "dark"); nil while it is iOS's own.
    var ours: String?
    /// Its size in bytes and modification date when last seen, to tell a picture iOS has drawn again since.
    var size: Int64
    var mtime: Double
    var width: Int
    var height: Int
    /// Its picture format (a type identifier, e.g. com.apple.atx), as iOS wrote it.
    var type: String
  }

  static let recordsKey = "CourtSideLaunchLookPictures"
  /// What the last look-over found, for the simulator checks (LaunchLookModule's status).
  private(set) var lastReport: [String: Any] = [:]
  private let queue = DispatchQueue(label: "co.courtside.launch-look", qos: .utility)
  private var running = false
  private var again: (look: LaunchLookStyle?, mode: SnapshotMode, done: [() -> Void])?

  // MARK: Where things are

  /// iOS's folder of launch pictures for this app; nil where there is none (yet).
  static var folder: URL? {
    guard let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first,
          let bundleID = Bundle.main.bundleIdentifier else { return nil }
    let url = library
      .appendingPathComponent("SplashBoard", isDirectory: true)
      .appendingPathComponent("Snapshots", isDirectory: true)
      .appendingPathComponent("\(bundleID) - {DEFAULT GROUP}", isDirectory: true)
    var isFolder: ObjCBool = false
    return FileManager.default.fileExists(atPath: url.path, isDirectory: &isFolder) && isFolder.boolValue ? url : nil
  }

  /// Where the copies of iOS's own pictures are kept (the app's own folder, never iOS's).
  static var originals: URL? {
    guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
    return support.appendingPathComponent("CourtSideLaunchLook/originals", isDirectory: true)
  }

  struct Found {
    let rel: String
    let url: URL
    let size: Int64
    let mtime: Double
  }

  /// Every file in iOS's folder (sub-folders too), by its path inside it.
  static func files(in folder: URL) -> [Found] {
    let keys: [URLResourceKey] = [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
    guard let walk = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles]) else { return [] }
    let base = folder.standardizedFileURL.path
    var found: [Found] = []
    for case let url as URL in walk {
      guard let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true else { continue }
      let path = url.standardizedFileURL.path
      let rel = path.hasPrefix(base) ? String(path.dropFirst(base.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/")) : url.lastPathComponent
      found.append(Found(
        rel: rel,
        url: url,
        size: Int64(values.fileSize ?? 0),
        mtime: values.contentModificationDate?.timeIntervalSince1970 ?? 0
      ))
    }
    return found.sorted { $0.rel < $1.rel }
  }

  static func loadRecords() -> [String: Record] {
    guard let data = UserDefaults.standard.data(forKey: recordsKey),
          let records = try? JSONDecoder().decode([String: Record].self, from: data) else { return [:] }
    return records
  }

  static func saveRecords(_ records: [String: Record]) {
    if records.isEmpty {
      UserDefaults.standard.removeObject(forKey: recordsKey)
    } else if let data = try? JSONEncoder().encode(records) {
      UserDefaults.standard.set(data, forKey: recordsKey)
    }
  }

  private static func same(_ record: Record, _ file: Found) -> Bool {
    record.size == file.size && abs(record.mtime - file.mtime) < 0.001
  }

  // MARK: At launch (main thread, a handful of file reads)

  /**
   * Whether the picture iOS showed this open was ours, in `look`: every picture there is one we know
   * (none drawn again by iOS since), and those for the phone's mode right now carry `look`.
   */
  static func pictureWasOurs(mode: LaunchLookStyle, look: LaunchLookStyle) -> Bool {
    guard let folder = folder else { return false }
    let records = loadRecords()
    let files = files(in: folder)
    var sawMode = false
    for file in files {
      guard let record = records[file.rel], same(record, file) else { return false }
      if record.mode == mode.rawValue {
        sawMode = true
        if record.ours != look.rawValue { return false }
      }
    }
    return sawMode
  }

  /// Whether any of iOS's pictures carries a look we wrote (so it is to be put back when the setting goes).
  static var anyOurs: Bool {
    loadRecords().values.contains { $0.ours != nil }
  }

  // MARK: Putting the look in (drawings on the main thread, files off it)

  /**
   * Brings iOS's pictures in line with `look` (nil: iOS's own, put back). `done` runs on the main
   * thread once it has finished. One at a time: asked again while it runs, it runs once more after.
   */
  func sync(look: LaunchLookStyle?, mode: SnapshotMode, done: (() -> Void)? = nil) {
    dispatchPrecondition(condition: .onQueue(.main))
    if running {
      var next = again ?? (look: look, mode: mode, done: [])
      next.look = look
      next.mode = mode
      if let done { next.done.append(done) }
      again = next
      return
    }
    let records = Self.loadRecords()
    guard let folder = Self.folder else {
      lastReport = ["folder": NSNull(), "at": Date().timeIntervalSince1970, "note": "iOS has no launch pictures for this app yet"]
      if records.isEmpty == false { Self.saveRecords([:]) }
      done?()
      return
    }
    let writeLook: LaunchLookStyle? = mode == .off ? nil : look
    let job: () -> ([String: Record], [String: Any])
    if writeLook == nil {
      // The phone's own look: iOS's pictures are left alone, unread, unless some are ours (put back, nothing drawn).
      guard records.values.contains(where: { $0.ours != nil }) else {
        lastReport = ["folder": folder.path, "at": Date().timeIntervalSince1970, "note": "nothing to do: the phone's own look, and no picture of ours there"]
        if records.isEmpty == false { Self.saveRecords([:]) }
        done?()
        return
      }
      job = { Self.putAllBack(folder: folder, records: records) }
    } else if let writeLook, Self.inPlace(folder: folder, records: records, look: writeLook) {
      // Every picture already ours, in this look, and none drawn again by iOS since: nothing drawn, nothing written.
      lastReport = ["folder": folder.path, "at": Date().timeIntervalSince1970, "look": writeLook.rawValue, "note": "already in place"]
      done?()
      return
    } else {
      guard let light = LaunchDrawing.draw(.light), let dark = LaunchDrawing.draw(.dark) else {
        lastReport = ["folder": folder.path, "at": Date().timeIntervalSince1970, "problems": ["the launch screen could not be drawn in both looks, so nothing was written"]]
        done?()
        return
      }
      job = { Self.work(folder: folder, records: records, light: light, dark: dark, look: writeLook, mode: mode) }
    }
    running = true
    queue.async { [weak self] in
      let (kept, report) = job()
      DispatchQueue.main.async {
        guard let self else { return }
        Self.saveRecords(kept)
        self.lastReport = report
        self.running = false
        done?()
        if let next = self.again {
          self.again = nil
          self.sync(look: next.look, mode: next.mode) { next.done.forEach { $0() } }
        }
      }
    }
  }

  /// Every file iOS has there is known and unchanged, and every launch picture among them carries `look`.
  private static func inPlace(folder: URL, records: [String: Record], look: LaunchLookStyle) -> Bool {
    let files = files(in: folder)
    var any = false
    for file in files {
      guard let record = records[file.rel], same(record, file) else { return false }
      if record.mode == "other" { continue }
      any = true
      if record.ours != look.rawValue { return false }
    }
    return any
  }

  /// Back to the phone's own look: iOS's own pictures put back wherever ours still stand; the copies then go.
  private static func putAllBack(folder: URL, records: [String: Record]) -> ([String: Record], [String: Any]) {
    var kept: [String: Record] = [:]
    var problems: [String] = []
    for file in files(in: folder) {
      guard let record = records[file.rel], record.ours != nil, same(record, file) else { continue }
      if !putBack(file) {
        // Still ours: kept, to try again next time.
        problems.append("\(file.rel): could not be put back")
        kept[file.rel] = record
      }
    }
    dropOriginals(keeping: Set(kept.keys))
    let report: [String: Any] = [
      "folder": folder.path,
      "at": Date().timeIntervalSince1970,
      "look": NSNull(),
      "note": "iOS's own pictures put back",
      "problems": problems,
    ]
    return (kept, report)
  }

  private static func work(folder: URL, records: [String: Record], light: CGImage, dark: CGImage, look: LaunchLookStyle?, mode: SnapshotMode) -> ([String: Record], [String: Any]) {
    var kept: [String: Record] = [:]
    var problems: [String] = []
    var rows: [[String: Any]] = []
    let lightGrid = Grid(light)
    let darkGrid = Grid(dark)
    let files = files(in: folder)
    for file in files {
      var record: Record
      if let known = records[file.rel], same(known, file) {
        record = known
      } else {
        // iOS's own picture (new, or drawn again since we last looked): which look it is, and a copy kept.
        guard let image = decode(file.url), let type = typeOf(file.url) else {
          problems.append("\(file.rel): could not be read")
          kept[file.rel] = Record(mode: "other", ours: nil, size: file.size, mtime: file.mtime, width: 0, height: 0, type: "")
          continue
        }
        let found = classify(image, light: lightGrid, dark: darkGrid)
        if found != "other" && !keepOriginal(file) {
          problems.append("\(file.rel): no copy could be kept, so it is left alone")
          kept[file.rel] = Record(mode: "other", ours: nil, size: file.size, mtime: file.mtime, width: image.width, height: image.height, type: type)
          continue
        }
        record = Record(mode: found, ours: nil, size: file.size, mtime: file.mtime, width: image.width, height: image.height, type: type)
      }
      let wanted: LaunchLookStyle? = record.mode == "other" ? nil : look
      if let wanted, record.ours != wanted.rawValue {
        if write(wanted == .dark ? dark : light, over: file.url, width: record.width, height: record.height, type: record.type, mode: mode) {
          record.ours = wanted.rawValue
        } else {
          problems.append("\(file.rel): the \(wanted.rawValue) look could not be written in \(record.type)")
          if record.ours != nil {
            // Ours in the other look and nothing new could go in: iOS's own back, rather than the wrong look.
            if putBack(file) { record.ours = nil } else { problems.append("\(file.rel): could not be put back") }
          }
        }
      } else if wanted == nil, record.ours != nil {
        if putBack(file) { record.ours = nil } else { problems.append("\(file.rel): could not be put back") }
      }
      if let now = attributes(file.url) {
        record.size = now.size
        record.mtime = now.mtime
      }
      kept[file.rel] = record
      rows.append(["path": file.rel, "mode": record.mode, "ours": record.ours ?? NSNull(), "type": record.type, "width": record.width, "height": record.height])
    }
    dropOriginals(keeping: Set(kept.compactMap { $0.value.mode == "other" ? nil : $0.key }))
    let writable = (CGImageDestinationCopyTypeIdentifiers() as? [String]) ?? []
    let report: [String: Any] = [
      "folder": folder.path,
      "at": Date().timeIntervalSince1970,
      "look": look?.rawValue ?? NSNull(),
      "mode": mode.rawValue,
      "files": rows,
      "problems": problems,
      "writableTypes": writable,
    ]
    return (kept, report)
  }

  // MARK: Pictures

  static func decode(_ url: URL) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
  }

  static func typeOf(_ url: URL) -> String? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceGetType(source) as String?
  }

  static func attributes(_ url: URL) -> (size: Int64, mtime: Double)? {
    guard let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey]) else { return nil }
    return (Int64(values.fileSize ?? 0), values.contentModificationDate?.timeIntervalSince1970 ?? 0)
  }

  /**
   * Which of the two drawings a picture is: "light" or "dark" only when it is close to one (the
   * same launch screen, the same look) and far from the other; anything else is "other".
   */
  static func classify(_ image: CGImage, light: Grid, dark: Grid) -> String {
    // Only the upright launch picture: the app is portrait only, and its drawings are upright.
    let aspect = Double(image.width) / Double(max(1, image.height))
    guard abs(aspect - light.aspect) < 0.02 else { return "other" }
    let grid = Grid(image)
    let toLight = grid.distance(to: light)
    let toDark = grid.distance(to: dark)
    let near = min(toLight, toDark)
    let far = max(toLight, toDark)
    guard near < 14, far - near > 40 else { return "other" }
    return toLight < toDark ? "light" : "dark"
  }

  /// A drawing scaled to exactly the size of iOS's picture.
  static func scaled(_ image: CGImage, width: Int, height: Int) -> CGImage? {
    if image.width == width && image.height == height { return image }
    guard width > 0, height > 0,
          let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return context.makeImage()
  }

  /**
   * Writes a drawing over one of iOS's pictures: in its own format where the phone can write it
   * ('same' and 'png'), else as PNG ('png' only; LLDynamicLaunchScreen's way). The new picture is
   * made beside the app's own copies, read back, and only then put in iOS's place, keeping the
   * file's own name and settings.
   */
  static func write(_ drawing: CGImage, over url: URL, width: Int, height: Int, type: String, mode: SnapshotMode) -> Bool {
    guard mode != .off, let image = scaled(drawing, width: width, height: height), let folder = originals else { return false }
    let writable = (CGImageDestinationCopyTypeIdentifiers() as? [String]) ?? []
    let format: String
    if writable.contains(type) {
      format = type
    } else if mode == .png {
      format = UTType.png.identifier
    } else {
      return false
    }
    let temp = folder.deletingLastPathComponent().appendingPathComponent("writing-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: temp) }
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    } catch {
      return false
    }
    guard let destination = CGImageDestinationCreateWithURL(temp as CFURL, format as CFString, 1, nil) else { return false }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { return false }
    // Read back first: a picture this phone cannot read is never put in iOS's place (a black launch).
    guard let check = decode(temp), check.width == width, check.height == height else { return false }
    do {
      _ = try FileManager.default.replaceItemAt(url, withItemAt: temp)
      return true
    } catch {
      return false
    }
  }

  // MARK: iOS's own pictures, kept and put back

  private static func originalURL(_ rel: String) -> URL? {
    guard let folder = originals else { return nil }
    let name = rel.replacingOccurrences(of: "/", with: "__")
    return folder.appendingPathComponent(name)
  }

  /// A copy of iOS's own picture, made before anything is written over it.
  static func keepOriginal(_ file: Found) -> Bool {
    guard let folder = originals, let copy = originalURL(file.rel) else { return false }
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      if FileManager.default.fileExists(atPath: copy.path) { try FileManager.default.removeItem(at: copy) }
      try FileManager.default.copyItem(at: file.url, to: copy)
      return true
    } catch {
      return false
    }
  }

  /// iOS's own picture back in its place (the kept copy stays, should the look be picked again).
  static func putBack(_ file: Found) -> Bool {
    guard let copy = originalURL(file.rel), FileManager.default.fileExists(atPath: copy.path),
          let folder = originals else { return false }
    let temp = folder.deletingLastPathComponent().appendingPathComponent("putting-back-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: temp) }
    do {
      try FileManager.default.copyItem(at: copy, to: temp)
      _ = try FileManager.default.replaceItemAt(file.url, withItemAt: temp)
      return true
    } catch {
      return false
    }
  }

  /// Copies of pictures iOS has since thrown away go too.
  static func dropOriginals(keeping: Set<String>) {
    guard let folder = originals,
          let names = try? FileManager.default.contentsOfDirectory(atPath: folder.path) else { return }
    let wanted = Set(keeping.compactMap { originalURL($0)?.lastPathComponent })
    for name in names where !wanted.contains(name) {
      try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
    }
  }
}

/// A picture boiled down to a small grid of colours, to compare two launch pictures whatever their size or format.
struct Grid {
  static let columns = 12
  static let rows = 26
  let values: [UInt8]
  let aspect: Double

  init(_ image: CGImage) {
    aspect = Double(image.width) / Double(max(1, image.height))
    var pixels = [UInt8](repeating: 0, count: Grid.columns * Grid.rows * 4)
    pixels.withUnsafeMutableBytes { buffer in
      guard let context = CGContext(data: buffer.baseAddress, width: Grid.columns, height: Grid.rows, bitsPerComponent: 8, bytesPerRow: Grid.columns * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return }
      context.interpolationQuality = .medium
      context.draw(image, in: CGRect(x: 0, y: 0, width: Grid.columns, height: Grid.rows))
    }
    values = pixels
  }

  /// How far apart two grids are: the mean difference of their red, green and blue, 0 to 255.
  func distance(to other: Grid) -> Double {
    var total = 0
    var count = 0
    for index in stride(from: 0, to: min(values.count, other.values.count), by: 4) {
      for channel in 0..<3 {
        total += abs(Int(values[index + channel]) - Int(other.values[index + channel]))
        count += 1
      }
    }
    return count == 0 ? 255 : Double(total) / Double(count)
  }

  /// The colour at one cell (column, row from the top), red, green and blue.
  func cell(_ column: Int, _ row: Int) -> (Int, Int, Int) {
    let index = (row * Grid.columns + column) * 4
    return (Int(values[index]), Int(values[index + 1]), Int(values[index + 2]))
  }
}

/// The launch screen drawn by the app itself, from the same storyboard iOS draws its pictures from.
enum LaunchDrawing {
  static var storyboardName: String {
    Bundle.main.object(forInfoDictionaryKey: "UILaunchStoryboardName") as? String ?? "SplashScreen"
  }

  /**
   * The launch screen in one look, upright, at the screen's own size and scale. Nil when it could not
   * be drawn, or when the drawing is not what it should be: its ground must be the storyboard's own
   * background colour in that look, and something (the mark) must be on it. A drawing that failed
   * (black, blank) is never written over iOS's pictures.
   */
  static func draw(_ look: LaunchLookStyle) -> CGImage? {
    dispatchPrecondition(condition: .onQueue(.main))
    let name = storyboardName
    guard Bundle.main.path(forResource: name, ofType: "storyboardc") != nil,
          let controller = UIStoryboard(name: name, bundle: nil).instantiateInitialViewController() else { return nil }
    let traits = UITraitCollection(userInterfaceStyle: look.interfaceStyle)
    controller.overrideUserInterfaceStyle = look.interfaceStyle
    guard let view = controller.view else { return nil }
    view.overrideUserInterfaceStyle = look.interfaceStyle
    let screen = UIScreen.main
    let size = CGSize(width: min(screen.bounds.width, screen.bounds.height), height: max(screen.bounds.width, screen.bounds.height))
    let bounds = CGRect(origin: .zero, size: size)
    let format = UIGraphicsImageRendererFormat()
    format.scale = screen.scale
    format.opaque = true
    // Plain 8-bit colour, as iOS's own pictures are, never the wide-range kind a picture format may not take.
    format.preferredRange = .standard
    var picture: UIImage?
    traits.performAsCurrent {
      view.frame = bounds
      if #available(iOS 17.0, *) { view.updateTraitsIfNeeded() }
      view.setNeedsLayout()
      view.layoutIfNeeded()
      // The ground, in this look, whatever the view resolved it to before its look was set.
      if let ground = view.backgroundColor { view.backgroundColor = ground.resolvedColor(with: traits) }
      picture = UIGraphicsImageRenderer(bounds: bounds, format: format).image { context in
        view.layer.render(in: context.cgContext)
      }
    }
    guard let image = picture?.cgImage else { return nil }
    return looksRight(image, look: look, traits: traits) ? image : nil
  }

  /// The drawing's corner is the storyboard's ground in this look, and the drawing is not one flat colour.
  private static func looksRight(_ image: CGImage, look: LaunchLookStyle, traits: UITraitCollection) -> Bool {
    let grid = Grid(image)
    let corner = grid.cell(0, 0)
    if let ground = UIColor(named: "SplashScreenBackground")?.resolvedColor(with: traits) {
      var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
      if ground.getRed(&red, green: &green, blue: &blue, alpha: &alpha) {
        let expected = (Int(red * 255), Int(green * 255), Int(blue * 255))
        let off = abs(corner.0 - expected.0) + abs(corner.1 - expected.1) + abs(corner.2 - expected.2)
        if off > 24 { return false }
      }
    }
    // Something on the ground: some cell differs from the corner.
    var marked = false
    for row in 0..<Grid.rows {
      for column in 0..<Grid.columns {
        let c = grid.cell(column, row)
        if abs(c.0 - corner.0) + abs(c.1 - corner.1) + abs(c.2 - corner.2) > 30 { marked = true }
      }
    }
    return marked
  }
}
