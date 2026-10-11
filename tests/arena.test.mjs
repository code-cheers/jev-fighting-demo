import test from 'node:test';
import assert from 'node:assert/strict';
import {Arena} from '../public/engine.js';
import {validateState,normalizeAction,priceFor} from '../lib/decisions.mjs';
test('a delayed defensive choice cannot undo damage already applied',()=>{
  const g=new Arena(['human','jev']);g.fighters[0].x=440;g.fighters[1].x=515;
  assert.equal(g.act(0,'punch'),true);g.step(245);assert.equal(g.fighters[1].hp,91);
  assert.equal(g.act(1,'block'),false);g.step(200);assert.equal(g.act(1,'block'),true);assert.equal(g.fighters[1].hp,91);
});
test('same timely guard reduces damage for either side',()=>{
  for(const attacker of [0,1]){const g=new Arena(['jev','deepseek']);g.fighters[0].x=440;g.fighters[1].x=515;g.act(1-attacker,'block');g.act(attacker,'punch');g.step(245);assert.equal(g.fighters[1-attacker].hp,98);}
});
test('simultaneous punches trade damage without a left-side priority',()=>{const g=new Arena(['jev','deepseek']);g.fighters[0].x=440;g.fighters[1].x=515;g.act(0,'punch');g.act(1,'punch');g.step(245);assert.deepEqual(g.fighters.map(f=>f.hp),[91,91]);});
test('cooldown prohibits consecutive projectile actions',()=>{const g=new Arena(['jev','deepseek']);g.act(0,'special');g.step(810);assert.equal(g.act(0,'special'),false);assert.ok(!g.observe(0).legal_actions.includes('special'));g.step(1000);assert.equal(g.act(0,'special'),true);});
test('game ends at the shared time limit',()=>{const g=new Arena(['jev','deepseek']);g.step(45001);assert.equal(g.finished,true);assert.equal(g.winner,'draw');assert.equal(g.act(0,'punch'),false);});
test('model outputs must be valid and currently available',()=>{assert.throws(()=>normalizeAction('deepseek',{choices:[{message:{content:'{"action":"teleport"}'}}]},['wait']));assert.throws(()=>normalizeAction('jev',{answers:{action:{choice:'special'}}},['wait']));assert.equal(normalizeAction('jev',{answers:{action:{choice:'wait'}}},['wait']),'wait');});
test('state rejects unbounded data before sending a paid request',()=>{const s=new Arena(['jev','deepseek']).observe(0);assert.equal(validateState(s),s);s.self.hp=1000;assert.throws(()=>validateState(s));});
test('billing estimates account for caching and weekend rates',()=>{const d=new Date('2026-10-11T12:00:00Z');assert.equal(priceFor('jev',{input_tokens:1000,output_tokens:50},d).usd,.000042);assert.equal(priceFor('deepseek',{prompt_tokens:1000,completion_tokens:10,prompt_cache_hit_tokens:1000},d).usd,.000009);assert.equal(priceFor('jev',{},d).usd,null);});
