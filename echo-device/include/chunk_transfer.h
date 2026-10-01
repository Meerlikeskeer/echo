#pragma once
#include <memory>
static bool transferSnapshot(const String &id,ChunkRecord *records,size_t &count,bool &complete) {
  count=0;complete=false;
  if(!validId(id)){fail("Invalid session identity",400);return false;}
  if(id==activeSession) {
    portENTER_CRITICAL(&transferMux);count=transferCount;complete=transferComplete;
    memcpy(records,transferRecords,count*sizeof(ChunkRecord));portEXIT_CRITICAL(&transferMux);
    return true;
  }
  if(capturing){fail("Select the active session while recording",409);return false;}
  CardGuard card(pdMS_TO_TICKS(100));
  if(!card.locked()){fail("Card busy; retry",503);return false;}
  if(!loadRecords(id,records,count,complete)){fail("Session journal unavailable",404);return false;}
  return true;
}
static bool transferNumber(const String &s,uint32_t &value) {
  if(s.isEmpty()||s.length()>10)return false;
  uint64_t n=0;for(size_t i=0;i<s.length();++i){if(s[i]<'0'||s[i]>'9')return false;n=n*10+s[i]-'0';if(n>UINT32_MAX)return false;}
  value=n;return true;
}
static void transferRoutes() {
  server.on("/api/transfer/manifest",HTTP_GET,[]{
    if(!sdReady){fail("Card unavailable");return;}
    String id=server.hasArg("id")?server.arg("id"):activeSession;
    if(id.isEmpty()){fail("Start a recording or specify a saved session",409);return;}
    std::unique_ptr<ChunkRecord[]> records(new(std::nothrow) ChunkRecord[130]);
    if(!records){fail("Not enough memory for manifest");return;}
    size_t count=0;bool complete=false;if(!transferSnapshot(id,records.get(),count,complete))return;
    String out="{\"version\":1,\"sessionId\":"+quote(id)+",\"complete\":"+(complete?"true":"false")+",\"chunks\":[";
    for(size_t i=0;i<count;++i){const auto &r=records[i];if(i)out+=',';
      out+="{\"sessionId\":"+quote(id)+",\"id\":"+quote(id+"-"+String(i))+",\"sequence\":"+String(i)+",\"startMs\":"+String(r.startMs)+",\"endMs\":"+String(r.endMs)+",\"overlapMs\":"+String(r.overlapMs)+",\"mimeType\":\"audio/wav\",\"size\":"+String(r.size)+",\"checksum\":"+quote(r.checksum)+"}";
    }json(out+"]}");
  });
  server.on("/api/transfer/chunk",HTTP_GET,[]{
    uint32_t sequence,offset,length;
    if(!transferNumber(server.arg("sequence"),sequence)||!transferNumber(server.arg("offset"),offset)||!transferNumber(server.arg("length"),length)||!length||length>16384){fail("Invalid slice; maximum 16384 bytes",400);return;}
    std::unique_ptr<ChunkRecord[]> records(new(std::nothrow) ChunkRecord[130]);
    if(!records){fail("Not enough memory for slice metadata");return;}
    String id=server.arg("id");size_t count;bool complete;
    if(!transferSnapshot(id,records.get(),count,complete))return;
    if(sequence>=count){fail("Chunk is not committed",409);return;}
    const auto r=records[sequence];if(!validTransferSlice(r.size,offset,length)){fail("Slice exceeds committed chunk",416);return;}
    std::unique_ptr<uint8_t[]> data(new(std::nothrow) uint8_t[length]);if(!data){fail("Not enough memory for slice");return;}
    File audio;
    {CardGuard card(pdMS_TO_TICKS(100));if(!card.locked()){fail("Card busy; retry",503);return;}
      audio=SD.open(chunkPath(id,sequence),FILE_READ);
      if(!audio||audio.size()!=r.size||!audio.seek(offset)){audio.close();fail("Committed audio unavailable",409);return;}}
    bool good=true;
    for(uint32_t pos=0;pos<length;pos+=4096){
      {CardGuard card(pdMS_TO_TICKS(100));
        if(!card.locked()||audio.read(data.get()+pos,min((uint32_t)4096,length-pos))!=min((uint32_t)4096,length-pos)){good=false;break;}}
      delay(1); // Let capture run between SD read slices.
    }
    {CardGuard card;audio.close();}
    if(!good){fail("Card read unavailable; retry",503);return;}
    // Card lock is released before network I/O; stalled clients cannot hold SD.
    server.sendHeader("Cache-Control","no-store");server.sendHeader("X-Content-Type-Options","nosniff");
    server.send_P(200,"application/octet-stream",(const char*)data.get(),length);
  });
}
