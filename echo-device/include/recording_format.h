#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <ctype.h>
static constexpr uint32_t RATE=16000, CHUNK=RATE*60, OVERLAP=RATE*2, LIMIT=RATE*7200;
static constexpr uint64_t RESERVE=8*1024*1024;
struct ChunkRecord { uint32_t sequence,startMs,endMs,overlapMs,size; char checksum[65]; };
static void wavHeader(uint8_t *h,uint32_t samples) {
  memset(h,0,44);memcpy(h,"RIFF",4);memcpy(h+8,"WAVEfmt ",8);memcpy(h+36,"data",4);
  auto put=[&](int p,uint32_t n){for(int i=0;i<4;i++)h[p+i]=n>>(8*i);};
  put(4,samples*2+36);put(16,16);h[20]=1;h[22]=1;put(24,RATE);put(28,RATE*2);h[32]=2;h[34]=16;put(40,samples*2);
}
// Accept only a contiguous sample-exact committed prefix. A torn journal is partial.
static bool validRecord(const ChunkRecord &r,size_t sequence,uint32_t previousEnd) {
  if(sequence>=130||r.sequence!=sequence||r.checksum[64]!=0||r.endMs<=r.startMs||r.endMs>7200000||r.endMs-r.startMs>60000||r.overlapMs!=(sequence?2000:0)||r.startMs!=(sequence?previousEnd-2000:0)||r.size!=44+(r.endMs-r.startMs)*32)return false;
  if(sequence&&(previousEnd<2000||r.endMs<=previousEnd))return false;
  for(int i=0;i<64;i++)if(!isxdigit((unsigned char)r.checksum[i]))return false;
  return true;
}
