import Foundation
import CryptoKit
import Darwin
struct Chunk: Codable, Equatable {
 let sessionId:String,id:String,sequence:Int,startMs:Int,endMs:Int,overlapMs:Int,mimeType:String,size:Int,checksum:String
}
struct Manifest: Codable {
 let version:Int,sessionId:String,complete:Bool,chunks:[Chunk]
}
enum Failure: Error {case invalid(String)}
func validate(_ m:Manifest)throws {
 guard m.version==1,m.sessionId.range(of:"^[A-Za-z0-9-]{1,64}$",options:.regularExpression) != nil,m.chunks.count<=130,(!m.complete || !m.chunks.isEmpty) else {throw Failure.invalid("Invalid manifest")}
 var end=0
 for (i,c) in m.chunks.enumerated() {
  guard c.sequence==i,c.sessionId==m.sessionId,c.id=="\(m.sessionId)-\(i)",c.startMs==(i==0 ? 0 : end-2000),c.endMs>max(end,c.startMs),c.endMs<=7200000,c.endMs-c.startMs<=60000,c.overlapMs==(i==0 ? 0 : 2000),c.mimeType=="audio/wav",c.size==44+(c.endMs-c.startMs)*32,c.checksum.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil else {throw Failure.invalid("Invalid chunk metadata")};end=c.endMs
 }
}
func hash(_ data:Data)->String {SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined()}
func verified(_ data:Data,_ c:Chunk)->Bool {
 guard data.count==c.size,hash(data)==c.checksum,data.count>=44 else{return false}
 let b=[UInt8](data);func n(_ p:Int,_ width:Int)->Int {(0..<width).reduce(0){$0 | (Int(b[p+$1]) << (8*$1))}}
 return String(bytes:b[0..<4],encoding:.ascii)=="RIFF" && String(bytes:b[8..<16],encoding:.ascii)=="WAVEfmt " && String(bytes:b[36..<40],encoding:.ascii)=="data" && n(4,4)==c.size-8 && n(16,4)==16 && n(20,2)==1 && n(22,2)==1 && n(24,4)==16000 && n(28,4)==32000 && n(32,2)==2 && n(34,2)==16 && n(40,4)==c.size-44
}
func ensureDirectory(_ url:URL)throws {
 var directory:ObjCBool=false
 if FileManager.default.fileExists(atPath:url.path,isDirectory:&directory) {
  guard directory.boolValue else{throw Failure.invalid("Inbox path is not a directory")};return
 }
 let parent=url.deletingLastPathComponent();try ensureDirectory(parent)
 guard mkdir(url.path,0o700)==0 else{throw Failure.invalid("Cannot create inbox directory")}
 let fd=open(parent.path,O_RDONLY);defer{if fd>=0{close(fd)}}
 guard fd>=0,fsync(fd)==0 else{throw Failure.invalid("Cannot flush inbox directory creation")}
}
func durable(_ data:Data,_ path:URL)throws {
 let staging=path.deletingLastPathComponent().appendingPathComponent(".\(UUID().uuidString).part")
 let fd=open(staging.path,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW,0o600);guard fd>=0 else {throw Failure.invalid("Cannot create staging file")}
 var committed=false
 defer{close(fd);if !committed{unlink(staging.path)}}
 try data.withUnsafeBytes{raw in
  var pos=0;while pos<raw.count {let n=write(fd,raw.baseAddress!.advanced(by:pos),raw.count-pos);guard n>0 else{throw Failure.invalid("Local write failed")};pos+=n}
 }
 guard fsync(fd)==0,fcntl(fd,F_FULLFSYNC)==0 else{throw Failure.invalid("Local durability flush failed")}
 guard rename(staging.path,path.path)==0 else{throw Failure.invalid("Cannot publish local file")};committed=true
 let dir=open(path.deletingLastPathComponent().path,O_RDONLY);defer{if dir>=0{close(dir)}}
 guard dir>=0,fsync(dir)==0 else{throw Failure.invalid("Cannot flush local directory")}
}
func encode(_ m:Manifest)throws->Data {let e=JSONEncoder();e.outputFormatting=[.sortedKeys];return try e.encode(m)}
if CommandLine.arguments.contains("--self-test") {
 var b=[UInt8](repeating:0,count:76)
 func put(_ p:Int,_ n:Int,_ width:Int=4){for i in 0..<width{b[p+i]=UInt8((n>>(8*i))&255)}}
 for (p,s) in [(0,"RIFF"),(8,"WAVEfmt "),(36,"data")]{for (i,v) in s.utf8.enumerated(){b[p+i]=v}}
 put(4,68);put(16,16);put(20,1,2);put(22,1,2);put(24,16000);put(28,32000);put(32,2,2);put(34,16,2);put(40,32)
 let data=Data(b),c=Chunk(sessionId:"session-test",id:"session-test-0",sequence:0,startMs:0,endMs:1,overlapMs:0,mimeType:"audio/wav",size:76,checksum:hash(Data(b)))
 let m=Manifest(version:1,sessionId:"session-test",complete:true,chunks:[c]);try validate(m);precondition(verified(data,c));b[50]^=1;precondition(!verified(Data(b),c));precondition(!verified(data.dropLast(),c))
 do{try validate(Manifest(version:1,sessionId:"../bad",complete:true,chunks:[]));fatalError("Accepted invalid manifest")}catch{}
 print("PASS: canonical WAV/checksum, corruption/truncation and invalid manifest refusal");exit(0)
}
var host="192.168.4.1",selected:String?,output=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Desktop/Echo-received"),maxSeconds=1800.0
#if TESTING
var testOrigin:String?
#endif
var args=Array(CommandLine.arguments.dropFirst())
while !args.isEmpty {
 let key=args.removeFirst();if key=="--help"{print("Usage: run.command [--host PRIVATE_IPV4] [--session ID] [--output DIRECTORY] [--seconds 30..7200]\nKeeps originals; polls until explicit completion. Restart to resume.");exit(0)}
 guard !args.isEmpty else{print("Missing option value");exit(2)};let value=args.removeFirst()
 switch key{
#if TESTING
case "--test-origin":testOrigin=value
#endif
case "--host":host=value;case "--session":selected=value;case "--output":output=URL(fileURLWithPath:value);case "--seconds":maxSeconds=Double(value) ?? 0;default:print("Unknown option");exit(2)}
}
let hostParts=host.split(separator:".",omittingEmptySubsequences:false)
let octets=hostParts.compactMap{Int($0)}
guard hostParts.count==4,host.range(of:"^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$",options:.regularExpression) != nil,octets.count==4,octets.allSatisfy({(0...255).contains($0)}),(octets[0]==10 || (octets[0]==192 && octets[1]==168) || (octets[0]==172 && (16...31).contains(octets[1]))),(30...7200).contains(maxSeconds),selected==nil || selected!.range(of:"^[A-Za-z0-9-]{1,64}$",options:.regularExpression) != nil else{print("Invalid private address, session or duration");exit(2)}
umask(0o077)
final class NoRedirect:NSObject,URLSessionTaskDelegate {
 func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void){completionHandler(nil)}
}
let config=URLSessionConfiguration.ephemeral;config.timeoutIntervalForRequest=8;config.timeoutIntervalForResource=8
let session=URLSession(configuration:config,delegate:NoRedirect(),delegateQueue:OperationQueue())
func get(_ path:String)throws->Data {
 guard ProcessInfo.processInfo.systemUptime-started<maxSeconds else{throw Failure.invalid("Receiver time limit; saved files retained") }
 let semaphore=DispatchSemaphore(value:0),lock=NSLock();var result:Result<Data,Error>?
 var origin="http://\(host)"
 #if TESTING
 if let testOrigin {origin=testOrigin}
 #endif
 var request=URLRequest(url:URL(string:"\(origin)\(path)")!);request.cachePolicy = .reloadIgnoringLocalCacheData
 let task=session.dataTask(with:request){data,response,error in
  lock.lock();defer{lock.unlock();semaphore.signal()}
  if let error{result = .failure(error)}else if (response as? HTTPURLResponse)?.statusCode==200,let data{result = .success(data)}else{result = .failure(URLError(.badServerResponse))}
 };task.resume();guard semaphore.wait(timeout:.now()+10) == .success else{task.cancel();throw URLError(.timedOut)}
 lock.lock();defer{lock.unlock()};return try result!.get()
}
try ensureDirectory(output)
let lockFD=open(output.appendingPathComponent(".receiver-lock").path,O_CREAT|O_RDWR|O_NOFOLLOW,0o600)
guard lockFD>=0,flock(lockFD,LOCK_EX|LOCK_NB)==0 else{print("Another receiver is using this inbox");exit(1)}
let started=ProcessInfo.processInfo.systemUptime;var errors=0,previous:Manifest?
print("Receiving completed chunks into \(output.path). Start/stop recording on the device page. Ctrl+C stops; restart resumes.")
while ProcessInfo.processInfo.systemUptime-started<maxSeconds {
 do {
  let path="/api/transfer/manifest"+(selected.map{"?id=\($0)"} ?? "")
  let bytes=try get(path);guard bytes.count<=65536 else{throw Failure.invalid("Manifest too large")}
  let m=try JSONDecoder().decode(Manifest.self,from:bytes);try validate(m)
  if let selected,selected != m.sessionId{throw Failure.invalid("Session identity changed")};selected=m.sessionId
  print("SESSION: \(m.sessionId)");fflush(stdout)
  let folder=output.appendingPathComponent(m.sessionId);try ensureDirectory(folder)
  let manifestFile=folder.appendingPathComponent("receipt.json")
  if previous==nil,FileManager.default.fileExists(atPath:manifestFile.path){previous=try JSONDecoder().decode(Manifest.self,from:Data(contentsOf:manifestFile));try validate(previous!)}
  if let prior=previous {
   guard prior.sessionId==m.sessionId,m.chunks.count>=prior.chunks.count,Array(m.chunks.prefix(prior.chunks.count))==prior.chunks,!prior.complete || m.complete else{throw Failure.invalid("Immutable metadata/completion conflict")}
  }
  var received:[Chunk]=[]
  for c in m.chunks {
   let file=folder.appendingPathComponent("chunk-\(c.sequence).wav")
   if FileManager.default.fileExists(atPath:file.path){guard verified(try Data(contentsOf:file),c) else{throw Failure.invalid("Existing audio conflicts; retained without overwrite")}}
   else {
    var audio=Data();audio.reserveCapacity(c.size)
    while audio.count<c.size {
     let length=min(16384,c.size-audio.count)
     let data=try get("/api/transfer/chunk?id=\(m.sessionId)&sequence=\(c.sequence)&offset=\(audio.count)&length=\(length)")
     guard data.count==length else{throw Failure.invalid("Truncated chunk slice")};audio.append(data)
    }
    guard verified(audio,c) else{throw Failure.invalid("Audio checksum/PCM mismatch")}
    try durable(audio,file);guard verified(try Data(contentsOf:file),c) else{throw Failure.invalid("Saved audio readback failed")}
    print("Saved and verified chunk \(c.sequence) · \(c.size) bytes")
   }
   received.append(c)
   let prefix=Manifest(version:1,sessionId:m.sessionId,complete:false,chunks:received)
   if previous?.complete != true && received.count >= (previous?.chunks.count ?? 0) {try durable(try encode(prefix),manifestFile);previous=prefix}
  }
  let local=Manifest(version:1,sessionId:m.sessionId,complete:m.complete,chunks:received)
  try durable(try encode(local),manifestFile);previous=local;errors=0
  if m.complete {
   let manifest=try encode(local);var archive=Data("ECHO0001".utf8);var size=UInt32(manifest.count).littleEndian
   withUnsafeBytes(of:&size){archive.append(contentsOf:$0)};archive.append(manifest)
   for c in received{let audio=try Data(contentsOf:folder.appendingPathComponent("chunk-\(c.sequence).wav"));guard verified(audio,c) else{throw Failure.invalid("Archive source changed")};archive.append(audio)}
   let destination=folder.appendingPathComponent("\(m.sessionId).echo");try durable(archive,destination)
   guard hash(try Data(contentsOf:destination))==hash(archive) else{throw Failure.invalid("Archive readback failed")}
   print("COMPLETE: \(received.count) chunks verified. Import \(destination.path) into Echo web. SD originals retained.");exit(0)
  }
  print("\(received.count) committed chunks received; waiting for next chunk or explicit clean stop…");Thread.sleep(forTimeInterval:2)
 }catch let Failure.invalid(message){print("STOP: \(message). Saved files retained.");exit(1)}
 catch{errors+=1;print("Connection/read failure (\(errors)/8); saved chunks retained. Retrying…");if errors>=8{print("Paused after repeated failures. Reconnect and rerun to resume.");exit(1)};Thread.sleep(forTimeInterval:min(10,Double(errors)*2))}
}
print("Time limit reached; session is not assumed complete. Rerun to resume.");exit(1)
