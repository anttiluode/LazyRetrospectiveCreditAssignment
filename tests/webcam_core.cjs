'use strict';
const assert=require('node:assert/strict');
const P=require('../predictive_engine.js');
const {ResidueTape,TemporalOctaves,tilesFromParts,maxReconstructionError,RetrospectiveProbe,correlation}=require('../webcam_core.js');
const W=48,H=36,N=W*H;
const makeFrame=(t)=>Float32Array.from({length:N},(_,i)=>{
  const x=i%W,y=Math.floor(i/W),d=(x-(4+t%30))**2+(y-17)**2;
  return .04+.85*Math.exp(-d/19)+.003*Math.sin(i*.06);
});
function check(name,fn){fn();console.log('PASS:',name);}
check('lossless signed Sihti core + middle + fast reconstruction',()=>{
  const f=makeFrame(7),parts=P.decompose(f,W,H);
  assert.ok(maxReconstructionError(f,parts)<3e-7);
});
check('spatial residue tape preserves 3 bands, causal order and fixed capacity',()=>{
  const tape=new ResidueTape(2);
  for(let t=0;t<3;t++){
    const f=makeFrame(t),parts=P.decompose(f,W,H),tile=tilesFromParts(parts,W,H);
    tape.add(t,f,parts,new Float32Array(N),tile);
  }
  assert.equal(tape.buffer.length,2);assert.equal(tape.getBack(1).t,1);
  const last=tape.getBack(0),frame=Float32Array.from(last.core,(v,i)=>v+last.middle[i]+last.fast[i]);
  assert.ok(maxReconstructionError(frame,last)<3e-7);
});
check('causal octave snapshots never change from future inputs',()=>{
  const a=new TemporalOctaves(2),b=new TemporalOctaves(2);
  for(let t=0;t<60;t++){const v=[Math.sin(t*.1),Math.cos(t*.13)];a.update(v);b.update(v);}
  const prior=a.snapshot();b.update([99,-99]);
  assert.deepEqual(Array.from(prior),Array.from(a.snapshot()));
  assert.notDeepEqual(Array.from(a.snapshot()),Array.from(b.snapshot()));
});
check('octave trace retains jittered 60–95 tick precursor better than exact-lag 80 tap',()=>{
  const x=[],y=[],naive=[];
  for(let e=0;e<120;e++){
    const h=e%2===0?1:-1,lag=60+(e*17)%36;
    const q=new TemporalOctaves(1),series=[];
    for(let t=0;t<100;t++){
      const value=t===99-lag?h:0;series.push(value);
      if(t<99)q.update([value]);
    }
    const snap=q.snapshot();x.push(snap[7]);y.push(h);naive.push(series[99-80]);
  }
  assert.ok(Math.abs(correlation(x,y))>.95);
  assert.ok(Math.abs(correlation(naive,y))<.3);
});
check('retrospective candidate uses future only after arrival; holdout significance',()=>{
  const probe=new RetrospectiveProbe({channels:96,width:W,height:H,minimumEvents:16,permutations:199});
  const rng=(seed)=>{let x=seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/2**32;};};
  const random=rng(1337);
  for(let k=0;k<50;k++){
    const t=k*20+100,features=new Float32Array(96*8),h=(k%2===0)?1:-1;
    for(let j=0;j<features.length;j++)features[j]=(random()-.5)*.3;
    features[7*8+6]=h*.7+(random()-.5)*.1;
    const forecast={predicted:new Float32Array(N),variance:new Float32Array(N).fill(.01),familiarity:new Float32Array(N).fill(.9)};
    assert.equal(probe.arm(t,features,forecast,'manual'),true);
    assert.equal(probe.events.length,k); // cannot read future before t+1
    const after=new Float32Array(N);after[15*W+20]=h*.4;
    probe.finish(t+1,after);
  }
  assert.equal(probe.analysis.status,'CANDIDATE');
  assert.ok(probe.analysis.selected.some(x=>x.channel===7&&x.octave===6));
});
check('actual V2.2.1 camera-shaped stream scores forecasts before writing',()=>{
  const p=new P.Predictor({width:W,height:H,adaptive:true});
  let completed=0;
  for(let t=0;t<12;t++){
    const r=p.observe(makeFrame(t));
    if(t>0){completed++;assert.ok(Number.isFinite(r.completed.model));assert.ok(Number.isFinite(r.completed.hold));}
  }
  assert.equal(completed,11);assert.ok(p.memories()>0);
});
console.log('Saved-residue live-lens core checks complete.');
