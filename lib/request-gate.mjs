import {setTimeout as delay} from 'node:timers/promises';
// Reserve a slot before waiting so each provider has at most one request in flight.
export class RequestGate {
  constructor({intervalMs=500,now=()=>performance.now(),wait=delay}={}) {this.intervalMs=intervalMs;this.now=now;this.wait=wait;this.busy=new Set();this.last=new Map();}
  async run(provider,work){
    if(this.busy.has(provider)){const e=new Error('同一模型已有请求在处理，请稍后继续');e.status=429;e.billingKnownZero=true;throw e;}
    this.busy.add(provider);
    try {
      let remaining;
      while((remaining=this.intervalMs-(this.now()-(this.last.get(provider)??-Infinity)))>0)await this.wait(remaining);
      this.last.set(provider,this.now());
      return await work();
    }finally{this.busy.delete(provider);}
  }
}
