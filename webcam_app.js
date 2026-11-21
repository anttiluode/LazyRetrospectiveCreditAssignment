/* Live browser adapter for actual PredictiveSihti V2.2.1 + saved residue tape. */
(function(){'use strict';
const $=id=>document.getElementById(id);
const W=48,H=36,N=W*H,CORE=window.ResidueWebcam,ENGINE=window.PredictiveSihti;
const sampler=$('sampler'),ctx=sampler.getContext('2d',{willReadFrequently:true}),video=$('video');
const empty=new Float32Array(N);
let state,stream=null,source='idle',started=null,fileUrl=null,timer=null,running=false,processing=false,demoTick=0,manualNext=false,frameTimeMs=0;
const paintIds=['observed','forecast','surprise','collision','fast','archiveCanvas'];
const contexts=Object.fromEntries(paintIds.map(id=>[id,$(id).getContext('2d')]));
for(const ctx of Object.values(contexts))ctx.imageSmoothingEnabled=false;
const tile=$('tile');for(let i=0;i<24;i++){const x=i%6,y=Math.floor(i/6);tile.add(new Option(`Tile ${x+1},${y+1}`,String(i)))}tile.selectedIndex=10;
function reset(){
  state={head:new ENGINE.Predictor({width:W,height:H,adaptive:true}),
    tape:new CORE.ResidueTape(512),octaves:new CORE.TemporalOctaves(96),
    probe:new CORE.RetrospectiveProbe({channels:96,width:W,height:H}),
    metrics:[],events:[],reconstructionMax:0,seen:0,autoAlarms:0,manualAlarms:0,overruns:0};
  state.head.learning=$('learn').checked;manualNext=false;demoTick=0;
  $('rewind').max=0;$('rewind').value=0;
  for(const id of paintIds)paint(id,empty,'gray');
  $('frames').textContent='0';$('err').textContent='—';$('gain').textContent='—';$('b').textContent='—';$('memory').textContent='0';$('archive').textContent='0';
  $('probeStatus').textContent='WAIT — no completed collision episodes';$('candidates').innerHTML='<tr><td colspan="4">No candidate yet</td></tr>';
  $('probeReason').textContent='An amber patch by itself is not a discovered cause.';
}
function status(message){$('status').textContent=message;}
function mean(a){let sum=0;for(const x of a)sum+=x;return a.length?sum/a.length:0;}
function paint(id,a,mode='gray'){
  const c=contexts[id];if(!c)return;const img=c.createImageData(W,H),d=img.data;
  let peak=0;if(mode!=='gray')for(const v of a)peak=Math.max(peak,Math.abs(v));
  // Floors are presentation-only: all metrics export the raw values.
  const scale=mode==='collision'?1/Math.max(.00006,peak):1/Math.max(.02,peak);
  for(let i=0;i<N;i++){
    let r=0,g=0,b=0;
    if(mode==='gray'){
      const v=Math.max(0,Math.min(1,a[i]||0));r=g=b=16+v*229;
    }else if(mode==='collision'){
      const v=Math.sqrt(Math.max(0,a[i]||0)*scale);r=12+v*235;g=18+v*145;b=27+v*38;
    }else{
      const v=Math.max(-1,Math.min(1,(a[i]||0)*scale));
      if(v>=0){r=13+v*48;g=18+v*215;b=23+v*160;}
      else{r=13-v*221;g=18-v*64;b=23-v*117;}
    }
    const j=4*i;d[j]=r;d[j+1]=g;d[j+2]=b;d[j+3]=255;
  }c.putImageData(img,0,0);
}
function frameFromVideo(){ctx.drawImage(video,0,0,W,H);const {data}=ctx.getImageData(0,0,W,H),frame=new Float32Array(N);
  for(let i=0;i<N;i++){const j=i*4;frame[i]=(data[j]*.2126+data[j+1]*.7152+data[j+2]*.0722)/255;}
  return frame;
}
function demoFrame(t){const a=new Float32Array(N),x=4+(t*.39)%(W-8),y=H/2+Math.sin(t*.12)*6;
  for(let yy=0;yy<H;yy++)for(let xx=0;xx<W;xx++){
    const d=(xx-x)**2+(yy-y)**2;
    a[yy*W+xx]=.07+.80*Math.exp(-d/10)+.08*Math.sin(xx*.23+yy*.11+t*.05);
  }return a;
}
function drawTimeline(){
  const canvas=$('timeline'),c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  c.fillStyle='#090f13';c.fillRect(0,0,w,h);
  const tape=state.tape.buffer,maxFrames=220,rows=24;
  if(!tape.length)return;
  const start=Math.max(0,tape.length-maxFrames),used=tape.slice(start),cellw=w/Math.max(1,used.length),cellh=(h-18)/rows;
  let peak=.01;for(const s of used)for(let p=0;p<24;p++)peak=Math.max(peak,s.tiles[p*4+2]);
  for(let k=0;k<used.length;k++)for(let p=0;p<24;p++){
    const val=Math.min(1,Math.sqrt(used[k].tiles[p*4+2]/peak));
    c.fillStyle=`rgb(${Math.round(11+val*50)},${Math.round(30+val*186)},${Math.round(34+val*132)})`;
    c.fillRect(k*cellw,p*cellh,Math.ceil(cellw),Math.ceil(cellh));
  }
  const min=used[0].t,max=used[used.length-1].t;
  for(const e of state.events){if(e.t<min||e.t>max)continue;
    const x=(e.t-min)/Math.max(1,max-min)*w;
    c.strokeStyle=e.reason==='manual'?'#ed86aa':'#ffc477';c.lineWidth=1;c.beginPath();c.moveTo(x,0);c.lineTo(x,h-18);c.stroke();
  }
  c.fillStyle='#8da7af';c.font='11px system-ui';
  c.fillText(`Past ←  ${used.length} archived frames  •  lower = recent tile row  •  vertical = event`,7,h-5);
}
function updateArchive(){const e=state.tape.getBack(Number($('rewind').value));
  if(!e){paint('archiveCanvas',empty);return;}
  const band=$('archiveBand').value;paint('archiveCanvas',e[band],band==='core'?'gray':'signed');
  $('ageLabel').textContent=Number($('rewind').value)===0?`Latest • t ${e.t}`:`${$('rewind').value} frames back • t ${e.t}`;
}
function probeDisplay(){const a=state.probe.analysis;
  $('probeStatus').textContent=`${a.status} — ${a.events} completed events`;
  $('probeStatus').className='status'+(a.status==='CANDIDATE'?' good':'');
  $('probeReason').textContent=a.reason||'';
  const entries=(a.candidates||[]).slice(0,5);
  $('candidates').innerHTML=entries.length?entries.map(c=>{
    const tile=Math.floor(c.channel/4),type=CORE.CHANNEL_NAMES[c.channel%4];
    return `<tr><td>tile ${tile}, ${type}, τ ${CORE.TAUS[c.octave]}</td><td>${c.discovery.toFixed(2)}</td><td>${c.heldout.toFixed(2)}</td><td>${c.corrected.toFixed(3)}${c.passes?' ✓':''}</td></tr>`;
  }).join(''):'<tr><td colspan="4">No validated candidate yet</td></tr>';
}
function updateOctaves(){const k=Number(tile.value),a=state.octaves.snapshot(),name=CORE.CHANNEL_NAMES[2];
  $('octaves').textContent='Fast energy, τ = '+CORE.TAUS.map((tau,i)=>`${tau}:${a[(k*4+2)*8+i].toFixed(3)}`).join(' / ');
}
function scoreRunning(){const x=state.metrics.slice(-60).filter(r=>r.hold!=null),sModel=x.reduce((a,r)=>a+r.model,0),sHold=x.reduce((a,r)=>a+r.hold,0);
  return sHold>1e-9?(1-sModel/sHold):null;
}
function observe(frame){const t=state.seen,start=performance.now();
  // The event armed at t-1 is completed only after frame t has arrived.
  const finished=state.probe.finish(t,frame);if(finished){state.events.push({t:finished.t,reason:finished.reason,outcome:finished.outcome,surpriseMSE:finished.surpriseMSE,B:finished.B});probeDisplay();}
  // Capture the available past before ingesting the new observation.
  const pastTraces=state.octaves.snapshot();
  const result=state.head.observe(frame),comp=result.completed,parts=result.forecast.parts;
  const surprise=comp?comp.error:empty;
  const tiles=CORE.tilesFromParts(parts,W,H),recon=CORE.maxReconstructionError(frame,parts);
  state.reconstructionMax=Math.max(state.reconstructionMax,recon);
  state.tape.add(t,frame,parts,surprise,tiles);
  state.octaves.update(tiles);
  const B=result.forecast.variance,meanB=mean(B),fam=mean(result.forecast.familiarity);
  const maxB=Math.max(...B);
  // Automatic alarms only at familiar, conflicting predictions. Do not use
  // the successor observation; this trigger is based on the current address.
  const auto=t>=32&&fam>.57&&maxB>.00013&&meanB>.000025;
  if(manualNext||auto){
    if(state.probe.arm(t,pastTraces,result.forecast,manualNext?'manual':'automatic')){
      if(manualNext)state.manualAlarms++;else state.autoAlarms++;
    }manualNext=false;
  }
  const record={t,source,wallClockISO:new Date().toISOString(),model:comp?comp.model:null,
    hold:comp?comp.hold:null,gain:comp?comp.gain:null,B:meanB,maxB,familiarity:fam,
    recruited:comp?comp.recruited:0,memories:result.memories,learning:state.head.learning,
    writes:comp?.writes?.stored??0,merges:comp?.writes?.merges??0,reconstructionError:recon,
    processingMs:performance.now()-start};
  state.metrics.push(record);if(state.metrics.length>5000)state.metrics.shift();state.seen++;
  paint('observed',frame,'gray');paint('forecast',result.forecast.predicted,'gray');
  paint('surprise',surprise,'signed');paint('collision',B,'collision');
  paint('fast',parts.fast,'signed');
  $('rewind').max=Math.max(0,state.tape.buffer.length-1);
  updateArchive();
  $('frames').textContent=String(state.seen);$('err').textContent=comp?comp.model.toFixed(5):'—';
  const gain=scoreRunning();$('gain').textContent=gain===null?'—':`${(100*gain).toFixed(1)}%`;
  $('b').textContent=meanB.toFixed(7);$('memory').textContent=result.memories.toLocaleString();
  $('archive').textContent=state.tape.buffer.length;
  if(t%4===0){drawTimeline();updateOctaves();}
  frameTimeMs=performance.now()-start;
  return record;
}
function step(){if(!running||processing)return;processing=true;
  try{
    let frame=null;
    if(source==='demo')frame=demoFrame(demoTick++);
    else if(video.readyState>=2 && video.videoWidth>0){
      if(video.ended){stop();status('Video reached its end. Export the numerical receipt to inspect the result.');return;}
      frame=frameFromVideo();
    }
    if(frame)observe(frame);
  }catch(err){status('Processing error: '+String(err.message||err));console.error(err);stop();}
  finally{processing=false;}
}
function clearMedia(){if(timer){clearInterval(timer);timer=null;}running=false;
  if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
  video.pause();video.srcObject=null;video.removeAttribute('src');video.load();
  if(fileUrl){URL.revokeObjectURL(fileUrl);fileUrl=null;}
}
function stop(){clearMedia();source='idle';status(`Stopped. ${state.seen} archived observations in memory. Export JSON to keep the metrics.`);}
function startLoop(newSource){source=newSource;running=true;started=new Date().toISOString();timer=setInterval(step,300);step();}
async function startCamera(){clearMedia();reset();
  if(!navigator.mediaDevices?.getUserMedia){status('Camera API unavailable: open via http://127.0.0.1 (the Windows launcher), not an insecure remote HTTP page.');return;}
  try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:15}}});
    video.srcObject=stream;video.muted=true;await video.play();
    startLoop('webcam');status('Camera live. Nothing is uploaded. Move an object, cover the lens briefly, or change lighting. Mark comparable events to collect retrospective tests.');
  }catch(e){status(`Camera couldn't start: ${e.name||'Error'} — ${e.message||e}. Try localhost and allow permission.`);}
}
function startFile(file){if(!file)return;clearMedia();reset();fileUrl=URL.createObjectURL(file);video.src=fileUrl;video.loop=false;video.muted=true;
  video.play().then(()=>{startLoop('local-video');status(`Reading local video “${file.name}” in your browser, without uploading it.`)}).catch(e=>status('Video open failed: '+String(e.message||e)));
}
function startDemo(){clearMedia();reset();startLoop('demo');status('DEMO / SYNTHETIC source — this is not webcam evidence. Use it to inspect panels before granting camera permission.');}
function exportAudit(){const arr=state.metrics,scored=arr.filter(x=>x.model!==null),sMod=scored.reduce((s,x)=>s+x.model,0),sHold=scored.reduce((s,x)=>s+x.hold,0);
  const packageData={format:'sihti-webcam-v1',created:new Date().toISOString(),source,
    disclaimer:'Numerical local measurements only; no raw images. Association does not establish a causal precursor.',
    model:'Exact Predictive Sihti V2.2.1, no backprop',
    geometry:{width:W,height:H,framesPerSecondTarget:3.333},
    summary:{framesSeen:state.seen,scoredFrames:scored.length,predictionMSE:scored.length?sMod/scored.length:null,
      holdLastMSE:scored.length?sHold/scored.length:null,modelGain:sHold>1e-9?1-sMod/sHold:null,
      peakReconstructionError:state.reconstructionMax,memories:state.head.memories(),
      archive:state.tape.snapshotStats(),events:state.events.length,
      automaticAlarms:state.autoAlarms,manualAlarms:state.manualAlarms,
      processingMsLatest:frameTimeMs,probeStatus:state.probe.analysis.status},
    probe:state.probe.analysis,
    eventLog:state.events,
    coarseArchive:state.tape.buffer.map(e=>({t:e.t,tiles:Array.from(e.tiles)})),
    metrics:state.metrics};
  if($('fullTape').checked){
    packageData.disclaimer+=' User explicitly included recoverable image data.';
    packageData.reconstructableTape=state.tape.buffer.slice(-60).map(e=>({
      t:e.t,core:Array.from(e.core),middle:Array.from(e.middle),fast:Array.from(e.fast),surprise:Array.from(e.surprise)
    }));
  }
  const blob=new Blob([JSON.stringify(packageData,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`sihti_webcam_${new Date().toISOString().replaceAll(':','-')}.json`;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status(`Exported ${arr.length} numerical frame metrics. ${$('fullTape').checked?'Includes 60 reconstructable frames.':'No reconstructable frames included.'} Upload the JSON here for analysis.`);
}
$('camera').onclick=startCamera;$('demo').onclick=startDemo;$('stop').onclick=stop;$('reset').onclick=()=>{reset();status('Memory, archive, and hypotheses reset. Capture continues if a source is active.');};
$('file').onchange=e=>startFile(e.target.files[0]);$('event').onclick=()=>{manualNext=true;status('Manual event armed for the next observation. The future outcome is NOT read until the following frame. Repeat comparable events for a retrospective test.');};
$('learn').onchange=()=>{state.head.learning=$('learn').checked;status(state.head.learning?'Transition memories ON':'Transition memories FROZEN — new observations are evaluated, not written into the predictive atlas.');};
$('export').onclick=exportAudit;$('rewind').oninput=updateArchive;$('archiveBand').onchange=updateArchive;tile.onchange=updateOctaves;
window.addEventListener('beforeunload',clearMedia);
reset();
window.__sihtiWebcam={get state(){return state;},get source(){return source;},processFrame:observe,exportAudit};
})();
