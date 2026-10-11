import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Exercise the production event handler with foreground/background transitions.
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=source.indexOf('function handleVisibility()');
const handler=source.slice(start,source.indexOf("document.addEventListener('visibilitychange'",start));
function page(overrides={}){
 const stage={textContent:'ROUND 01 / LIVE'};
 const context={match:{done:false,epoch:0},paused:false,pauseReason:'',document:{hidden:false},$:()=>stage,setButtons(){},notice(){},...overrides};
 vm.createContext(context);vm.runInContext(handler,context);return {context,stage};
}
test('background pauses requests and foreground resumes the same match',()=>{
 const {context:c,stage}=page();const match=c.match;c.document.hidden=true;c.handleVisibility();
 assert.equal(c.paused,true);assert.equal(match.epoch,1);
 c.document.hidden=false;c.handleVisibility();
 assert.equal(c.paused,false);assert.equal(c.pauseReason,'');assert.equal(c.match,match);assert.equal(match.epoch,2);assert.equal(stage.textContent,'ROUND 01 / LIVE');
});
test('manual or API-error pause is preserved through tab switching',()=>{
 for(const reason of ['手动暂停','调用错误：无法连接模型服务']){
  const {context:c}=page({paused:true,pauseReason:reason});
  c.document.hidden=true;c.handleVisibility();c.document.hidden=false;c.handleVisibility();
  assert.equal(c.paused,true);assert.equal(c.pauseReason,reason);assert.equal(c.match.epoch,0);
 }
});
test('finished and absent matches never resume when returning to the page',()=>{
 for(const match of [null,{done:true,epoch:0}]){
  const {context:c}=page({match,paused:true,pauseReason:'后台暂停，返回页面自动继续'});c.handleVisibility();assert.equal(c.paused,true);
 }
});
