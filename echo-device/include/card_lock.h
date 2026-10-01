#pragma once
#include <freertos/semphr.h>
static SemaphoreHandle_t cardMutex=nullptr;
class CardGuard {
  bool owns;
public:
  explicit CardGuard(TickType_t wait=portMAX_DELAY):owns(cardMutex && xSemaphoreTake(cardMutex,wait)==pdTRUE) {}
  ~CardGuard(){if(owns)xSemaphoreGive(cardMutex);}
  bool locked() const{return owns;}
  CardGuard(const CardGuard&)=delete;
  CardGuard& operator=(const CardGuard&)=delete;
};
