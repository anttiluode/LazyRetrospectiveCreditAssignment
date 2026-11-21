/* A causal, inspectable webcam residue tape + octave summaries.
 * No GPU, neural weights, labels, background requests, or external services.
 * Browser global + CommonJS for independent tests.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.ResidueWebcam=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
'use strict';
const TAUS=[1,2,4,8,16,32,64,128];
const CHANNEL_NAMES=['core level','middle energy','fast energy','fast polarity'];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
function tilesFromParts(parts,width,height,gx=6,gy=4){
  const channels=4, out=new Float32Array(gx*gy*channels);
  for(let by=0;by<gy;by++)for(let bx=0;bx<gx;bx++){
    const x0=Math.floor(bx*width/gx),x1=Math.floor((bx+1)*width/gx);
    const y0=Math.floor(by*height/gy),y1=Math.floor((by+1)*height/gy);
    let c=0,m=0,f=0,sign=0,n=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const k=y*width+x;
      c+=parts.core[k];m+=Math.abs(parts.middle[k]);
      f+=Math.abs(parts.fast[k]);sign+=parts.fast[k];n++;
    }
    const o=(by*gx+bx)*channels;
    out[o]=c/n;out[o+1]=m/n;out[o+2]=f/n;out[o+3]=sign/n;
  }
  return out;
}
function maxReconstructionError(frame,parts){let e=0;for(let i=0;i<frame.length;i++)e=Math.max(e,Math.abs(frame[i]-(parts.core[i]+parts.middle[i]+parts.fast[i])));return e;}
class ResidueTape{
  constructor(capacity=512){this.capacity=capacity;this.buffer=[];this.total=0;}
  add(t,frame,parts,surprise,tiles){
    // Preserve the full signed spatial components, not just energy summaries.
    // The three bands reconstruct frame exactly to float precision.
    const copy=a=>Float32Array.from(a);
    const r={t,core:copy(parts.core),middle:copy(parts.middle),fast:copy(parts.fast),surprise:copy(surprise),tiles:copy(tiles)};
    if(this.buffer.length===this.capacity)this.buffer.shift();this.buffer.push(r);this.total++;
    return r;
  }
  getBack(n=0){return this.buffer[this.buffer.length-1-n]||null;}
  snapshotStats(){return {framesRetained:this.buffer.length,framesEverSaved:this.total,oldest:this.buffer[0]?.t??null,newest:this.getBack()?.t??null};}
}
class TemporalOctaves{
  constructor(channels){this.channels=channels;this.levels=TAUS.map(()=>new Float64Array(channels));this.steps=0;}
  // Return prior-only octave differences. Each level is a causal EMA;
  // these summaries are *not* lossless replacements for the residue tape.
  snapshot(){const a=new Float32Array(this.channels*TAUS.length);for(let c=0;c<this.channels;c++){
    for(let k=0;k<TAUS.length;k++)a[c*TAUS.length+k]=this.levels[k][c]-(k+1<TAUS.length?this.levels[k+1][c]:0);
  }return a;}
  update(channels){if(channels.length!==this.channels)throw Error('TemporalOctaves channel mismatch');
    for(let k=0;k<TAUS.length;k++){
      const alpha=1-Math.exp(-1/TAUS[k]);
      for(let c=0;c<this.channels;c++)this.levels[k][c]+=alpha*(channels[c]-this.levels[k][c]);
    }this.steps++;
  }
}
function correlation(xs,ys){const n=xs.length;if(n<4||n!==ys.length)return 0;
  let mx=0,my=0;for(let i=0;i<n;i++){mx+=xs[i];my+=ys[i];}mx/=n;my/=n;
  let sxx=0,syy=0,sxy=0;for(let i=0;i<n;i++){const x=xs[i]-mx,y=ys[i]-my;sxx+=x*x;syy+=y*y;sxy+=x*y;}
  return sxx<1e-7||syy<1e-8?0:sxy/Math.sqrt(sxx*syy);
}
function seeded(seed){let s=seed>>>0;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function permutationP(x,y,seed=7,nPerm=199){const obs=Math.abs(correlation(x,y)),rng=seeded(seed),work=Array.from(y);let exceed=0;
  for(let k=0;k<nPerm;k++){
    for(let i=work.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[work[i],work[j]]=[work[j],work[i]];}
    if(Math.abs(correlation(x,work))>=obs-1e-12)exceed++;
  }return (1+exceed)/(1+nPerm);
}
class RetrospectiveProbe{
  constructor({channels,width,height,minimumEvents=16,debounce=10,topK=5,permutations=199}={}){
    Object.assign(this,{channels,width,height,minimumEvents,debounce,topK,permutations});
    this.events=[];this.pending=null;this.lastTrigger=-Infinity;this.axis=null;this.analysis={status:'WAIT',events:0,reason:'Need repeated comparable collisions'};
  }
  arm(t,octaves,forecast,reason='automatic'){
    if(this.pending||t-this.lastTrigger<this.debounce)return false;
    this.pending={t,octaves:Float32Array.from(octaves),reason,
      predicted:Float32Array.from(forecast.predicted),B:Float32Array.from(forecast.variance),
      familiarity:avg(Array.from(forecast.familiarity))};
    this.lastTrigger=t;return true;
  }
  finish(t,frame){if(!this.pending)return null;const p=this.pending;
    if(t<=p.t)return null;
    this.pending=null;
    if(t!==p.t+1)return null; // no splicing across dropped camera frames
    const error=frame.map((v,i)=>v-p.predicted[i]);
    if(!this.axis){let norm=0;for(let i=0;i<error.length;i++)norm+=error[i]*error[i];norm=Math.sqrt(norm);
      if(norm<1e-5)return null;
      this.axis=Float32Array.from(error,v=>v/norm);
    }
    let outcome=0,squared=0;for(let i=0;i<error.length;i++){outcome+=error[i]*this.axis[i];squared+=error[i]*error[i];}
    const event={t:p.t,reason:p.reason,features:p.octaves,outcome, surpriseMSE:squared/error.length,
      B:avg(Array.from(p.B)),familiarity:p.familiarity};
    this.events.push(event);if(this.events.length>120)this.events.shift();
    this.analyze();return event;
  }
  analyze(){const n=this.events.length;this.analysis={status:'WAIT',events:n,reason:`Need at least ${this.minimumEvents} completed independent events`};
    if(n<this.minimumEvents)return this.analysis;
    // Chronological discovery/confirmation split. All feature selection occurs
    // on discovery only. Held-out validation does not retrain or pick features.
    const split=Math.floor(n*.6),early=this.events.slice(0,split),later=this.events.slice(split);
    const ey=early.map(e=>e.outcome),ly=later.map(e=>e.outcome);
    const ranking=[];
    for(let j=0;j<early[0].features.length;j++){
      const score=correlation(early.map(e=>e.features[j]),ey);
      if(Number.isFinite(score))ranking.push({j,discovery:score});
    }
    ranking.sort((a,b)=>Math.abs(b.discovery)-Math.abs(a.discovery));
    const candidates=ranking.slice(0,this.topK).map((c,rank)=>{
      const x=later.map(e=>e.features[c.j]);
      const heldout=correlation(x,ly);
      const p=permutationP(x,ly,31+c.j*971+n*37,this.permutations);
      const corrected=Math.min(1,p*this.topK);
      return {...c,rank:rank+1,heldout,p,corrected,channel:Math.floor(c.j/TAUS.length),octave:c.j%TAUS.length,
        passes:p*this.topK<.05 && Math.sign(heldout)===Math.sign(c.discovery)};
    });
    // Don't call this 'Model-X knockoff FDR': these are episode-shuffled controls.
    const selected=candidates.filter(c=>c.passes);
    this.analysis={status:selected.length?'CANDIDATE':'WAIT',events:n,discovery:early.length,confirmation:later.length,
      reason:selected.length?'Independent validation found association; intervention still needed':'No association passed held-out correction',
      candidates,selected:selected.map(c=>({...c}))};return this.analysis;
  }
}
return {TAUS,CHANNEL_NAMES,tilesFromParts,maxReconstructionError,ResidueTape,TemporalOctaves,RetrospectiveProbe,correlation,permutationP};
});
