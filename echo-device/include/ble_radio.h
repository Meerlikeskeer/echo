#pragma once

// The bundled ESP-IDF coexistence controller requires Wi-Fi modem sleep.
// Refuse before btStart() if that prerequisite cannot be applied.
static bool initializeBle(const char *name) {
  // Arduino returns false when its cached setting is unchanged. That is
  // not a driver failure. Keep the cache aligned, then verify the driver.
  WiFi.setSleep(true);
  wifi_ps_type_t sleepMode = WIFI_PS_NONE;
  if(esp_wifi_set_ps(WIFI_PS_MIN_MODEM)!=ESP_OK ||
     esp_wifi_get_ps(&sleepMode)!=ESP_OK || sleepMode!=WIFI_PS_MIN_MODEM) {
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
