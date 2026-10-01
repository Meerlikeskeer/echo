#include "../include/recording_format.h"
#include <assert.h>
#include <stdio.h>
static uint32_t le32(const uint8_t *p){return p[0]|uint32_t(p[1])<<8|uint32_t(p[2])<<16|uint32_t(p[3])<<24;}
static ChunkRecord record(uint32_t sequence,uint32_t start,uint32_t end){ChunkRecord r={};r.sequence=sequence;r.startMs=start;r.endMs=end;r.overlapMs=sequence?2000:0;r.size=44+(end-start)*32;memset(r.checksum,'a',64);return r;}
int main(){
  uint8_t h[44];wavHeader(h,CHUNK);assert(!memcmp(h,"RIFF",4));assert(!memcmp(h+8,"WAVEfmt ",8));assert(!memcmp(h+36,"data",4));assert(le32(h+4)==1920036);assert(le32(h+40)==1920000);assert(le32(h+24)==16000);assert(le32(h+28)==32000);assert(h[20]==1&&h[22]==1&&h[32]==2&&h[34]==16);
  wavHeader(h,256);assert(le32(h+40)==512);assert(le32(h+4)==548);
  auto first=record(0,0,60000);assert(validRecord(first,0,0));auto next=record(1,58000,118000);assert(validRecord(next,1,60000));
  auto shortTail=record(1,58000,60016);assert(validRecord(shortTail,1,60000));
  auto duplicateOnly=record(1,58000,60000);assert(!validRecord(duplicateOnly,1,60000));
  auto gap=record(1,60000,120000);assert(!validRecord(gap,1,60000));auto tooLong=record(0,0,60001);assert(!validRecord(tooLong,0,0));
  auto torn=first;torn.size--;assert(!validRecord(torn,0,0));torn=first;torn.checksum[63]='x';assert(!validRecord(torn,0,0));torn=first;torn.checksum[64]='a';assert(!validRecord(torn,0,0));assert(!validRecord(next,2,60000));
  uint32_t end=0;size_t chunks=0;while(end<7200000){uint32_t start=chunks?end-2000:0;uint32_t nextEnd=start+60000;if(nextEnd>7200000)nextEnd=7200000;auto r=record(chunks,start,nextEnd);assert(validRecord(r,chunks,end));end=nextEnd;chunks++;}assert(chunks<=130);
  auto overtime=record(chunks,7199000,7200001);assert(!validRecord(overtime,chunks,7201000));
  puts("PASS: canonical WAV, short tail, two-hour timeline, overlap, gaps, corrupt/torn metadata, duplicated tail");
}
