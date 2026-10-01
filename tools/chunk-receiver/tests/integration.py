"""Synthetic HTTP fixture; exercises real Swift networking and durable spool."""
import hashlib,json,pathlib,struct,subprocess,tempfile,threading,unittest,time
from contextlib import contextmanager
@contextmanager
def evidence_directory(prefix):
 # Retain synthetic output for inspection; test correctness never depends on directory cleanup.
 folder=tempfile.mkdtemp(prefix=prefix,dir='/private/tmp');yield folder
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlparse
ROOT=pathlib.Path(__file__).resolve().parents[1]
AUDIO=b'RIFF'+struct.pack('<I',68)+b'WAVEfmt '+struct.pack('<IHHIIHH',16,1,1,16000,32000,2,16)+b'data'+struct.pack('<I',32)+bytes(32)
CHUNK=dict(sessionId='session-test',id='session-test-0',sequence=0,startMs=0,endMs=1,overlapMs=0,mimeType='audio/wav',size=len(AUDIO),checksum=hashlib.sha256(AUDIO).hexdigest())
MANIFEST=dict(version=1,sessionId='session-test',complete=True,chunks=[CHUNK])
class Receiver(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.directory=tempfile.mkdtemp(prefix='echo-transfer-tests-',dir='/private/tmp');cls.binary=pathlib.Path(cls.directory)/'receiver'
  subprocess.run(['swiftc','-D','TESTING',str(ROOT/'main.swift'),'-o',str(cls.binary),'-module-cache-path',str(pathlib.Path(cls.directory)/'cache')],check=True)
 def run_case(self,corrupt=False,retry=False,seed=False,conflict=False,partial=False):
  counts={'chunk':0,'manifest':0}
  class Handler(BaseHTTPRequestHandler):
   def do_GET(self):
    path=urlparse(self.path).path
    if path.endswith('manifest'):
     counts['manifest']+=1
     if retry and counts['manifest']==1:self.send_response(503);self.end_headers();return
     payload=dict(MANIFEST);payload["complete"]=not partial;body=json.dumps(payload).encode()
    else:
     counts['chunk']+=1;body=AUDIO if not corrupt else AUDIO[:-1]+b'!'
    self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
   def log_message(self,*args):pass
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   with evidence_directory(prefix='echo-receiver-inbox-') as folder:
    destination=pathlib.Path(folder)/'session-test'
    if seed:
     destination.mkdir();(destination/'chunk-0.wav').write_bytes(AUDIO)
     prior=json.loads(json.dumps(MANIFEST));prior['complete']=False
     if conflict:prior['chunks'][0]['checksum']='a'*64
     (destination/'receipt.json').write_text(json.dumps(prior))
    if partial:
     process=subprocess.Popen([str(self.binary),'--test-origin',f'http://127.0.0.1:{server.server_port}','--output',folder,'--seconds','30'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
     try:
      limit=time.monotonic()+8
      while not (destination/'receipt.json').exists() and process.poll() is None and time.monotonic()<limit:time.sleep(.1)
      self.assertTrue((destination/'receipt.json').exists());self.assertFalse(json.loads((destination/'receipt.json').read_text())['complete']);self.assertFalse((destination/'session-test.echo').exists())
     finally:process.terminate();process.communicate(timeout=5)
     self.assertNotEqual(process.returncode,0);return
    result=subprocess.run([str(self.binary),'--test-origin',f'http://127.0.0.1:{server.server_port}','--output',folder,'--seconds','30'],text=True,capture_output=True,timeout=25)
    if corrupt or conflict:
     self.assertEqual(result.returncode,1,result.stdout+result.stderr);self.assertFalse((destination/'session-test.echo').exists())
     if conflict:self.assertEqual((destination/'chunk-0.wav').read_bytes(),AUDIO)
    else:
     self.assertEqual(result.returncode,0,result.stdout+result.stderr)
     self.assertEqual((destination/'chunk-0.wav').read_bytes(),AUDIO)
     self.assertTrue(json.loads((destination/'receipt.json').read_text())['complete'])
     archive=(destination/'session-test.echo').read_bytes();self.assertEqual(archive[:8],b'ECHO0001');n=struct.unpack('<I',archive[8:12])[0]
     self.assertEqual(json.loads(archive[12:12+n]),MANIFEST);self.assertEqual(archive[12+n:],AUDIO)
     if seed:self.assertEqual(counts['chunk'],0)
     if retry:self.assertGreaterEqual(counts['manifest'],2)
  finally:server.shutdown();server.server_close();thread.join()
 def test_partial_prefix_never_implies_completion(self):self.run_case(partial=True)
 def test_verified_transfer_and_archive(self):self.run_case()
 def test_connection_retry(self):self.run_case(retry=True)
 def test_resume_skips_existing_verified_audio(self):self.run_case(seed=True)
 def test_corruption_refuses_receipt_and_archive(self):self.run_case(corrupt=True)
 def test_metadata_conflict_preserves_saved_audio(self):self.run_case(seed=True,conflict=True)
if __name__=='__main__':unittest.main()
