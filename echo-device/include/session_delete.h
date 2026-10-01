#pragma once
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <ctype.h>
// Only fixed metadata names and bounded canonical chunk filenames are erasable.
static bool erasableSessionFile(const char *name) {
 if(!strcmp(name,"journal")||!strcmp(name,"complete"))return true;
 if(strncmp(name,"chunk-",6))return false;
 const char *p=name+6; if(!isdigit((unsigned char)*p))return false;
 if(*p=='0' && isdigit((unsigned char)p[1]))return false;
 unsigned n=0;unsigned digits=0;
 while(isdigit((unsigned char)*p)){if(++digits>3)return false;n=n*10+(*p++-'0');}
 return n<130&&!strcmp(p,".wav");
}
static bool manualDeleteAuthorized(bool active,bool action,const char *id,const char *confirmed,bool acknowledged) {
 if(active||!action||!acknowledged||!id||!confirmed||strcmp(id,confirmed)||strncmp(id,"session-",8))return false;
 size_t length=strlen(id);if(length<9||length>64)return false;
 for(size_t i=0;i<length;i++)if(!isalnum((unsigned char)id[i])&&id[i]!='-')return false;
 return true;
}

// Metadata survives any audio failure; retrying absent files is harmless.
template<class RemoveFile,class RemoveDirectory>
static bool eraseSessionFiles(RemoveFile removeFile,RemoveDirectory removeDirectory) {
 char name[24];
 for(unsigned i=0;i<130;i++){snprintf(name,sizeof(name),"chunk-%u.wav",i);if(!removeFile(name))return false;}
 if(!removeFile("complete")||!removeFile("journal"))return false;
 return removeDirectory();
}
