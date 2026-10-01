const fs=require('fs'),vm=require('vm'),assert=require('assert');
const page=fs.readFileSync(__dirname+'/../include/recording_page.h','utf8');
const elements={};function element(){return {textContent:'',children:[],style:{},classList:{toggle(){}},replaceChildren(){this.children=[]},append(...x){this.children.push(...x)},setAttribute(){},removeAttribute(){},click(){}}}
for(const [,id] of page.matchAll(/id="([^"]+)"/g))elements[id]=element();elements.meter.children=[];
let xhr,requests=0;const timers=[];class XHR{constructor(){xhr=this}open(method,url){this.url=url}send(){}abort(){this.onabort()}getResponseHeader(){return '1048576'}}
const context={document:{getElementById:id=>elements[id],createElement:element},XMLHttpRequest:XHR,URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},fetch:async()=>{requests++;return {ok:true,json:async()=>({recording:false,stopping:false,sd:true,durationMs:0,level:0,freeBytes:0,sessions:[]})}},AbortController,setTimeout(fn,ms){timers.push([fn,ms]);return timers.length},clearTimeout(){}};
vm.createContext(context);vm.runInContext(page.match(/<script>([\s\S]*?)<\/script>/)[1],context);
(async()=>{await new Promise(r=>setImmediate(r));
vm.runInContext("downloadSession('session-test')",context);assert(elements.transferStatus.textContent.includes('Preparing'));assert(elements.toggle.disabled);const before=requests;await vm.runInContext('poll()',context);assert.equal(requests,before);
xhr.onprogress({lengthComputable:true,loaded:524288,total:1048576});assert.equal(elements.transferProgress.value,50);assert(elements.transferStatus.textContent.includes('50%'));
xhr.status=200;xhr.response={size:1048576};xhr.onload();assert(elements.transferStatus.textContent.includes('browser for saving'));assert.equal(vm.runInContext('transferring',context),false);
vm.runInContext("downloadSession('session-test')",context);xhr.onerror();assert(elements.transferStatus.textContent.includes('connection interrupted'));assert.equal(elements.toggle.disabled,false);
vm.runInContext("downloadSession('session-test')",context);xhr.status=200;xhr.response={size:20};xhr.onload();assert(elements.transferStatus.textContent.includes('incomplete'));
vm.runInContext("downloadSession('session-test')",context);timers.filter(([,ms])=>ms===180000).at(-1)[0]();assert(elements.transferStatus.textContent.includes('stalled'));assert.equal(vm.runInContext('transferring',context),false);
console.log('PASS: preparation, progress, polling pause, save handoff, disconnect, truncation and stalled-transfer recovery');})().catch(e=>{console.error(e);process.exitCode=1});
