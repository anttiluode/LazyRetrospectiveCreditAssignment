'use strict';
const {DelayedWorld,W,H,C,PERIOD,GATE}=require('./delayed_world.js');
const {FastHead,mse}=require('./fast_head.js');
const {RetrospectiveMiner}=require('./retrospective.js');
function runExperiment({seed=1,signal=true,sigma=.2,polarity=1,holdout=20,quiet=false,
  permutations=999,stopAfterValidation=false,lag=80}={}) {
  const world=new DelayedWorld({seed,signal,sigma,polarity,episodes:90,lag});
  const head=new FastHead(),miner=new RetrospectiveMiner({seed,permutations});
  let audited=0,calibrationEnd=null,testing=null,holdoutResults=[];
  for(let tick=0;tick<90*PERIOD;tick++){
    const obs=world.next(),r=miner.feed(obs.frame,obs.residues,head);
    if(!r)throw Error('Missing stream tick');
    if(miner.finalized&&calibrationEnd===null) {
      calibrationEnd=tick;head.learning=false;
      testing={frame:0,events:0};
      if(stopAfterValidation)break;
    }
    if(testing&&r.alarm&&r.tape&&tick>calibrationEnd){
      const after=miner.predictFromTape(r.tape,obs.frame);
      testing.frame++;
      testing.pending={tick,baseline:Float32Array.from(obs.frame),
        pre:Float32Array.from(head.pending.forecast),post:after?Float32Array.from(after.predicted):null,
        beforeB:head.pending.B,afterB:after?after.conditionalB:null,
        probability:after?after.p:null};
    }
    if(testing&&r.resolved&&testing.pending&&testing.pending.tick===r.resolved.event.tick){
      const p=testing.pending,tgt=r.resolved.actual;
      const baseline=mse(p.baseline,tgt),pre=mse(p.pre,tgt),post=p.post?mse(p.post,tgt):pre;
      holdoutResults.push({baseline,pre,post,preB:p.beforeB,postB:p.afterB,
        gateTick:p.tick,preGain:baseline>1e-12?1-pre/baseline:0,
        postGain:baseline>1e-12?1-post/baseline:0,
        disambiguationGain:pre>1e-12?1-post/pre:0});
      testing.pending=null;testing.events++;
      if(testing.events>=holdout)break;
    }
  }
  const truth=world.auditTruth(),decision=miner.lastReport;
  const avg=k=>holdoutResults.length?holdoutResults.reduce((s,v)=>s+v[k],0)/holdoutResults.length:null;
  const sums={};for(const k of ['baseline','pre','post','preB','postB'])
    sums[k]=holdoutResults.reduce((s,r)=>s+(r[k]??0),0);
  const relative=den=>den>1e-12?1-sums.post/den:null;
  const result={seed,signal,sigma,polarity,trueCue:truth.channel,trueLag:truth.lag,
    decision:decision||{status:'WAIT',reason:'no scored collision'},
    promoted:miner.promoted?.feature||null,naiveGuess:miner.naiveGuess?{channel:miner.naiveGuess.channel,lag:miner.naiveGuess.lag}:null,
    exact:!!(miner.promoted&&signal&&miner.promoted.feature.channel===truth.channel&&miner.promoted.feature.lag===truth.lag),
    falseDiscovery:!!(miner.promoted&&(!signal||miner.promoted.feature.channel!==truth.channel||miner.promoted.feature.lag!==truth.lag)),
    stages:miner.attempts,detectedCollisions:miner.events.length,headAlarms:head.stats.alarms,
    calibrationEnd,learningFrozen:calibrationEnd!==null&&!head.learning,
    heldout:holdoutResults.length,
    preLatchGain:sums.baseline>0?1-sums.pre/sums.baseline:null,
    postLatchGain:relative(sums.baseline),
    ambiguityGain:sums.pre>0?1-sums.post/sums.pre:null,
    preLatchB:avg('preB'),postLatchB:avg('postB'),
    eventRows:quiet?undefined:holdoutResults.map((v)=>({preGain:v.preGain,postGain:v.postGain,
      ambiguityGain:v.disambiguationGain,preB:v.preB,postB:v.postB}))};
  return result;
}
module.exports={runExperiment};
if(require.main===module){const r=runExperiment({seed:1,signal:true,sigma:.2});console.log(JSON.stringify(r,null,2));}
