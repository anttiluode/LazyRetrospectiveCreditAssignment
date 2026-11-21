'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {DelayedWorld,GATE,LAG,C,PERIOD}=require('../delayed_world.js');
const {FastHead}=require('../fast_head.js');
const {RetrospectiveMiner,Ring,Welford}=require('../retrospective.js');
const {runExperiment}=require('../experiment.js');
const ROOT=path.resolve(__dirname,'..');
const SEEDS=Array.from({length:20},(_,i)=>2001+i); // held-out, no threshold tuning
const options={permutations:999,quiet:true};
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS:',name);}
function avg(rows,k){return rows.reduce((s,r)=>s+(r[k]||0),0)/rows.length;}
const evaluate=(name,signal,sigma,polarity=1)=>{
  const rows=[];console.time(name);
  for(const seed of SEEDS)rows.push(runExperiment({seed,signal,sigma,polarity,...options}));
  console.timeEnd(name);return rows;
};
function signature(r){return {seed:r.seed,status:r.decision.status,at:r.decision.count,
  selected:r.promoted,actual:{channel:r.trueCue,lag:r.trueLag},
  exact:r.exact,falseDiscovery:r.falseDiscovery,naiveGuess:r.naiveGuess,heldout:r.heldout,
  preLatchGain:r.preLatchGain,postLatchGain:r.postLatchGain,
  ambiguityGain:r.ambiguityGain,preLatchB:r.preLatchB,postLatchB:r.postLatchB,
  stages:r.stages.map(s=>({at:s.count,status:s.status,feature:s.feature,
    heldoutP:s.heldoutP,candidates:s.candidates.map(c=>({channel:c.channel,lag:c.lag,p:c.heldoutP}))}))};}
