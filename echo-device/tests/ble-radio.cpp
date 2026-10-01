#include <cassert>
#include <string>
#include <vector>
static std::vector<std::string> events;
static bool sleepSuccess=true, hostSuccess=true, bleReady=false;
struct Wifi { bool setSleep(bool enabled) { assert(enabled); events.push_back("modem sleep"); return sleepSuccess; } } WiFi;
struct BLEDevice { static void init(const char *) { events.push_back("BLE init"); } };
static const int ESP_BLUEDROID_STATUS_ENABLED=2;
static int esp_bluedroid_get_status() { return hostSuccess?2:0; }
static void logEvent(const char *) {}
static void fail(const char *) { events.push_back("HTTP error"); }
#include "../include/ble_radio.h"
int main() {
 sleepSuccess=false; assert(!initializeBle("test")); assert(!bleReady);
 assert((events==std::vector<std::string>{"modem sleep","HTTP error"}));
 events.clear(); sleepSuccess=true; hostSuccess=false;
 assert(!initializeBle("test")); assert(!bleReady);
 assert((events==std::vector<std::string>{"modem sleep","BLE init","HTTP error"}));
 events.clear();hostSuccess=true;assert(initializeBle("test"));assert(bleReady);
 assert((events==std::vector<std::string>{"modem sleep","BLE init"}));
 events.clear();assert(initializeBle("test"));assert((events==std::vector<std::string>{"modem sleep"}));
}
