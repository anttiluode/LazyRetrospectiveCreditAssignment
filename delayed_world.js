'use strict';
/* Deterministic streaming world. The observer receives ONLY {frame,residues}.
   Audit truth is a separate method for the test harness, never passed to the
   head or retrospective miner. Nothing in the miner knows episode boundaries. */
const W=24,H=18,C=64,PERIOD=100,GATE=90,LAG=80;
function rng(seed){let s=(seed>>>0)||0x9e3779b9;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};}
function normal(r){let spare=null;return ()=>{if(spare!==null){let z=spare;spare=null;return z;}let u=Math.max(1e-12,r()),v=r();let m=Math.sqrt(-2*Math.log(u));spare=m*Math.sin(2*Math.PI*v);return m*Math.cos(2*Math.PI*v);};}
function shuffle(a,r){for(let i=a.length-1;i>0;i--){let j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const types=['cue',...Array(20).fill('white'),...Array(10).fill('dc'),...Array(15).fill('ar'),...Array(10).fill('phase'),...Array(8).fill('burst')];
class DelayedWorld {
  constructor({seed=1,signal=true,sigma=.2,polarity=1,episodes=60,lag=LAG}={}){
    const r=rng((seed*2654435761)>>>0);this.r=r;this.gauss=normal(r);
    this.types=shuffle(types.slice(),r);this.cue=this.types.indexOf('cue');
    this.signal=signal;this.sigma=sigma;this.polarity=polarity;this.lag=lag;
    this.episodes=episodes;this.tick=0;this.hidden=[];
    this.ar=new Float64Array(C);this.phase=new Int8Array(C);
    this.burstEpisode=new Int16Array(C);this.burstTick=new Int16Array(C);
    for(let c=0;c<C;c++){this.burstEpisode[c]=Math.floor(r()*episodes);this.burstTick[c]=Math.floor(r()*PERIOD);}
  }
  next(){if(this.tick>=this.episodes*PERIOD)return null;
    const episode=Math.floor(this.tick/PERIOD),phase=this.tick%PERIOD;
    if(phase===0){this.hidden.push(this.r()<.5?-1:1);for(let c=0;c<C;c++)if(this.types[c]==='phase')this.phase[c]=this.r()<.5?-1:1;}
    const h=this.hidden[episode];const residues=new Float32Array(C);
    for(let c=0;c<C;c++){
      const z=this.gauss();let v=0;
      switch(this.types[c]){
        case 'cue':v=this.sigma*z+(this.signal&&phase===GATE-this.lag?this.polarity*h:0);break; // tick 10 when lag=80, gate=90
        case 'white':v=z;break;
        case 'dc':v=2+.05*z;break;
        case 'ar':v=this.ar[c]=.96*this.ar[c]+Math.sqrt(1-.96*.96)*z;break;
        case 'phase':v=this.sigma*z+(phase===GATE-this.lag?this.phase[c]:0);break;
        case 'burst':v=z*.0001+((this.burstEpisode[c]===episode&&this.burstTick[c]===phase)?5:0);break;
      }
      residues[c]=v;
    }
    const frame=this.render(phase,h);this.tick++;return {frame,residues};
  }
  render(t,h){const frame=new Float32Array(W*H);frame.fill(.02);
    const x=t<=GATE?3+15*t/GATE:19+Math.min(t-GATE,6)*.3;
    const y=t<=GATE?9:9+(h===1?-3:3);
    for(let yy=0;yy<H;yy++)for(let xx=0;xx<W;xx++){
      const d=(xx-x)**2+(yy-y)**2;
      frame[yy*W+xx]+=.92*Math.exp(-d/(2*1.05*1.05));
    }
    // Reproducible, outcome-independent phase texture makes ordinary
    // approached states unambiguous. The gate remains ambiguous by design.
    // The hidden cue is *not* represented anywhere in the frame at t<=90.
    const phaseMarker=t;
    for(let b=0;b<7;b++)frame[1*W+(b+1)]=(phaseMarker&(1<<b))?.24:.02;
    return frame;
  }
  auditTruth(){return {channel:this.cue,lag:this.lag,polarity:this.polarity,hidden:this.hidden.slice(),signal:this.signal,sigma:this.sigma};}
}
module.exports={DelayedWorld,W,H,C,PERIOD,GATE,LAG,rng,normal,shuffle};