function main(){
  test('ring is strictly past-only and lag 80 points 80 ticks back',()=>{
    const ring=new Ring();const row=new Float32Array(C);
    for(let t=0;t<100;t++){row[0]=t;ring.push(row);}
    const a=ring.snapshot();assert.equal(a[(80-1)*C],20); // current tick = 100: R(t-80) is tick 20
    row[0]=999;ring.push(row);assert.equal(a[(80-1)*C],20);
    assert.equal(ring.previous(1)[0],999);
  });
  test('world masks its hidden bit until after the gate',()=>{
    const w=new DelayedWorld({seed:41,episodes:20});let current=[],event=[];
    for(let t=0;t<20*PERIOD;t++){const v=w.next();if(t%PERIOD===GATE)current.push(v.frame);
      if(t%PERIOD===GATE+1)event.push(v.frame);}
    for(let i=1;i<20;i++)assert.deepEqual(Array.from(current[0]),Array.from(current[i]));
    const truth=w.auditTruth().hidden;
    assert.ok(new Set(truth).size>1);
    for(let i=1;i<20;i++)if(truth[i]!==truth[0])assert.notDeepEqual(Array.from(event[i]),Array.from(event[0]));
    const v=new DelayedWorld({seed:41}).next();assert.deepEqual(Object.keys(v).sort(),['frame','residues']);
  });
  test('fast head reports real post-history B collision without knowing gate time',()=>{
    const w=new DelayedWorld({seed:12,episodes:9}),h=new FastHead();let t=0,alarms=[];
    while(true){const a=w.next();if(!a)break;const r=h.observe(a.frame);
      if(r.alarm)alarms.push({t,B:r.B,confidence:r.confidence});t++;}
    assert.ok(alarms.length>=2,'Need several colliding future memories');
    assert.ok(alarms.every(a=>a.t%100===90),JSON.stringify(alarms));
    assert.ok(alarms.every(a=>a.B>.001&&a.confidence>.65));
  });
  test('future intervention cannot change earlier prediction or archive',()=>{
    const one=new DelayedWorld({seed:78,episodes:2}),two=new DelayedWorld({seed:78,episodes:2});
    const a=new FastHead(),b=new FastHead(),ra=new Ring(),rb=new Ring();
    let beforeA,beforeB,archiveA,archiveB;
    for(let t=0;t<180;t++){
      const o=one.next(),p=two.next();
      if(t>=91&&t<100)p.frame.fill(.99); // intervene only AFTER first gate
      const x=a.observe(o.frame),y=b.observe(p.frame);
      if(t===90){beforeA=x.forecast;beforeB=y.forecast;archiveA=ra.previous(80);archiveB=rb.previous(80);}
      ra.push(o.residues);rb.push(p.residues);
    }
    assert.deepEqual(Array.from(beforeA),Array.from(beforeB));
    assert.deepEqual(Array.from(archiveA),Array.from(archiveB));
  });
  test('baseline Welford subtracts stationary DC level without zero-variance blow-up',()=>{
    const s=new Welford(),row=new Float32Array(C).fill(2);
    for(let i=0;i<100;i++)s.add(row);
    const st=s.snapshot();assert.ok(Math.abs(st.mu[3]-2)<1e-10);assert.equal(st.variance[3],0);
  });
  const nullRows=evaluate('NULL 20 seeds (32+48 look)',false,.2);
  test('NULL: the 6400-feature naive max always guesses, guarded miner mostly WAIT',()=>{
    assert.ok(nullRows.filter(r=>!r.promoted).length>=18,
      'Null promotions '+nullRows.filter(r=>r.promoted).length);
    assert.ok(nullRows.every(r=>r.heldout===20));
    assert.equal(nullRows.filter(r=>r.naiveGuess).length,20);
  });
  const sparse=evaluate('SPARSE 20 seeds',true,.2);
  test('SPARSE: >=18/20 exact 80-tick cue, zero unrelated promotions',()=>{
    assert.ok(sparse.filter(r=>r.exact).length>=18);
    assert.ok(sparse.every(r=>!r.falseDiscovery));
    assert.ok(avg(sparse,'ambiguityGain')>.85);
  });
  const noisy=evaluate('NOISY 20 seeds',true,.7);
  test('NOISY: >=18/20 exact by 48 recurring collisions, zero unrelated promotions',()=>{
    assert.ok(noisy.filter(r=>r.exact).length>=18,
      JSON.stringify(noisy.filter(r=>!r.exact).map(r=>({seed:r.seed,stage:r.decision}))));
    assert.ok(noisy.every(r=>!r.falseDiscovery));
    assert.ok(avg(noisy,'ambiguityGain')>.55);
  });
  const reversed=evaluate('POLARITY REVERSED 20 seeds',true,.2,-1);
  test('HEAD sign inversion: same cue/lag, no polarity assumption',()=>{
    assert.ok(reversed.filter(r=>r.exact).length>=18);
    for(let i=0;i<SEEDS.length;i++){
      assert.equal(reversed[i].trueCue,sparse[i].trueCue);
      assert.equal(reversed[i].promoted?.channel,sparse[i].promoted?.channel);
      assert.equal(reversed[i].promoted?.lag,sparse[i].promoted?.lag);
    }
  });
  test('another cue lag 60 is found without changing the miner search',()=>{
    const s=runExperiment({seed:3233,signal:true,sigma:.2,lag:60,...options});
    assert.ok(s.exact,JSON.stringify(s.decision));
    assert.equal(s.promoted.lag,60);
  });
  test('no unsupported perfect-noise claim: ambiguous-vs-hold-last reported separately',()=>{
    assert.ok(noisy.every(r=>r.postLatchGain>=r.preLatchGain-.6));
    assert.ok(noisy.every(r=>r.preLatchB>=0));
    assert.ok(sparse.every(r=>r.learningFrozen));
  });
  const summary={created:new Date().toISOString(),revision:'Saved-residue retrospective credit; two-look preregistered alpha spending',
    seeds:SEEDS,counts:{features:6400,channels:64,lagTicks:80,period:100,lookEpisodes:[32,48],
      discovery:[20,32],validation:[12,16],alphaSpending:[.02,.03],permutations:999,
      evaluationEpisodes:20},
    caveats:['Not Model-X knockoffs. Episode permutations plus independent confirm; exchangeability assumed.',
      'Reconstruction/predictive memory is not proof of intervention-level causality.',
      'No generic 80% ceiling should be claimed for Gaussian sigma=0.7 hidden cue.',
      'Cold tape is lossless/uncompressed, not automatically sparse or storage-efficient.',
      'FastHead is a compact causal shape/motion memory probe, NOT the full V2.2.1 48x36 engine.'],
    checks,metrics:{},perSeed:{}};
  for(const [name,rows] of Object.entries({null:nullRows,sparse,noisy,reversed})){
    summary.metrics[name]={promoted:rows.filter(r=>r.promoted).length,
      exact:rows.filter(r=>r.exact).length,falseDiscoveries:rows.filter(r=>r.falseDiscovery).length,
      meanPreLatchGain:avg(rows,'preLatchGain'),meanPostLatchGain:avg(rows,'postLatchGain'),
      meanAmbiguityGain:avg(rows,'ambiguityGain'),meanPreB:avg(rows,'preLatchB'),
      meanPostB:avg(rows,'postLatchB'),
      meanLook:avg(rows,'calibrationEnd')};
    summary.perSeed[name]=rows.map(signature);
  }
  const target=path.join(ROOT,'results','delayed_cue.json');
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(summary,null,2)+'\n');
  console.log('\nRESULTS\n'+JSON.stringify(summary.metrics,null,2));
  console.log('Saved',target,'Checks:',checks);
}
try{main();}catch(e){console.error('FAIL',e.stack);process.exitCode=1;}
