const fs=require('fs'),vm=require('vm'),assert=require('assert');
const page=fs.readFileSync(__dirname+'/../include/probe_page.h','utf8');
const elements={};for(const [,id] of page.matchAll(/id="([^"]+)"/g))elements[id]={value:'',textContent:'',disabled:false};
let mode='valid',reject=false,capturedBody;
const context={document:{getElementById:id=>elements[id]},URLSearchParams,Uint8Array,AbortSignal:{timeout(){}},performance:{now:()=>100},setInterval(){},fetch:async(path,options)=>{
 if(path==='/api/probe/data'){if(mode==='network')throw Error('Connection lost');const data=new Uint8Array(mode==='short'?100:65536);for(let i=0;i<data.length;i++)data[i]=(i%1024)%251;if(mode==='corrupt')data[500]=255;return{ok:true,arrayBuffer:async()=>data.buffer}}
 if(options.body)capturedBody=options.body;return{ok:!reject,json:async()=>reject?{error:'Recording is active'}:path.endsWith('status')?{bleEnabled:true,bleConnected:true,pings:2,wifi:'Connected',stationIp:'10.0.0.5',rssi:-40,recording:false}:{message:'requested'}};
}};
vm.createContext(context);vm.runInContext(page.match(/<script>([\s\S]*?)<\/script>/)[1],context);
(async()=>{await new Promise(r=>setImmediate(r));assert(elements.status.textContent.includes('Acknowledged pings: 2'));assert(elements.status.textContent.includes('10.0.0.5'));
for(const value of ['valid','short','corrupt','network']){mode=value;await elements.transfer.onclick();assert(elements.result.textContent.startsWith(value==='valid'?'PASS':'FAIL'));assert.equal(elements.transfer.disabled,false)}
reject=true;await elements.bleStart.onclick();assert.equal(elements.notice.textContent,'Recording is active');assert.equal(elements.bleStart.disabled,false);
reject=false;elements.ssid.value='test network';elements.password.value='synthetic-password';await elements.join.onclick();assert.equal(elements.password.value,'');assert.equal(capturedBody.get('ssid'),'test network');assert.equal(capturedBody.get('password'),'synthetic-password');
assert(!page.includes('localStorage'));console.log('PASS: live evidence, valid/corrupt/truncated/lost transfers, rejected actions, credential field cleared');
})().catch(e=>{console.error(e);process.exitCode=1});
