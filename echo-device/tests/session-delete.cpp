#include <initializer_list>

#include <cassert>
#include <set>
#include <string>
#include "../include/session_delete.h"
int main(){
 assert(manualDeleteAuthorized(false,true,"session-good","session-good",true));
 assert(!manualDeleteAuthorized(true,true,"session-good","session-good",true));
 assert(!manualDeleteAuthorized(false,false,"session-good","session-good",true));
 assert(!manualDeleteAuthorized(false,true,"session-good","session-other",true));
 assert(!manualDeleteAuthorized(false,true,"session-good","session-good",false));
 assert(!manualDeleteAuthorized(false,true,"session-../bad","session-../bad",true));
 for(const char *n:{"journal","complete","chunk-0.wav","chunk-129.wav"})assert(erasableSessionFile(n));
 for(const char *n:{"chunk-130.wav","chunk-01.wav","chunk-9999999.wav","../journal","secret","chunk-0.wav/extra","chunk-0.WAV"})assert(!erasableSessionFile(n));
 std::set<std::string> files={"chunk-0.wav","chunk-1.wav","journal","complete"};
 bool directory=true;
 auto remove=[&](const char *name){if(!strcmp(name,"chunk-1.wav"))return false;files.erase(name);return true;};
 assert(!eraseSessionFiles(remove,[&](){directory=false;return true;}));
 assert(!files.count("chunk-0.wav")&&files.count("chunk-1.wav")&&files.count("journal")&&files.count("complete")&&directory);
 assert(eraseSessionFiles([&](const char *name){files.erase(name);return true;},[&](){directory=false;return true;}));
 assert(files.empty()&&!directory);
 assert(eraseSessionFiles([](const char*){return true;},[]{return true;}));
}
