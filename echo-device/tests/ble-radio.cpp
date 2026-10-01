#include <cassert>
#include <string>
#include <vector>
static std::vector<std::string> events;
static bool sleepSuccess=true, hostSuccess=true, bleReady=false;
static bool readSuccess=true, correctMode=true;
using wifi_ps_type_t=int;
static const int WIFI_PS_NONE=0, WIFI_PS_MIN_MODEM=1, ESP_OK=0;
static int esp_wifi_set_ps(int mode) { assert(mode==WIFI_PS_MIN_MODEM);events.push_back("driver set");return sleepSuccess?0:-1; }
static int esp_wifi_get_ps(int *mode) { events.push_back("driver read");*mode=correctMode?WIFI_PS_MIN_MODEM:WIFI_PS_NONE;return readSuccess?0:-1; }
struct Wifi { bool setSleep(bool enabled) { assert(enabled); events.push_back("modem sleep"); return false; // Already-enabled cache: Arduino returns false.
 } } WiFi;
struct BLEDevice { static void init(const char *) { events.push_back("BLE init"); } };
static const int ESP_BLUEDROID_STATUS_ENABLED=2;
static int esp_bluedroid_get_status() { return hostSuccess?2:0; }
static void logEvent(const char *) {}
static void fail(const char *) { events.push_back("HTTP error"); }
#include "../include/ble_radio.h"
int main() {
 sleepSuccess=false; assert(!initializeBle("test")); assert(!bleReady);
 assert((events==std::vector<std::string>{"modem sleep","driver set","HTTP error"}));
 events.clear(); sleepSuccess=true; hostSuccess=false;
 assert(!initializeBle("test")); assert(!bleReady);
 assert((events==std::vector<std::string>{"modem sleep","driver set","driver read","BLE init","HTTP error"}));
 events.clear();hostSuccess=true;readSuccess=false;
 assert(!initializeBle("test"));assert(!bleReady);
 events.clear();readSuccess=true;correctMode=false;
 assert(!initializeBle("test"));assert(!bleReady);
 events.clear();correctMode=true;assert(initializeBle("test"));assert(bleReady);
 assert((events==std::vector<std::string>{"modem sleep","driver set","driver read","BLE init"}));
 events.clear();assert(initializeBle("test"));assert((events==std::vector<std::string>{"modem sleep","driver set","driver read"}));
}
