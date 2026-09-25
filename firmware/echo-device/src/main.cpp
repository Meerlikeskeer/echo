#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <SD.h>
#include <SPI.h>
#include <BLEDevice.h>
#include <driver/i2s.h>
#include <esp_camera.h>
#include <esp_system.h>
#include <esp_timer.h>
#include "console_page.h"

// XIAO ESP32S3 Sense only. GPIO21 is SD CS and must not be toggled as an LED.
WebServer server(80);
String logs[80];
size_t logNext = 0, logCount = 0;
String ssid, password;
bool cameraReady = false, sdReady = false, bleReady = false, bleOn = false;
bool scanning = false;
uint32_t restartAt = 0;

String quote(const String &s) {
  String r = "\"";
  for (size_t i = 0; i < s.length(); ++i) {
    unsigned char c = s[i];
    if (c == '"' || c == '\\') { r += '\\'; r += char(c); }
    else if (c < 32) { char b[7]; snprintf(b, sizeof(b), "\\u%04x", c); r += b; }
    else r += char(c);
  }
  return r + '"';
}
void logEvent(const String &message) {
  String line = String((unsigned long)(esp_timer_get_time() / 1000)) + " ms  " + message;
  logs[logNext] = line; logNext = (logNext + 1) % 80;
  if (logCount < 80) ++logCount;
  Serial.println(line);
}
void json(const String &s, int status = 200) {
  server.sendHeader("Cache-Control", "no-store");
  server.sendHeader("X-Content-Type-Options", "nosniff");
  server.send(status, "application/json", s);
}
void fail(const String &s, int code = 503) { json("{\"error\":" + quote(s) + "}", code); }
void ok(const String &s) { json("{\"message\":" + quote(s) + "}"); }
bool action() {
  // A foreign web page cannot send this header without a CORS preflight.
  // No CORS access is granted; every associated Wi-Fi client is trusted.
  if (server.header("X-Echo-Action") != "1") { fail("Action header required", 403); return false; }
  return true;
}
const char *resetReason() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "Power on";
    case ESP_RST_SW: return "Software restart";
    case ESP_RST_PANIC: return "Crash / panic";
    case ESP_RST_INT_WDT: return "Interrupt watchdog";
    case ESP_RST_TASK_WDT: return "Task watchdog";
    case ESP_RST_WDT: return "Watchdog";
    case ESP_RST_BROWNOUT: return "Brownout / low supply";
    case ESP_RST_DEEPSLEEP: return "Deep sleep wake";
    case ESP_RST_EXT: return "External reset";
    default: return "Other / unknown";
  }
}
void cameraStop() {
  if (cameraReady) { esp_camera_deinit(); cameraReady = false; logEvent("Camera stopped"); }
}
bool cameraStart() {
  if (cameraReady) return true;
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0; c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = 15; c.pin_d1 = 17; c.pin_d2 = 18; c.pin_d3 = 16;
  c.pin_d4 = 14; c.pin_d5 = 12; c.pin_d6 = 11; c.pin_d7 = 48;
  c.pin_xclk = 10; c.pin_pclk = 13; c.pin_vsync = 38; c.pin_href = 47;
  c.pin_sccb_sda = 40; c.pin_sccb_scl = 39; c.pin_pwdn = -1; c.pin_reset = -1;
  c.xclk_freq_hz = 20000000; c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_QVGA; c.jpeg_quality = 14; c.fb_count = 1;
  c.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  c.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  esp_err_t e = esp_camera_init(&c);
  cameraReady = e == ESP_OK;
  logEvent(cameraReady ? "Camera initialized at 320x240" : String("Camera failed: ") + esp_err_to_name(e));
  return cameraReady;
}
void mountCard() {
  SD.end();
  sdReady = SD.begin(21, SPI, 4000000) && SD.cardType() != CARD_NONE;
  logEvent(sdReady ? "microSD mounted" : "microSD unavailable: check card, FAT32 and expansion board");
}
bool validPath(const String &p) {
  if (!p.startsWith("/") || p.length() > 180 || p.indexOf("..") >= 0 || p.indexOf('\\') >= 0) return false;
  for (size_t i = 0; i < p.length(); ++i) if ((uint8_t)p[i] < 32) return false;
  return true;
}
void listFiles() {
  if (!sdReady) { fail("microSD is not mounted"); return; }
  String path = server.hasArg("path") ? server.arg("path") : "/";
  if (!validPath(path)) { fail("Invalid path", 400); return; }
  File dir = SD.open(path);
  if (!dir || !dir.isDirectory()) { fail("Directory not found", 404); return; }
  String out = "{\"files\":["; int count = 0;
  File f = dir.openNextFile();
  while (f && count < 80) {
    if (count++) out += ',';
    String name = f.name(); name = name.substring(name.lastIndexOf('/') + 1);
    String full = path + (path.endsWith("/") ? "" : "/") + name;
    out += "{\"name\":" + quote(name) + ",\"path\":" + quote(full) + ",\"directory\":" + (f.isDirectory() ? "true" : "false") + ",\"size\":" + String((unsigned long)f.size()) + "}";
    f.close(); f = dir.openNextFile();
  }
  bool truncated = bool(f); f.close(); dir.close();
  json(out + "],\"truncated\":" + (truncated ? "true" : "false") + "}");
}
void testCard() {
  if (!action()) return;
  if (!sdReady) { fail("microSD is not mounted"); return; }
  // Never overwrite a user's file. Each test creates a unique small artifact.
  char path[48]; snprintf(path, sizeof(path), "/echo-test-%08lx.txt", (unsigned long)esp_random());
  if (SD.exists(path)) { fail("Test filename collision; retry"); return; }
  const String payload = "Echo microSD verification\n";
  File w = SD.open(path, FILE_WRITE);
  bool wrote = w && w.print(payload) == payload.length();
  if (w) { w.flush(); w.close(); }
  File r = SD.open(path, FILE_READ);
  bool matched = r && r.readString() == payload;
  r.close();
  if (!wrote || !matched) { logEvent("microSD write/read test FAILED"); fail("Write/read mismatch; inspect card. Test file retained."); return; }
  logEvent(String("microSD write/read verified: ") + path);
  ok(String("Write/read passed. Kept ") + path + " for inspection.");
}
void recordMicrophone() {
  if (!action()) return;
  cameraStop();
  const size_t dataBytes = 16000 * 2 * 2;
  uint8_t *wav = (uint8_t *)ps_malloc(dataBytes + 44);
  if (!wav) { fail("Not enough PSRAM for the microphone test"); return; }
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_PDM);
  cfg.sample_rate = 16000; cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT; cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1; cfg.dma_buf_count = 4; cfg.dma_buf_len = 256;
  esp_err_t e = i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr);
  if (e != ESP_OK) { free(wav); logEvent(String("Microphone init failed: ") + esp_err_to_name(e)); fail("Microphone initialization failed"); return; }
  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE; pins.bck_io_num = I2S_PIN_NO_CHANGE;
  pins.ws_io_num = 42; pins.data_out_num = I2S_PIN_NO_CHANGE; pins.data_in_num = 41;
  e = i2s_set_pin(I2S_NUM_0, &pins);
  size_t done = 0;
  uint32_t start = millis();
  logEvent("Microphone test started: 2 seconds, 16 kHz mono");
  while (e == ESP_OK && done < dataBytes && millis() - start < 4000) {
    size_t got = 0;
    e = i2s_read(I2S_NUM_0, wav + 44 + done, min((size_t)1024, dataBytes - done), &got, pdMS_TO_TICKS(150));
    done += got; delay(1);
  }
  i2s_driver_uninstall(I2S_NUM_0);
  if (e != ESP_OK || done != dataBytes) { free(wav); logEvent("Microphone incomplete / timeout"); fail("Microphone did not return a complete sample"); return; }
  memset(wav, 0, 44);
  auto put16 = [&](int p, uint16_t v) { wav[p] = v; wav[p+1] = v >> 8; };
  auto put32 = [&](int p, uint32_t v) { for (int i=0;i<4;i++) wav[p+i] = v >> (8*i); };
  memcpy(wav, "RIFF", 4); put32(4, dataBytes + 36); memcpy(wav+8, "WAVEfmt ", 8);
  put32(16,16); put16(20,1); put16(22,1); put32(24,16000); put32(28,32000);
  put16(32,2); put16(34,16); memcpy(wav+36,"data",4); put32(40,dataBytes);
  server.sendHeader("Cache-Control", "no-store");
  server.send_P(200, "audio/wav", (const char *)wav, dataBytes + 44);
  free(wav); logEvent("Microphone stopped; sample delivered, not saved to SD");
}
void routes() {
  const char *headers[] = {"X-Echo-Action"}; server.collectHeaders(headers, 1);
  server.on("/", HTTP_GET, [] {
    server.sendHeader("Cache-Control", "no-store");
    server.sendHeader("X-Frame-Options", "DENY");
    server.sendHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; frame-ancestors 'none'");
    server.send_P(200,"text/html",CONSOLE_PAGE);
  });
  server.on("/api/status", HTTP_GET, [] {
    String s = "{\"firmware\":\"0.1.0\",\"chip\":" + quote(ESP.getChipModel()) + ",\"uptime\":" + String((unsigned long long)(esp_timer_get_time()/1000));
    s += ",\"reset\":" + quote(resetReason()) + ",\"cpu\":" + String(ESP.getCpuFreqMHz()) + ",\"heap\":" + String(ESP.getFreeHeap());
    s += ",\"minHeap\":" + String(ESP.getMinFreeHeap()) + ",\"psram\":" + String(ESP.getFreePsram()) + ",\"flash\":" + String(ESP.getFlashChipSize());
    s += ",\"ssid\":" + quote(ssid) + ",\"ip\":" + quote(WiFi.softAPIP().toString()) + ",\"clients\":" + String(WiFi.softAPgetStationNum());
    s += ",\"ble\":" + String(bleOn ? "true" : "false") + ",\"sd\":" + (sdReady ? "true" : "false");
    s += ",\"sdUsed\":" + String((unsigned long long)(sdReady ? SD.usedBytes() : 0)) + ",\"sdTotal\":" + String((unsigned long long)(sdReady ? SD.totalBytes() : 0)) + ",\"ledPin\":21}";
    json(s);
  });
  server.on("/api/logs", HTTP_GET, [] {
    String all;
    for(size_t i=0; i<logCount; i++) all += logs[(logNext+80-logCount+i)%80] + '\n';
    json("{\"logs\":" + quote(all) + "}");
  });
  server.on("/api/camera/start", HTTP_POST, [] { if(action()) { if(cameraStart()) ok("Camera ready"); else fail("Camera initialization failed; check expansion board and USB logs"); } });
  server.on("/api/camera/stop", HTTP_POST, [] { if(action()) { cameraStop(); ok("Camera off"); } });
  server.on("/api/camera.jpg", HTTP_GET, [] {
    if(!cameraReady) { fail("Start the camera first",409); return; }
    camera_fb_t *fb = esp_camera_fb_get();
    if(!fb) { logEvent("Camera capture failed"); fail("Camera capture failed"); return; }
    server.sendHeader("Cache-Control", "no-store");
    server.send_P(200,"image/jpeg",(const char *)fb->buf,fb->len);
    esp_camera_fb_return(fb);
  });
  server.on("/api/mic.wav", HTTP_POST, recordMicrophone);
  server.on("/api/sd/mount", HTTP_POST, [] { if(action()) { mountCard(); if(sdReady) ok("Card mounted"); else fail("Card mount failed"); } });
  server.on("/api/sd/files", HTTP_GET, listFiles);
  server.on("/api/sd/test", HTTP_POST, testCard);
  server.on("/api/sd/file", HTTP_GET, [] {
    if(!sdReady) { fail("Card not mounted"); return; }
    String p = server.arg("path");
    if(!validPath(p)) { fail("Invalid path",400); return; }
    File f = SD.open(p,FILE_READ);
    if(!f || f.isDirectory()) { fail("File not found",404); return; }
    // Bound browser and device stalls in this single-client diagnostics server.
    if(f.size() > 8*1024*1024) { f.close(); fail("Files over 8 MB: use your Mac's card reader",413); return; }
    server.sendHeader("Content-Disposition","attachment");
    server.sendHeader("Cache-Control","no-store");
    server.sendHeader("X-Content-Type-Options","nosniff");
    server.streamFile(f,"application/octet-stream"); f.close();
  });
  server.on("/api/wifi/scan", HTTP_POST, [] {
    if(!action()) return;
    if(scanning && WiFi.scanComplete() == WIFI_SCAN_RUNNING) { ok("Already scanning"); return; }
    WiFi.scanDelete();
    int result = WiFi.scanNetworks(true,false);
    scanning = result == WIFI_SCAN_RUNNING || result >= 0;
    logEvent(scanning ? "Wi-Fi scan requested" : "Wi-Fi scan failed");
    if(scanning) ok("Scan started"); else fail("Scan could not start");
  });
  server.on("/api/wifi/scan", HTTP_GET, [] {
    int n = WiFi.scanComplete();
    if(n == WIFI_SCAN_RUNNING) { json("{\"running\":true,\"networks\":[]}"); return; }
    if(n < 0) { fail("No scan results; start a new scan",409); return; }
    scanning = false;
    String s = "{\"running\":false,\"networks\":[";
    for(int i=0;i<min(n,30);i++) {
      if(i) s+=',';
      s += "{\"ssid\":"+quote(WiFi.SSID(i))+",\"rssi\":"+String(WiFi.RSSI(i))+",\"channel\":"+String(WiFi.channel(i))+",\"open\":"+(WiFi.encryptionType(i)==WIFI_AUTH_OPEN ? "true":"false")+"}";
    }
    json(s+"]}");
  });
  server.on("/api/ble", HTTP_POST, [] {
    if(!action()) return;
    if(!bleReady) { BLEDevice::init("Echo-Diagnostics"); bleReady = true; }
    BLEAdvertising *adv = BLEDevice::getAdvertising();
    if(bleOn) adv->stop();
    else {
      BLEAdvertisementData data; data.setName("Echo-Diagnostics"); data.setFlags(0x06);
      adv->setAdvertisementType(ADV_TYPE_NONCONN_IND); adv->setAdvertisementData(data); adv->start();
    }
    bleOn = !bleOn; logEvent(bleOn ? "BLE beacon started" : "BLE beacon stopped");
    ok(bleOn ? "BLE beacon on" : "BLE beacon off");
  });
  server.on("/api/restart", HTTP_POST, [] { if(action()) { ok("Restarting"); restartAt = millis()+700; } });
  server.onNotFound([] { fail("Not found",404); });
  server.begin();
}
void setup() {
  Serial.begin(115200); delay(1200);
  logEvent(String("Echo console boot; reset: ")+resetReason());
  logEvent(psramFound() ? "PSRAM detected" : "WARNING: PSRAM unavailable");
  WiFi.mode(WIFI_AP_STA); // Enable hardware RF entropy before generating the password.
  Preferences prefs;
  if(!prefs.begin("echo-console",false)) { logEvent("FATAL: cannot open settings; Wi-Fi not started"); return; }
  password = prefs.getString("ap-pass", "");
  if(password.length()!=16) {
    const char alphabet[]="abcdefghijkmnpqrstuvwxyz23456789";
    password="";
    for(int i=0;i<16;i++) password += alphabet[esp_random()%(sizeof(alphabet)-1)];
    if(prefs.putString("ap-pass",password)==0) { prefs.end(); logEvent("FATAL: cannot save Wi-Fi password"); return; }
  }
  prefs.end();
  uint64_t mac = ESP.getEfuseMac(); char suffix[8]; snprintf(suffix,sizeof(suffix),"%04X",(unsigned int)(mac>>32));
  ssid = String("Echo-Device-")+suffix;
  WiFi.setSleep(false);
  if(!WiFi.softAP(ssid.c_str(),password.c_str(),1,false,2)) { logEvent("FATAL: Wi-Fi access point failed"); return; }
  // Password deliberately appears only on the local USB console, not web logs.
  Serial.printf("\nWi-Fi network: %s\nWi-Fi password: %s\nOpen http://192.168.4.1\n\n",ssid.c_str(),password.c_str());
  logEvent("Local Wi-Fi ready; connection details are in USB serial output");
  SPI.begin(7,8,9,21); mountCard(); routes();
  logEvent("Web console ready; camera, microphone and BLE are off");
}
void loop() {
  server.handleClient();
  if(restartAt && (int32_t)(millis()-restartAt)>=0) ESP.restart();
  static uint32_t heartbeat=0;
  if(millis()-heartbeat>30000) { heartbeat=millis(); logEvent("Heartbeat; free heap="+String(ESP.getFreeHeap())+"; Wi-Fi clients="+String(WiFi.softAPgetStationNum())); }
  delay(2);
}
