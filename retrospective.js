'use strict';
/* Retrospective memory miner. Separate from the world; sees no episode ID,
   hidden state, hidden cue coordinates or future labels.
   Statistical correction: discovery on prior collisions, validation on
   independent subsequent collisions, single-look permutation p-values and
   Bonferroni over four preselected candidates. Not Model-X knockoffs. */
const {rng,shuffle}=require('./delayed_world.js');
const CHANNELS=64,LENGTH=100,FEATURES=CHANNELS*LENGTH;
class Welford {
  constructor(channels=CHANNELS){this.channels=channels;this.n=0;this.mu=new Float64Array(channels);this.M2=new Float64Array(channels);}
  add(v){this.n++;for(let c=0;c<this.channels;c++){const d=v[c]-this.mu[c];this.mu[c]+=d/this.n;this.M2[c]+=d*(v[c]-this.mu[c]);}}
  snapshot(){return {n:this.n,mu:Array.from(this.mu),variance:Array.from(this.M2,x=>this.n>1?x/(this.n-1):0)};}
}
class Ring {
  constructor(length=LENGTH,channels=CHANNELS){this.len=length;this.channels=channels;this.rows=new Array(length);this.t=0;}
  push(row){this.rows[this.t%this.len]=Float32Array.from(row);this.t++;}
  previous(lag){if(lag<1||lag>Math.min(this.t,this.len))return null;return this.rows[(this.t-lag)%this.len];}
  snapshot(){if(this.t<this.len)return null;const out=new Float32Array(this.len*this.channels);
    // index [lag-1,channel] where lag 1 is the last completed tick
    for(let lag=1;lag<=this.len;lag++)out.set(this.previous(lag),(lag-1)*this.channels);
    return out;
  }
}
function mean(x){return x.reduce((a,b)=>a+b,0)/x.length;}
function signedOutcomes(events){const ys=events.map(e=>e.outcome),mu=mean(ys);
  const sd=Math.sqrt(Math.max(1e-10,mean(ys.map(v=>(v-mu)**2))));return ys.map(v=>(v-mu)/sd);
}
function pearsonXZ(events,indices,y,base){
  const n=events.length, out=new Float64Array(FEATURES),yMean=mean(y);
  for(let k=0;k<n;k++){
    const tape=events[indices[k]].tape,yy=y[k]-yMean;
    for(let lag=1;lag<=LENGTH;lag++){
      const offset=(lag-1)*CHANNELS;
      for(let c=0;c<CHANNELS;c++){
        const j=c*LENGTH+(lag-1),sigma=Math.sqrt(base.variance[c]+.01);
        const z=Math.max(-8,Math.min(8,(tape[offset+c]-base.mu[c])/sigma));
        out[j]+=z*yy;
      }
    }
  }
  for(let j=0;j<FEATURES;j++)out[j]=Math.pow(out[j]/n,2);
  return out;
}
function rankCandidates(scores,k=4){let order=Array.from({length:scores.length},(_,i)=>i);
  order.sort((a,b)=>scores[b]-scores[a]);const result=[];const used=new Set();
  for(const j of order){const c=Math.floor(j/LENGTH);
    if(used.has(c))continue;used.add(c);result.push({j,channel:c,lag:j%LENGTH+1,score:scores[j]});
    if(result.length===k)break;
  }return result;
}
function scalarZ(event,channel,lag,base){const x=event.tape[(lag-1)*CHANNELS+channel];
  return Math.max(-8,Math.min(8,(x-base.mu[channel])/Math.sqrt(base.variance[channel]+.01)));
}
function validate(events,feature,base,{permutations=999,seed=1234}={}){
  const y=signedOutcomes(events),z=events.map(e=>scalarZ(e,feature.channel,feature.lag,base));
  const n=y.length,ym=mean(y),zm=mean(z),zz=z.map(v=>v-zm),yy=y.map(v=>v-ym);
  const dot=a=>a.reduce((s,v,i)=>s+v*yy[i],0);
  const obs=Math.abs(dot(zz)),r=rng(seed),indices=Array.from({length:n},(_,i)=>i);
  let exceed=0;
  for(let p=0;p<permutations;p++){
    shuffle(indices,r);let d=0;for(let k=0;k<n;k++)d+=zz[k]*yy[indices[k]];
    if(Math.abs(d)>=obs-1e-10)exceed++;
  }
  return {p:(exceed+1)/(permutations+1),observed:obs,exceed,permutations,meanZ:zm};
}
class RetrospectiveMiner {
  constructor({channels=CHANNELS,length=LENGTH,topK=4,permutations=999,seed=1,
    schedule=[{count:32,discovery:20,alpha:.02},{count:48,discovery:32,alpha:.03}]}={}){
    // Two PRE-REGISTERED looks, disjoint selection/validation within each.
    // Alpha spending (.02 + .03 = .05) limits multiple-look testing under
    // independent, exchangeable episode outcomes in this synthetic world.
    Object.assign(this,{channels,length,topK,permutations,seed,schedule});
    this.base=new Welford(channels);this.ring=new Ring(length,channels);
    this.events=[];this.pending=new Map();this.axis=null;this.promoted=null;this.attempts=[];
    this.log=[];this.fast=null;this.trace=[];this.lastReport=null;this.finalized=false;
    this.naiveGuess=null;
  }
  feed(frame,residues,head){
    const h=head.observe(frame);
    if(h.resolved){const r=h.resolved,event=this.pending.get(r.event.tick);
      if(event){
        if(!this.axis){const norm=Math.sqrt(r.error.reduce((s,v)=>s+v*v,0));
          this.axis=Float32Array.from(r.error,v=>v/Math.max(norm,1e-8));}
        event.outcome=r.error.reduce((s,v,i)=>s+v*this.axis[i],0);
        event.actual=Array.from(r.actual);event.before=Array.from(r.previous);
        event.baseline=Array.from(r.forecast);event.B=r.rawB;
        this.events.push(event);this.pending.delete(r.event.tick);
        if(this.events.length===20){
          const obs=this.events.slice(),y=signedOutcomes(obs),b=this.base.snapshot();
          const scores=pearsonXZ(obs,obs.map((_,i)=>i),y,b);
          this.naiveGuess=rankCandidates(scores,1)[0];
        }
        const stage=this.schedule.find(stage=>stage.count===this.events.length);
        if(stage&&!this.finalized){this.lastReport=this.mine(stage);
          if(this.promoted||stage===this.schedule[this.schedule.length-1])this.finalized=true;
        }
      }
    }
    // The current tick is NOT on the tape that a new alarm can inspect.
    let alarmTape=null;
    if(h.alarm){const tape=this.ring.snapshot();alarmTape=tape;
      if(tape){this.pending.set(h.alarm.tick,{tick:h.alarm.tick,tape,localB:h.B,confidence:h.confidence});}
    }
    this.base.add(residues);this.ring.push(residues);
    return {alarm:h.alarm,resolved:h.resolved,tape:alarmTape,report:this.lastReport};
  }
  mine(stage=this.schedule.find(s=>s.count===this.events.length)){
    const n=this.events.length;
    if(!stage||n<stage.count)return {status:'WAIT',reason:'insufficient independent collision episodes',count:n};
    if(this.promoted)return {status:'LATCHED',feature:this.promoted.feature};
    const train=this.events.slice(0,stage.discovery),hold=this.events.slice(stage.discovery,stage.count);
    const base=this.base.snapshot(); // Only past/current observations, no future leakage.
    const y=signedOutcomes(train),indices=Array.from({length:train.length},(_,i)=>i);
    const scored=pearsonXZ(train,indices,y,base);
    const candidates=rankCandidates(scored,this.topK);
    const decisions=candidates.map((candidate,i)=>({...candidate,
      validation:validate(hold,candidate,base,{permutations:this.permutations,
        seed:(this.seed*1009+i*271828)>>>0})}));
    const winners=decisions.filter(x=>x.validation.p<=stage.alpha/this.topK);
    const win=winners.sort((a,b)=>b.score-a.score)[0];
    const result={status:win?'PROMOTE':'WAIT',count:n,alpha:stage.alpha,permutations:this.permutations,
      discoveryCount:train.length,validationCount:hold.length,
      method:'disjoint selection and collision-aligned held-out permutation validation; Bonferroni topK; NOT model-X knockoffs',
      candidates:decisions.map(x=>({channel:x.channel,lag:x.lag,trainingScore:x.score,
        heldoutP:x.validation.p}))};
    if(win){const feature={channel:win.channel,lag:win.lag};this.promoted={feature,
      sourceCount:n,base,learned:this.fitLatch(feature,base),validationP:win.validation.p};
      result.feature=feature;result.heldoutP=win.validation.p;
    }
    this.attempts.push(result);return result;
  }
  fitLatch(feature,base){
    const xs=[],ys=[],deltas=[];
    for(const e of this.events){xs.push(scalarZ(e,feature.channel,feature.lag,base));ys.push(e.outcome);
      deltas.push(e.actual.map((v,i)=>v-e.before[i]));}
    const positive=[],negative=[];
    for(let k=0;k<ys.length;k++)(ys[k]>=0?positive:negative).push(k);
    const avg=(inds,values)=>mean(inds.map(i=>values[i]));
    const zPositive=avg(positive,xs),zNegative=avg(negative,xs);
    const meanFuture=(inds)=>deltas[0].map((_,i)=>mean(inds.map(k=>deltas[k][i])));
    const pos=meanFuture(positive),neg=meanFuture(negative);
    const err=[];for(const inds of [positive,negative]){
      const m=avg(inds,xs);for(const i of inds)err.push((xs[i]-m)**2);
    }
    const variance=Math.max(.01,mean(err));
    return {zPositive,zNegative,variance,pos,neg,nPositive:positive.length,nNegative:negative.length};
  }
  /** Only the chosen channel is needed at inference. A 100-tick history was
      used to discover its lag; this online read is precisely the 'latch'. */
  predictFromTape(tape,anchor){if(!this.promoted)return null;
    const {feature,base,learned}=this.promoted;
    const z=scalarZ({tape},feature.channel,feature.lag,base);
    const llr=(learned.zPositive-learned.zNegative)*(z-(learned.zPositive+learned.zNegative)/2)/learned.variance;
    const p=1/(1+Math.exp(-Math.max(-20,Math.min(20,llr))));
    const predicted=learned.pos.map((v,i)=>anchor[i]+p*v+(1-p)*learned.neg[i]);
    const D=learned.pos.map((v,i)=>v-learned.neg[i]);
    const conditionalB=p*(1-p)*mean(D.map(v=>v*v));
    return {predicted,p,conditionalB,z};
  }
}
module.exports={RetrospectiveMiner,Ring,Welford,signedOutcomes,rankCandidates,validate,scalarZ,CHANNELS,LENGTH,FEATURES};
