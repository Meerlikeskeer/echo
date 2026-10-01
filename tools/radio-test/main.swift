import Foundation
import CoreBluetooth
import Darwin

let serviceID = CBUUID(string: "b2d10000-739e-4a72-8e21-ec4010210001")
let pingID = CBUUID(string: "b2d10001-739e-4a72-8e21-ec4010210001")
func validPayload(_ data: Data) -> Bool {
    data.count == 65536 && data.enumerated().allSatisfy { $0.element == UInt8(($0.offset % 1024) % 251) }
}
struct Sample: Codable { let round: Int; let bleMs: Double; let wifiMs: Double; let bytes: Int }
struct Report: Codable {
    let started: String; let host: String; let requestedRounds: Int
    var device: String?; var recordingObserved: Bool?; var samples: [Sample] = []
    var outcome = "FAIL"; var reason = "Incomplete"
    var passed: Bool { outcome == "PASS" && samples.count == requestedRounds }
}
func validHost(_ host: String) -> Bool {
    let parts = host.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 4, parts.allSatisfy({ Int($0).map { (0...255).contains($0) } ?? false }) else { return false }
    let n = parts.map { Int($0)! }
    return n[0] == 10 || (n[0] == 192 && n[1] == 168) || (n[0] == 172 && (16...31).contains(n[1]))
}
if CommandLine.arguments.contains("--self-test") {
    let good = Data((0..<65536).map { UInt8(($0 % 1024) % 251) })
    precondition(validPayload(good)); precondition(!validPayload(good.dropLast()))
    var corrupt = good; corrupt[300] ^= 1; precondition(!validPayload(corrupt))
    precondition(validHost("192.168.4.1") && !validHost("example.com") && !validHost("127.0.0.1"))
    var report = Report(started: "test", host: "192.168.4.1", requestedRounds: 2)
    report.outcome = "PASS"; precondition(!report.passed)
    report.samples = [Sample(round: 1, bleMs: 1, wifiMs: 1, bytes: 65536), Sample(round: 2, bleMs: 1, wifiMs: 1, bytes: 65536)]
    precondition(report.passed); report.outcome = "FAIL"; precondition(!report.passed)
    print("PASS: byte corruption/truncation, host validation and incomplete/interrupted report refusal")
    exit(0)
}
var host = "192.168.4.1", rounds = 20, reportPath = "echo-radio-test-\(Int(Date().timeIntervalSince1970)).json", wantedDevice: String?
var args = Array(CommandLine.arguments.dropFirst())
while !args.isEmpty {
    let key = args.removeFirst()
    if key == "--help" { print("Usage: run.command [--host PRIVATE_IPV4] [--rounds 1..100] [--device UUID] [--report PATH]\nDefault: 20 concurrent BLE/Wi-Fi rounds. Does not control recording."); exit(0) }
    guard !args.isEmpty else { print("Missing value for \(key)"); exit(2) }
    let value = args.removeFirst()
    switch key {
    case "--host": host = value
    case "--rounds": rounds = Int(value) ?? 0
    case "--report": reportPath = value
    case "--device": guard UUID(uuidString: value) != nil else { print("Invalid device UUID"); exit(2) }; wantedDevice = value.uppercased()
    default: print("Unknown option \(key)"); exit(2)
    }
}
guard validHost(host), (1...100).contains(rounds), !FileManager.default.fileExists(atPath: reportPath) else {
    print("Use a private IPv4 device address, 1–100 rounds, and a new report path."); exit(2)
}
final class RadioTest: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate, URLSessionTaskDelegate {
    var central: CBCentralManager!; var peripheral: CBPeripheral?; var characteristic: CBCharacteristic?
    var candidates: [UUID: CBPeripheral] = [:]; var scanned = false; var finished = false
    var timer: DispatchWorkItem?; var signalSource: DispatchSourceSignal?
    var report = Report(started: ISO8601DateFormatter().string(from: Date()), host: host, requestedRounds: rounds)
    var round = 0, phase = "", bleStart = ProcessInfo.processInfo.systemUptime, wifiStart = ProcessInfo.processInfo.systemUptime
    var bleMs: Double?, wifiMs: Double?, initialPings = 0
    lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 8; config.timeoutIntervalForResource = 8
        config.urlCache = nil; config.httpMaximumConnectionsPerHost = 1
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()
    func start() {
        signal(SIGINT, SIG_IGN)
        signalSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
        signalSource?.setEventHandler { self.finish("Interrupted by user") }; signalSource?.resume()
        deadline(30, "Bluetooth permission/startup timed out")
        central = CBCentralManager(delegate: self, queue: .main)
    }
    func deadline(_ seconds: Double, _ reason: String) {
        timer?.cancel(); let item = DispatchWorkItem { self.finish(reason) }; timer = item
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
    }
    func finish(_ reason: String, success: Bool = false) {
        guard !finished else { return }; finished = true; timer?.cancel()
        central?.stopScan(); if let p = peripheral { central?.cancelPeripheralConnection(p) }
        session.invalidateAndCancel(); signalSource?.cancel()
        report.outcome = success && report.samples.count == rounds ? "PASS" : "FAIL"; report.reason = reason
        do {
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(report).write(to: URL(fileURLWithPath: reportPath), options: [.withoutOverwriting])
            print("\(report.outcome): \(reason)\nCompleted \(report.samples.count)/\(rounds) rounds. Report: \(reportPath)")
        } catch { print("FAIL: Cannot save report: \(error.localizedDescription)"); exit(1) }
        exit(report.passed ? 0 : 1)
    }
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard !finished else { return }
        if central.state == .unknown || central.state == .resetting { return }
        guard central.state == .poweredOn else { finish("Bluetooth unavailable or permission denied; enable it in System Settings"); return }
        guard !scanned else { return }; scanned = true; timer?.cancel()
        print("Scanning for Echo (8 seconds)…")
        central.scanForPeripherals(withServices: [serviceID])
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
            guard !self.finished else { return }; central.stopScan()
            let matches = self.candidates.values.filter { wantedDevice == nil || $0.identifier.uuidString.uppercased() == wantedDevice }
            guard matches.count == 1 else {
                for p in self.candidates.values { print("Found \(p.name ?? "Echo"): \(p.identifier)") }
                self.finish(matches.isEmpty ? "No matching Echo: enable probe and disconnect phone BLE client" : "Multiple probes found; rerun with --device UUID"); return
            }
            self.peripheral = matches[0]; self.report.device = matches[0].identifier.uuidString
            self.deadline(15, "BLE connection/service discovery timed out"); central.connect(matches[0])
        }
    }
    func centralManager(_ central: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) { candidates[p.identifier] = p }
    func centralManager(_ central: CBCentralManager, didConnect p: CBPeripheral) { p.delegate = self; p.discoverServices([serviceID]) }
    func centralManager(_ central: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) { finish("BLE connection failed") }
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) { finish("BLE disconnected during test") }
    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let service = p.services?.first(where: { $0.uuid == serviceID }) else { finish("Echo service unavailable"); return }
        p.discoverCharacteristics([pingID], for: service)
    }
    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil, let c = service.characteristics?.first(where: { $0.uuid == pingID }), c.properties.contains(.read), c.properties.contains(.write) else { finish("Ping read/write characteristic unavailable"); return }
        characteristic = c; deadline(10, "HTTP preflight timed out")
        status { data in
            guard data["bleEnabled"] as? Bool == true, data["bleConnected"] as? Bool == true, let pings = data["pings"] as? Int, let recording = data["recording"] as? Bool else { self.finish("HTTP probe not enabled/connected or malformed status"); return }
            self.initialPings = pings; self.report.recordingObserved = recording; print("Recording observed at start: \(recording ? "active" : "idle")"); self.nextRound()
        }
    }
    func request(_ path: String, completion: @escaping (Data) -> Void) {
        var req = URLRequest(url: URL(string: "http://\(host)\(path)")!); req.cachePolicy = .reloadIgnoringLocalCacheData
        session.dataTask(with: req) { data, response, error in
            DispatchQueue.main.async {
                guard !self.finished else { return }
                guard error == nil, (response as? HTTPURLResponse)?.statusCode == 200, let data else { self.finish("Wi-Fi request failed: \(path)"); return }
                completion(data)
            }
        }.resume()
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func status(_ completion: @escaping ([String: Any]) -> Void) {
        request("/api/probe/status") { data in
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { self.finish("Invalid probe status JSON"); return }; completion(json)
        }
    }
    func nextRound() {
        guard !finished, let p = peripheral, let c = characteristic else { return }
        round += 1; bleMs = nil; wifiMs = nil; phase = "write"; bleStart = ProcessInfo.processInfo.systemUptime; wifiStart = ProcessInfo.processInfo.systemUptime
        deadline(10, "Round \(round) timed out (BLE or Wi-Fi incomplete)")
        p.writeValue(Data("ping".utf8), for: c, type: .withResponse)
        request("/api/probe/data") { data in
            guard validPayload(data) else { self.finish("Round \(self.round): corrupted/truncated Wi-Fi payload"); return }
            self.wifiMs = (ProcessInfo.processInfo.systemUptime - self.wifiStart) * 1000; self.completeRound()
        }
    }
    func peripheral(_ p: CBPeripheral, didWriteValueFor c: CBCharacteristic, error: Error?) {
        guard !finished, c.uuid == pingID, phase == "write" else { return }
        guard error == nil else { finish("BLE ping write failed"); return }; phase = "read"; p.readValue(for: c)
    }
    func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
        guard !finished, c.uuid == pingID, phase == "read" else { return }
        guard error == nil, c.value == Data("pong".utf8) else { finish("BLE reply was not pong"); return }
        phase = "done"; bleMs = (ProcessInfo.processInfo.systemUptime - bleStart) * 1000; completeRound()
    }
    func completeRound() {
        guard let ble = bleMs, let wifi = wifiMs else { return }
        report.samples.append(Sample(round: round, bleMs: ble, wifiMs: wifi, bytes: 65536))
        print("\(round)/\(rounds) PASS · BLE \(Int(ble)) ms · Wi-Fi \(Int(wifi)) ms · 65536 bytes verified")
        if round < rounds { DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.nextRound() }; return }
        deadline(10, "Final device identity/status check timed out")
        status { data in
            guard data["bleConnected"] as? Bool == true, let count = data["pings"] as? Int, count == self.initialPings + rounds else { self.finish("HTTP ping count does not match BLE test; wrong device, reset or competing client"); return }
            self.finish("All concurrent BLE/Wi-Fi rounds verified; recording audio not assessed", success: true)
        }
    }
}
let runner = RadioTest(); runner.start(); dispatchMain()
