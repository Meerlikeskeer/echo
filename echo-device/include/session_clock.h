#pragma once
#include <stdint.h>
#include <stddef.h>
// Pure validation: never accept signs, whitespace, partial parses or bogus epochs.
static uint64_t browserEpoch(const char *value, size_t length) {
  if(length!=13)return 0;
  uint64_t epoch=0;
  for(size_t i=0;i<length;i++){
    if(value[i]<'0'||value[i]>'9')return 0;
    epoch=epoch*10+(value[i]-'0');
  }
  return epoch>=1577836800000ULL&&epoch<=4102444800000ULL?epoch:0;
}
static uint64_t recordingEpoch(uint64_t epoch,uint64_t synchronizedAt,uint64_t uptime) {
  return epoch&&uptime>=synchronizedAt?epoch+uptime-synchronizedAt:0;
}
