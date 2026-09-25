#pragma once
#include <mbedtls/sha256.h>
// Only the capture task touches SD while busy. HTTP/BOOT starts happen on loop().
#include "recording_format.h"
static volatile bool capturing=false,stopRequested=false;
static volatile uint32_t capturedSamples=0,savedChunks=0,micLevel=0;
static char captureError[120]={0};
static String activeSession;
static uint64_t cardUsed=0,cardTotal=0;
static void captureFail(const char *why) { snprintf(captureError,sizeof(captureError),"%s",why); }
static bool idleOnly() { if(capturing) { fail("Recording is active. Stop and save before using diagnostics or downloads.",409); return false; } return true; }
static void cacheCard() { cardUsed=sdReady?SD.usedBytes():0;cardTotal=sdReady?SD.totalBytes():0; }
static String chunkPath(const String &id,uint32_t n) { return "/echo/"+id+"/chunk-"+String(n)+".wav"; }
static String hashFile(File &f) {
  mbedtls_sha256_context h;mbedtls_sha256_init(&h);mbedtls_sha256_starts_ret(&h,0);
  uint8_t block[2048],digest[32];size_t remaining=f.size();f.seek(0);
  while(remaining) {size_t n=f.read(block,min(remaining,sizeof(block)));if(!n){mbedtls_sha256_free(&h);return "";}mbedtls_sha256_update_ret(&h,block,n);remaining-=n;}
  mbedtls_sha256_finish_ret(&h,digest);mbedtls_sha256_free(&h);
  char hex[65];for(int i=0;i<32;i++)snprintf(hex+i*2,3,"%02x",digest[i]);return String(hex);
}
static String finishHash(mbedtls_sha256_context &h) {uint8_t digest[32];char hex[65];mbedtls_sha256_finish_ret(&h,digest);for(int i=0;i<32;i++)snprintf(hex+i*2,3,"%02x",digest[i]);return String(hex);}
static void captureTask(void *) {
  uint8_t *overlap=(uint8_t*)ps_malloc(OVERLAP*2);
  i2s_config_t cfg={};cfg.mode=(i2s_mode_t)(I2S_MODE_MASTER|I2S_MODE_RX|I2S_MODE_PDM);cfg.sample_rate=RATE;cfg.bits_per_sample=I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format=I2S_CHANNEL_FMT_ONLY_LEFT;cfg.communication_format=I2S_COMM_FORMAT_STAND_I2S;cfg.intr_alloc_flags=ESP_INTR_FLAG_LEVEL1;cfg.dma_buf_count=16;cfg.dma_buf_len=1024;
  QueueHandle_t events=nullptr;bool installed=false;File wav;mbedtls_sha256_context hash;mbedtls_sha256_init(&hash);
  uint32_t chunkSamples=0,chunkStart=0,ringPos=0,sequence=0;uint64_t available=cardTotal-cardUsed;
  auto openChunk=[&]() {
    wav=SD.open(chunkPath(activeSession,sequence),FILE_WRITE);uint8_t header[44];wavHeader(header,CHUNK);
    if(!wav||wav.write(header,44)!=44)return false;
    mbedtls_sha256_starts_ret(&hash,0);mbedtls_sha256_update_ret(&hash,header,44);
    chunkSamples=0;
    if(sequence) { // Ring points to the oldest of the last two seconds.
      for(uint32_t pos=0;pos<OVERLAP;pos+=256) {
        uint8_t data[512];for(uint32_t i=0;i<256;i++){uint32_t at=((ringPos+pos+i)%OVERLAP)*2;data[i*2]=overlap[at];data[i*2+1]=overlap[at+1];}
        if(wav.write(data,sizeof(data))!=sizeof(data))return false;
        mbedtls_sha256_update_ret(&hash,data,sizeof(data));
      }chunkSamples=OVERLAP;
    }return true;
  };
  auto commitChunk=[&](bool full) {
    String checksum;
    if(!full){uint8_t header[44];wavHeader(header,chunkSamples);if(!wav.seek(0)||wav.write(header,44)!=44)return false;}
    wav.flush();wav.close();
    if(full)checksum=finishHash(hash);else{File read=SD.open(chunkPath(activeSession,sequence),FILE_READ);if(!read)return false;checksum=hashFile(read);read.close();}
    if(checksum.length()!=64)return false;
    ChunkRecord r={};r.sequence=sequence;r.startMs=chunkStart/16;r.endMs=(chunkStart+chunkSamples)/16;r.overlapMs=sequence?2000:0;r.size=44+chunkSamples*2;memcpy(r.checksum,checksum.c_str(),65);
    File journal=SD.open("/echo/"+activeSession+"/journal",FILE_APPEND);bool good=journal&&journal.write((uint8_t*)&r,sizeof(r))==sizeof(r);journal.flush();journal.close();
    if(good){savedChunks=++sequence;available-=r.size+sizeof(r);}return good;
  };
  if(!overlap)captureFail("PSRAM unavailable; recording was not started.");
  else if(!openChunk())captureFail("Cannot create audio file. Check the microSD card.");
  else if(i2s_driver_install(I2S_NUM_0,&cfg,32,&events)!=ESP_OK)captureFail("Microphone driver could not start.");
  else {
    installed=true;i2s_pin_config_t pins={};pins.mck_io_num=I2S_PIN_NO_CHANGE;pins.bck_io_num=I2S_PIN_NO_CHANGE;pins.ws_io_num=42;pins.data_out_num=I2S_PIN_NO_CHANGE;pins.data_in_num=41;
    if(i2s_set_pin(I2S_NUM_0,&pins)!=ESP_OK)captureFail("Microphone pins could not initialize.");
    int16_t block[256];
    while(!captureError[0]&&!stopRequested&&capturedSamples<LIMIT) {
      i2s_event_t event;while(xQueueReceive(events,&event,0)==pdTRUE)if(event.type==I2S_EVENT_RX_Q_OVF||event.type==I2S_EVENT_DMA_ERROR)captureFail("Microphone data was lost; saved audio is partial.");
      if(captureError[0])break;
      size_t bytes=0;size_t wanted=min((uint32_t)256,min(CHUNK-chunkSamples,LIMIT-capturedSamples))*2;
      if(i2s_read(I2S_NUM_0,block,wanted,&bytes,pdMS_TO_TICKS(500))!=ESP_OK||bytes!=wanted){captureFail("Microphone stalled; saved audio is partial.");break;}
      if(wav.write((uint8_t*)block,bytes)!=bytes){captureFail("microSD write failed; all existing files are retained.");break;}
      mbedtls_sha256_update_ret(&hash,(uint8_t*)block,bytes);
      uint32_t peak=0;for(size_t i=0;i<bytes/2;i++){int n=abs((int)block[i]);if((uint32_t)n>peak)peak=n;memcpy(overlap+ringPos*2,&block[i],2);ringPos=(ringPos+1)%OVERLAP;}
      micLevel=peak;chunkSamples+=bytes/2;capturedSamples+=bytes/2;
      if(chunkSamples==CHUNK) {
        if(!commitChunk(true)){captureFail("Could not commit audio metadata; session is partial.");break;}
        if(capturedSamples>=LIMIT||stopRequested){chunkSamples=0;break;}
        if(available<RESERVE+CHUNK*2){captureFail("Card space reserve reached; recording stopped. No audio was deleted.");chunkSamples=0;break;}
        chunkStart=capturedSamples-OVERLAP;
        if(!openChunk()){captureFail("Cannot create the next audio chunk; session is partial.");break;}
      }
    }
  }
  if(installed){
    i2s_event_t event;while(xQueueReceive(events,&event,0)==pdTRUE)if(event.type==I2S_EVENT_RX_Q_OVF||event.type==I2S_EVENT_DMA_ERROR)captureFail("Microphone data was lost; saved audio is partial.");
    i2s_driver_uninstall(I2S_NUM_0);
  }
  // A failed tail is deliberately left intact on the card, never advertised as committed.
  if(!captureError[0]&&wav&&chunkSamples>(sequence?OVERLAP:0)&&!commitChunk(false))captureFail("Could not finalize the last audio chunk; session is partial.");
  if(wav){wav.flush();wav.close();}
  mbedtls_sha256_free(&hash);free(overlap);micLevel=0;
  if(!captureError[0]&&savedChunks) {
    File journal=SD.open("/echo/"+activeSession+"/journal",FILE_READ);
    for(uint32_t i=0;i<savedChunks&&!captureError[0];i++) {
      ChunkRecord record={};
      if(!journal||journal.read((uint8_t*)&record,sizeof(record))!=sizeof(record)){captureFail("Saved metadata could not be verified.");break;}
      File audio=SD.open(chunkPath(activeSession,i),FILE_READ);
      if(!audio||audio.size()!=record.size||hashFile(audio)!=record.checksum)captureFail("Saved audio readback failed; session is partial.");
      audio.close();
    }journal.close();
  }
  if(!captureError[0]&&savedChunks) {
    File done=SD.open("/echo/"+activeSession+"/complete",FILE_WRITE);uint32_t count=savedChunks;
    bool good=done&&done.write((uint8_t*)&count,4)==4;done.flush();done.close();
    File read=SD.open("/echo/"+activeSession+"/complete");uint32_t check=0;good=good&&read&&read.read((uint8_t*)&check,4)==4&&check==count;read.close();
    if(!good)captureFail("Completion marker could not be verified; inspect the card.");
  }
  cacheCard();capturing=false;vTaskDelete(nullptr);
}
static bool validId(const String &id) {if(!id.length()||id.length()>64)return false;for(size_t i=0;i<id.length();i++)if(!isalnum((unsigned char)id[i])&&id[i]!='-')return false;return true;}
static bool loadRecords(const String &id,ChunkRecord *records,size_t &count,bool &complete,bool verify=false) {
  count=0;complete=false;if(!validId(id))return false;
  File journal=SD.open("/echo/"+id+"/journal",FILE_READ);if(!journal)return false;
  while(count<130&&journal.available()) {
    ChunkRecord r={};if(journal.read((uint8_t*)&r,sizeof(r))!=sizeof(r))break;
    if(!validRecord(r,count,count?records[count-1].endMs:0))break;
    File wav=SD.open(chunkPath(id,count),FILE_READ);bool good=wav&&wav.size()==r.size&&(!verify||hashFile(wav)==r.checksum);wav.close();if(!good)break;
    records[count++]=r;
  }
  bool entire=journal.position()==journal.size()&&journal.size()==count*sizeof(ChunkRecord);journal.close();
  File marker=SD.open("/echo/"+id+"/complete",FILE_READ);uint32_t n=0;complete=entire&&count&&marker&&marker.size()==4&&marker.read((uint8_t*)&n,4)==4&&n==count;marker.close();return true;
}
static void startCapture(bool reply=true) {
  auto reject=[&](const char *why){if(reply)fail(why);else captureFail(why);};
  if(!idleOnly())return;
  if(!sdReady){reject("Insert a FAT32 microSD card and mount it in Diagnostics.");return;}
  cacheCard();if(cardTotal<=cardUsed||cardTotal-cardUsed<RESERVE+CHUNK*2){reject("Not enough free microSD space. Existing recordings are kept.");return;}
  cameraStop();if(bleOn){BLEDevice::getAdvertising()->stop();bleOn=false;}WiFi.scanDelete();scanning=false;
  SD.mkdir("/echo");char id[48];snprintf(id,sizeof(id),"session-%08lx-%08lx",(unsigned long)esp_random(),(unsigned long)esp_random());activeSession=id;
  if(SD.exists("/echo/"+activeSession)||!SD.mkdir("/echo/"+activeSession)){reject("Cannot create a unique session directory.");return;}
  capturedSamples=0;savedChunks=0;micLevel=0;captureError[0]=0;stopRequested=false;capturing=true;
  if(xTaskCreatePinnedToCore(captureTask,"echo-capture",8192,nullptr,3,nullptr,1)!=pdPASS){capturing=false;reject("Cannot start recording task.");return;}if(reply)ok("Recording to microSD");
}
static void recorderRoutes() {
  server.on("/api/recording",HTTP_GET,[]{
    json("{\"recording\":"+String(capturing?"true":"false")+",\"stopping\":"+String(capturing&&stopRequested?"true":"false")+",\"sessionId\":"+quote(activeSession)+",\"durationMs\":"+String(capturedSamples/16)+",\"chunks\":"+String(savedChunks)+",\"level\":"+String(micLevel)+",\"error\":"+quote(captureError)+",\"sd\":"+String(sdReady?"true":"false")+",\"freeBytes\":"+String((unsigned long long)(cardTotal-cardUsed))+"}");
  });
  server.on("/api/recording/start",HTTP_POST,[]{if(action())startCapture();});
  server.on("/api/recording/stop",HTTP_POST,[]{if(server.header("X-Echo-Action")!="1"){fail("Action header required",403);return;}stopRequested=true;ok("Finishing and verifying your recording");});
  server.on("/api/sessions",HTTP_GET,[]{
    if(!idleOnly())return;if(!sdReady){json("{\"sessions\":[]}");return;}
    ChunkRecord *records=(ChunkRecord*)malloc(sizeof(ChunkRecord)*130);if(!records){fail("Not enough memory to read library");return;}
    File root=SD.open("/echo");File dir=root.openNextFile();String out="{\"sessions\":[";int shown=0;bool truncated=false;
    while(dir){String id=dir.name();id=id.substring(id.lastIndexOf('/')+1);bool isdir=dir.isDirectory();dir.close();if(isdir&&validId(id)){if(shown==80){truncated=true;break;}size_t count;bool complete;loadRecords(id,records,count,complete);if(shown++)out+=',';out+="{\"id\":"+quote(id)+",\"complete\":"+(complete?"true":"false")+",\"chunks\":"+String(count)+",\"durationMs\":"+String(count?records[count-1].endMs:0)+"}";}dir=root.openNextFile();}
    dir.close();root.close();free(records);json(out+"],\"truncated\":"+(truncated?"true":"false")+"}");
  });
  server.on("/api/session/export",HTTP_GET,[]{
    if(!idleOnly())return;String id=server.arg("id");ChunkRecord *r=(ChunkRecord*)malloc(sizeof(ChunkRecord)*130);if(!r){fail("Not enough memory for export");return;}
    size_t count;bool complete;if(!loadRecords(id,r,count,complete,true)||!count){free(r);fail("No verified complete chunks available. Keep the SD card: unfinished audio may be recoverable with a card reader.",409);return;}
    String manifest="{\"version\":1,\"sessionId\":"+quote(id)+",\"complete\":"+(complete?"true":"false")+",\"chunks\":[";size_t total=0;
    for(size_t i=0;i<count;i++){if(i)manifest+=',';manifest+="{\"sessionId\":"+quote(id)+",\"id\":"+quote(id+"-"+String(i))+",\"sequence\":"+String(i)+",\"startMs\":"+String(r[i].startMs)+",\"endMs\":"+String(r[i].endMs)+",\"overlapMs\":"+String(r[i].overlapMs)+",\"mimeType\":\"audio/wav\",\"size\":"+String(r[i].size)+",\"checksum\":"+quote(r[i].checksum)+"}";total+=r[i].size;}manifest+="]}";free(r);
    uint8_t header[12];memcpy(header,"ECHO0001",8);for(int i=0;i<4;i++)header[8+i]=manifest.length()>>(8*i);
    server.sendHeader("Content-Disposition","attachment; filename=\""+id+".echo\"");server.sendHeader("Cache-Control","no-store");server.setContentLength(12+manifest.length()+total);server.send(200,"application/octet-stream","");
    auto client=server.client();client.setTimeout(5000);
    auto sendBytes=[&](const uint8_t *data,size_t len){uint32_t stalled=millis();while(len&&client.connected()){size_t n=client.write(data,len);if(n){data+=n;len-=n;stalled=millis();}else{if(millis()-stalled>5000)break;delay(1);}}return len==0;};
    bool sent=sendBytes(header,12)&&sendBytes((const uint8_t*)manifest.c_str(),manifest.length());uint8_t block[2048];
    for(size_t i=0;i<count&&sent;i++){File f=SD.open(chunkPath(id,i),FILE_READ);while(f&&f.available()&&sent){size_t n=f.read(block,sizeof(block));if(!n){sent=false;break;}sent=sendBytes(block,n);}f.close();}if(!sent)client.stop();
  });
}
static void pollRecordButton() {
  static bool armed=false,last=false,stable=false;static uint32_t changed=0;bool value=digitalRead(0);
  if(value!=last){last=value;changed=millis();}
  if(millis()-changed<60||stable==value)return;stable=value;
  if(value){armed=true;return;}if(!armed)return;armed=false;
  if(capturing)stopRequested=true;else startCapture(false);
}
