const fs=require('fs'),vm=require('vm'),assert=require('assert');
const page=fs.readFileSync(__dirname+'/../include/console_page.h','utf8');
const elements={};
for(const [,id] of page.matchAll(/id="([^"]+)"/g))elements[id]={textContent:'',children:[],replaceChildren(){this.children=[]},append(...x){this.children.push(...x)},click(){},src:'',scrollHeight:0};
let failCamera=false;
const responses={
 '/api/status':{firmware:'test',chip:'ESP32-S3',uptime:2500,reset:'Power on',cpu:240,heap:200000,minHeap:180000,psram:8000000,flash:8388608,ssid:'Echo-test',ip:'192.168.4.1',clients:1,sd:false,ble:false},
 '/api/logs':{logs:'boot\nready'},
 '/api/sd/files?path=%2F':{files:[{name:'<img onerror=alert(1)>',path:'/file',directory:false,size:5}],truncated:false},
 '/api/camera/start':{message:'ready'}
};
const context={document:{getElementById(id){assert(elements[id],id);return elements[id]},createElement(){return {textContent:'',click(){}}}},fetch:async path=>({ok:!(failCamera&&path==='/api/camera/start'),json:async()=>responses[path],text:async()=>'camera failed'}),AbortSignal:{timeout(){}},setInterval(){},setTimeout(){},Blob,URL,confirm:()=>false,console};
vm.createContext(context);vm.runInContext(page.match(/<script>([\s\S]*?)<\/script>/)[1],context);
(async()=>{await new Promise(r=>setImmediate(r));assert.equal(elements.connection.textContent,'● Connected');assert.equal(elements.logs.textContent,'boot\nready');assert.equal(elements.files.children[0].textContent,'↓ <img onerror=alert(1)> · 5 bytes');assert(elements.sdState.textContent.includes('Not mounted'));failCamera=true;await vm.runInContext("$('camera').onclick()",context);assert.equal(elements.camera.textContent,'Start preview');assert.equal(elements.notice.textContent,'camera failed');console.log('PASS: status, logs, SD unavailable, literal filenames, camera failure recovery');})().catch(e=>{console.error(e);process.exit(1)});
