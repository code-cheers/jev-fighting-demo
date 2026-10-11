import {decide} from '../server.mjs';
import {Arena} from '../public/engine.js';
const g=new Arena(['jev','deepseek']);g.fighters[0].x=440;g.fighters[1].x=515;g.act(1,'punch');
const results=await Promise.allSettled(['jev','deepseek'].map(async provider=>{const r=await decide(provider,g.observe(0));return {provider,model:r.model,action:r.action,invalid:r.invalid,latencyMs:r.latencyMs,usage:r.usage};}));
for(const result of results)console.log(JSON.stringify(result.status==='fulfilled'?result.value:{ok:false,error:result.reason.message}));
if(results.some(r=>r.status==='rejected'||r.value.invalid))process.exitCode=1;
process.exit(process.exitCode || 0);
