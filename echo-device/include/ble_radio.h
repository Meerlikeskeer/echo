#pragma once

// The bundled ESP-IDF coexistence controller requires Wi-Fi modem sleep.
// Refuse before btStart() if that prerequisite cannot be applied.
static bool initializeBle(const char *name) {
  if(!WiFi.setSleep(true)) {
    logEvent("BLE unavailable: Wi-Fi modem sleep could not be enabled");
    fail("Bluetooth requires Wi-Fi modem sleep; configuration failed");
    return false;
  }
  if(!bleReady) {
    BLEDevice::init(name);
    if(esp_bluedroid_get_status()!=ESP_BLUEDROID_STATUS_ENABLED) {
      logEvent("BLE host initialization failed");
      fail("Bluetooth initialization failed; inspect USB output");
      return false;
    }
    bleReady=true;
  }
  return true;
}
