#pragma once
#include <atomic>

// Experimental ping only: no audio, credentials or recorder commands over BLE.
static const char *probeServiceId = "b2d10000-739e-4a72-8e21-ec4010210001";
static const char *probePingId = "b2d10001-739e-4a72-8e21-ec4010210001";
static std::atomic<bool> probeEnabled{false}, probeConnected{false};
static std::atomic<uint32_t> probePings{0};
static BLEServer *probeServer = nullptr;
static bool probeJoining = false;
static uint32_t probeJoinStart = 0;
static String probeWifiState = "Not requested";
class ProbeServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *) override { probeConnected = true; }
  void onDisconnect(BLEServer *) override {
    probeConnected = false;
    if(probeEnabled) BLEDevice::startAdvertising();
  }
};
class ProbePingCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    if(!probeEnabled) return;
    std::string value = c->getValue();
    if(value == "ping") { ++probePings; c->setValue("pong"); }
    else c->setValue("expected ping");
  }
};
static void probePoll() {
  if(!probeJoining) return;
  if(WiFi.status() == WL_CONNECTED) {
    probeJoining = false; probeWifiState = "Connected";
    logEvent("Probe shared Wi-Fi connected");
  } else if(millis()-probeJoinStart >= 20000) {
    probeJoining = false; WiFi.disconnect(false,true);
    probeWifiState = "Connection timed out; check credentials, 2.4 GHz and network access";
    logEvent("Probe shared Wi-Fi timed out");
  }
}
static void probeRoutes() {
  server.on("/probe", HTTP_GET, [] {
    server.sendHeader("Cache-Control","no-store");
    server.sendHeader("X-Frame-Options","DENY");
    server.sendHeader("Content-Security-Policy","default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'none'");
    server.send_P(200,"text/html",PROBE_PAGE);
  });
  server.on("/api/probe/status", HTTP_GET, [] {
    bool connected = WiFi.status() == WL_CONNECTED;
    json(String("{\"bleEnabled\":")+(probeEnabled?"true":"false")+
      ",\"bleConnected\":"+(probeConnected?"true":"false")+
      ",\"pings\":"+String(probePings.load())+
      ",\"wifi\":"+quote(probeJoining?"Connecting (20 second limit)":connected?"Connected":probeWifiState)+
      ",\"stationIp\":"+quote(connected?WiFi.localIP().toString():"")+
      ",\"rssi\":"+String(connected?WiFi.RSSI():0)+
      ",\"recording\":"+(capturing?"true":"false")+"}");
  });
  server.on("/api/probe/ble/start", HTTP_POST, [] {
    if(!action()) return;
    if(probeEnabled) { ok("BLE probe already enabled"); return; }
    if(!bleReady) { BLEDevice::init("Echo-Handoff-Probe"); bleReady=true; }
    BLEAdvertising *adv=BLEDevice::getAdvertising(); adv->stop(); bleOn=false;
    if(!probeServer) {
      probeServer=BLEDevice::createServer(); probeServer->setCallbacks(new ProbeServerCallbacks());
      BLEService *service=probeServer->createService(probeServiceId);
      BLECharacteristic *ping=service->createCharacteristic(probePingId,BLECharacteristic::PROPERTY_READ|BLECharacteristic::PROPERTY_WRITE);
      ping->setValue("ready"); ping->setCallbacks(new ProbePingCallbacks()); service->start();
    }
    BLEAdvertisementData data; data.setFlags(0x06); data.setCompleteServices(BLEUUID(probeServiceId));
    BLEAdvertisementData scan; scan.setName("Echo-Handoff-Probe");
    adv->setAdvertisementData(data); adv->setScanResponseData(scan); adv->setScanResponse(true);
    adv->setAdvertisementType(ADV_TYPE_IND); probeEnabled=true; adv->start();
    ok("Connect with a BLE GATT client; write ping, then read pong");
  });
  server.on("/api/probe/ble/stop", HTTP_POST, [] {
    if(!action()) return;
    probeEnabled=false; if(bleReady) BLEDevice::getAdvertising()->stop();
    if(probeServer && probeConnected) probeServer->disconnect(probeServer->getConnId());
    ok("BLE probe disabled");
  });
  server.on("/api/probe/wifi/join", HTTP_POST, [] {
    if(!action()) return;
    String network=server.arg("ssid"), key=server.arg("password");
    if(network.length()<1 || network.length()>32 || key.length()>63 || (key.length()>0 && key.length()<8)) {
      fail("Use a 1–32 byte SSID and an empty or 8–63 byte password",400); return;
    }
    if(probeJoining) { fail("Connection attempt already running",409); return; }
    WiFi.persistent(false); WiFi.setAutoReconnect(false); WiFi.disconnect(false,true);
    WiFi.begin(network.c_str(),key.c_str());
    probeJoining=true; probeJoinStart=millis(); probeWifiState="Connecting";
    ok("Connecting; access point stays available, but channel changes may briefly disconnect this page");
  });
  server.on("/api/probe/wifi/leave", HTTP_POST, [] {
    if(!action()) return;
    probeJoining=false; WiFi.disconnect(false,true); probeWifiState="Disconnected by owner";
    ok("Shared Wi-Fi disconnected; return to the device access point");
  });
  server.on("/api/probe/data", HTTP_GET, [] {
    // Fixed 64 KiB synthetic payload; no SD access, bounded stalled-client wait.
    server.sendHeader("Cache-Control","no-store");
    server.sendHeader("X-Content-Type-Options","nosniff");
    server.setContentLength(65536); server.send(200,"application/octet-stream","");
    WiFiClient client=server.client(); client.setTimeout(1000);
    uint8_t block[1024]; for(size_t i=0;i<sizeof(block);++i) block[i]=i%251;
    uint32_t start=millis();
    for(size_t offset=0;offset<65536 && client.connected() && millis()-start<5000;offset+=sizeof(block)) {
      if(client.write(block,sizeof(block))!=sizeof(block)) break;
      delay(1);
    }
    client.stop();
  });
}
