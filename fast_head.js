'use strict';
/* Causal associative next-frame table: uses no hidden labels and no clock.
   All gates are detected from repeated observable shape+motion keys having
   multiple possible successors; no explicit gate coordinate is consulted. */
function address(frame,previous){let s='';for(let i=0;i<frame.length;i++){
  const a=Math.round(frame[i]*100),m=previous?Math.round((frame[i]-previous[i])*100):0;
  if(a!==2||m!==0)s+=i+':'+a+':'+m+';';
}return s;}
function mse(a,b){let s=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d;}return s/a.length;}
class FastHead {
  constructor({minMatches=4,threshold=.001,debounce=20}={}){
    Object.assign(this,{minMatches,threshold,debounce});this.bank=new Map();this.previous=null;this.pending=null;this.t=0;this.lastAlarm=-1e6;
    this.learning=true;this.stats={alarms:0,completed:0,preError:0,baselineError:0};
  }
  observe(frame){
    const now=Float32Array.from(frame);let resolved=null;
    if(this.pending){
      const p=this.pending;
      if(p.alarm)resolved={event:p.alarm,actual:now,forecast:p.forecast,error:now.map((v,i)=>v-p.forecast[i]),
        previous:p.frame,rawB:p.B};
      let entry=this.bank.get(p.key);
      if(this.learning){
        if(!entry){entry={count:0,sum:new Float64Array(now.length),sumSq:new Float64Array(now.length)};this.bank.set(p.key,entry);}
        entry.count++;for(let i=0;i<now.length;i++){entry.sum[i]+=now[i];entry.sumSq[i]+=now[i]*now[i];}
      }
      this.stats.completed++;this.stats.preError+=mse(p.forecast,now);this.stats.baselineError+=mse(p.frame,now);
    }
    const key=address(now,this.previous),entry=this.bank.get(key);
    const forecast=Float32Array.from(now);
    let B=0,confidence=0;
    if(entry){confidence=1-Math.exp(-entry.count/2);
      for(let i=0;i<forecast.length;i++){
        const mean=entry.sum[i]/entry.count;
        forecast[i]=mean;
        B+=Math.max(0,entry.sumSq[i]/entry.count-mean*mean);
      }
      B/=forecast.length;
    }
    let alarm=null;
    if(entry&&entry.count>=this.minMatches&&confidence>=.65&&B>=this.threshold&&this.t-this.lastAlarm>=this.debounce){
      alarm={tick:this.t,B,confidence,key,count:entry.count};this.lastAlarm=this.t;this.stats.alarms++;
    }
    this.pending={key,frame:now,forecast,B,alarm};this.previous=now;this.t++;
    return {alarm,resolved,forecast,B,confidence,key};
  }
}
module.exports={FastHead,address,mse};
