#include <cassert>
#include "../include/recording_format.h"
int main(){
 assert(validTransferSlice(1920044,0,16384));
 assert(validTransferSlice(76,0,76));
 assert(validTransferSlice(76,75,1));
 assert(!validTransferSlice(76,76,1));
 assert(!validTransferSlice(76,0,77));
 assert(!validTransferSlice(1920044,0,16385));
 assert(!validTransferSlice(76,0,0));
 assert(!validTransferSlice(76,UINT32_MAX,2));
 assert(!validTransferSlice(UINT32_MAX,UINT32_MAX-1,2));
}
