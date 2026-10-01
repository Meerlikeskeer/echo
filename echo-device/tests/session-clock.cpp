#include <cassert>
#include <initializer_list>
#include <cstring>
#include "../include/session_clock.h"
int main(){
  assert(browserEpoch("1790888400000",13)==1790888400000ULL);
  for(const char *value:{"", "179088840000", "17908884000000", "179088840000x", "-790888400000", "1000000000000", "9999999999999"})assert(browserEpoch(value,strlen(value))==0);
  assert(recordingEpoch(1790888400000ULL,5000,65000)==1790888460000ULL);
  assert(recordingEpoch(0,0,65000)==0);
  assert(recordingEpoch(1790888400000ULL,5000,0)==0);
}
