import test from 'node:test';
import assert from 'node:assert/strict';
import {compareMatch} from '../public/comparison.js';
const stats=(latencies,usd,calls=latencies.length,unknownCost=0)=>({latencies,usd,calls,unknownCost});
test('speed uses median, and savings use the more expensive baseline',()=>{
 const c=compareMatch({jev:stats([400,500,10000],.001),deepseek:stats([800,1000,1200],.004)});
 assert.equal(c.speed.winner,'jev');assert.equal(c.speed.difference,500);assert.equal(c.speed.percent,50);
 assert.equal(c.cost.winner,'jev');assert.equal(c.cost.percent,75);assert.equal(c.cost.difference,.003);
});
test('the speed winner and the cost winner can differ',()=>{
 const c=compareMatch({jev:stats([900],.001),deepseek:stats([300],.003)});
 assert.equal(c.speed.winner,'deepseek');assert.equal(c.cost.winner,'jev');
});
test('ties including zero costs have a finite percentage',()=>{
 const c=compareMatch({jev:stats([500],0),deepseek:stats([500],0)});
 assert.equal(c.speed.status,'tie');assert.equal(c.cost.status,'tie');assert.equal(c.cost.percent,0);
});
test('missing responses or unknown charges cannot produce a winner',()=>{
 const c=compareMatch({jev:stats([],0,1,1),deepseek:stats([500],.002)});
 assert.equal(c.speed.status,'unavailable');assert.equal(c.cost.status,'unavailable');
 const empty=compareMatch({jev:stats([],0),deepseek:stats([],0)});
 assert.equal(empty.cost.status,'unavailable');
});
test('late responses update the comparison rather than locking initial verdict',()=>{
 const s={jev:stats([300],.001),deepseek:stats([],.0001,1)};
 assert.equal(compareMatch(s).speed.status,'unavailable');s.deepseek.latencies.push(200);
 assert.equal(compareMatch(s).speed.winner,'deepseek');
});
