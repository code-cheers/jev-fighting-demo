import test from 'node:test';
import assert from 'node:assert/strict';
import {RequestGate} from '../lib/request-gate.mjs';
test('requests arriving just before the interval wait rather than fail',async()=>{
 let now=0;const starts=[],waits=[];const gate=new RequestGate({now:()=>now,wait:async ms=>{waits.push(ms);now+=ms;}});
 await gate.run('deepseek',async()=>starts.push(now));now=499;
 await gate.run('deepseek',async()=>starts.push(now));
 assert.deepEqual(starts,[0,500]);assert.deepEqual(waits,[1]);
});
test('one provider cannot overlap, while the other provider remains independent',async()=>{
 const gate=new RequestGate();let release;const first=gate.run('jev',()=>new Promise(resolve=>release=resolve));
 await assert.rejects(gate.run('jev',async()=>assert.fail('must not dispatch')),e=>e.status===429&&e.billingKnownZero);
 assert.equal(await gate.run('deepseek',async()=> 'independent'),'independent');release();await first;
});
test('a failed provider call releases its reservation for a later request',async()=>{
 const gate=new RequestGate({intervalMs:0});await assert.rejects(gate.run('jev',async()=>{throw new Error('network failure');}));
 assert.equal(await gate.run('jev',async()=> 'recovered'),'recovered');
});
