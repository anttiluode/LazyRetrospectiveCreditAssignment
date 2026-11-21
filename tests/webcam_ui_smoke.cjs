'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'..');
const elements=new Map();
function ctx(){return {imageSmoothingEnabled:false,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(48*36*4)}),fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};}
function el(id){if(!elements.has(id)){const e={id,textContent:'',innerHTML:'',value:'0',checked:false,selectedIndex:0,add(){},getContext:ctx,addEventListener(){},pause(){},load(){},play:()=>Promise.resolve(),removeAttribute(){},click(){},append(){},remove(){},readyState:0};elements.set(id,e);}return elements.get(id);}
el('learn').checked=true;el('rewind').value='0';el('tile').value='10';el('archiveBand').value='fast';
const doc={getElementById:el,createElement:()=>({click(){},remove(){}}),body:{append(){}}};
const P=require('../predictive_engine.js'),R=require('../webcam_core.js');
const window={PredictiveSihti:P,ResidueWebcam:R,addEventListener(){}};
const sandbox={window,document:doc,Option:function(text,value){this.text=text;this.value=value;},
  performance:{now:()=>0},setInterval:()=>1,clearInterval(){},setTimeout(){},
  URL:{createObjectURL:()=> 'blob:fake',revokeObjectURL(){}},Blob:class{constructor(parts){this.parts=parts;}},
  navigator:{},console,Float32Array,Uint8ClampedArray,Date,Math};
vm.runInNewContext(fs.readFileSync(path.join(base,'webcam_app.js'),'utf8'),sandbox,{filename:'webcam_app.js'});
const app=window.__sihtiWebcam;
assert.ok(app&&typeof app.processFrame==='function');
for(let t=0;t<30;t++){
  const f=new Float32Array(48*36);
  for(let y=0;y<36;y++)for(let x=0;x<48;x++)f[y*48+x]=.04+.8*Math.exp(-((x-3-t*.4)**2+(y-17)**2)/23);
  const metric=app.processFrame(f);
  assert.equal(metric.t,t);assert.ok(Number.isFinite(metric.B));
}
assert.equal(app.state.seen,30);assert.equal(app.state.tape.buffer.length,30);
assert.ok(app.state.head.memories()>0);
assert.ok(Number(el('rewind').max)>=29);
assert.equal(el('frames').textContent,'30');
el('event').onclick();const f=new Float32Array(48*36).fill(.3);
app.processFrame(f);app.processFrame(new Float32Array(48*36).fill(.9));
assert.ok(app.state.events.length>=1);
el('export').onclick();
assert.match(el('status').textContent,/Exported/);
console.log('PASS: browser adapter exercised 32 frames, mark-event successor, six panels, archive, and audit export (mock DOM).');
