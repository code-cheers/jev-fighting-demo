import {median,compareMatch} from './comparison.js';
import {Arena,LABELS,RULES} from './engine.js';
import {loadSprites,drawStage,drawSprite,characterNames} from './sprites.js';
const $=id=>document.getElementById(id),canvas=$('arena'),ctx=canvas.getContext('2d');
const names={jev:'JEV',deepseek:'DEEPSEEK'};
const mode='jev-deepseek',providers=['jev','deepseek'];
let assetsReady=false;
let config,game=new Arena(providers),match=null,paused=true,starting=false,benchmarkBusy=false,sound=true,audio,swapped=false,pauseReason='';
const controllers=()=>swapped?[...providers].reverse():providers;
const reports=[],benchmarks=[];
function stats(){return {calls:0,errors:0,discarded:0,executed:0,latencies:[],apiLatencies:[],usd:0,unknownCost:0,latest:null,model:null};}
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
async function post(route,data){const r=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Token':config.token},body:JSON.stringify(data)});let result;try{result=await r.json();}catch{throw new Error('本地服务返回无效响应');}if(!r.ok){const e=new Error(result.error||'请求失败');e.billingKnownZero=!!result.billingKnownZero;throw e;}return result;}
function tone(type){if(!sound||!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.type=type==='hit'?'sawtooth':'sine';o.frequency.setValueAtTime(type==='hit'?160:520,audio.currentTime);o.frequency.exponentialRampToValueAtTime(45,audio.currentTime+.09);g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.11);o.start();o.stop(audio.currentTime+.12);}
function event(e){if(e.type==='hit')tone('hit');if(e.type==='action'&&['punch','kick','special'].includes(e.action))tone('action');if(e.type==='finish')finish('正常结束');}
function resetDisplay(){$('comparisonLabel').textContent='LIVE COMPARISON';$('comparisonPanel').classList.remove('completed');$('matchComparison').hidden=true;for(const p of ['jev','deepseek'])updateMetrics(p,stats());$('trace').replaceChildren();$('requestCount').textContent='0 / 120 次';}
function readyOverlay(){$('overlay').classList.remove('hidden','complete');$('overlay').querySelector('h2').textContent='决策，就是下一招。';$('overlay').querySelector('.overlay-tag').textContent='READY / ROUND 01';$('overlayText').textContent='两个模型自主选择动作，开始真实 API 对战。';$('startOverlay').textContent='开始对局 ↗';$('stageStatus').textContent='READY TO FIGHT';}
async function start(){
  if(starting||benchmarkBusy||!config||!assetsReady)return;
  if(match&&!match.done&&!game.finished){notice('请先结束当前对局');return;}
  starting=true;setButtons();
  try{
    const providers=controllers();
    if(providers.some(p=>!config.configured[p]))throw new Error('本地服务尚未配置所选模型密钥');
    const session=await post('/api/session',{});
    game=new Arena(providers,event);paused=false;pauseReason='';
    match={session:session.session,mode,controllers:providers,epoch:0,startedAt:new Date().toISOString(),stats:{jev:stats(),deepseek:stats()},busy:[false,false],next:[0,0],entries:[],done:false,record:null,requests:0,deadline:Number($('deadline').value)};
    if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();
    resetDisplay();$('overlay').classList.remove('complete');$('overlay').classList.add('hidden');$('stageStatus').textContent='ROUND 01 / LIVE';
    notice('真实 API 对战进行中。暂停或结束后不再发起新请求；已发出的请求仍可能计费。');
  }catch(e){notice(e.message,true);}finally{starting=false;setButtons();}
}
function setButtons(){
  const active=match&&!match.done;
  $('start').disabled=!assetsReady||starting||benchmarkBusy||!!active;
  $('startOverlay').disabled=!assetsReady||starting||benchmarkBusy;
  $('pause').disabled=!active||starting;
  $('stop').disabled=!active||starting;
  $('pause').textContent=paused?'继续':'暂停';
  $('deadline').disabled=!!active||benchmarkBusy||starting;
  $('swap').disabled=!!active||benchmarkBusy||starting;
  $('benchmark').disabled=!!active||benchmarkBusy||starting||!config;
  $('liveFlag').textContent=active&&!paused?'● LIVE — 真实付费调用':active?'● PAUSED — '+(pauseReason||'已暂停'):'● READY — 不发起请求';
  if(active&&paused)$('stageStatus').textContent='PAUSED';
}
function updateNames(){const [l,r]=controllers();$('leftName').textContent=characterNames[0]+' / '+names[l];$('rightName').textContent=characterNames[1]+' / '+names[r];}
function updateMetrics(p,s){
  $(p+'Latency').textContent=s.latest?.roundTripMs??'—';const med=median(s.latencies);$(p+'Median').textContent=med===null?'—':Math.round(med)+' ms';$(p+'Calls').textContent=`${s.calls} / ${s.discarded+s.errors}`;$(p+'Cost').textContent='$'+s.usd.toFixed(6)+(s.unknownCost?' + ?':'');if(s.model)$(p+'Model').textContent=s.model+(p==='deepseek'?' / 非思考':'');
}
function trace(entry){
  const item=document.createElement('div');item.className='trace-item '+entry.provider+(entry.status==='执行'?'':' discarded');
  const head=document.createElement('div'),who=document.createElement('span'),a=document.createElement('span'),time=document.createElement('b');who.className='who';who.textContent=names[entry.provider];a.textContent=LABELS[entry.action]||'无动作';time.textContent=entry.roundTripMs?`${entry.roundTripMs} ms`:'ERROR';head.append(who,a,time);
  const detail=document.createElement('small');detail.textContent=`${entry.status} · 距离 ${entry.state.distance} · 对手${LABELS[entry.state.opponent.action]}${entry.error?' · '+entry.error:''}`;item.append(head,detail);$('trace').prepend(item);while($('trace').children.length>35)$('trace').lastChild.remove();
}
function refreshReport(m){if(!m.record)return;m.record.stats=structuredClone(m.stats);m.record.pending=m.busy.filter(Boolean).length;m.record.comparison=compareMatch(m.stats);if(match===m)renderComparison(m.record);}
async function requestAction(id,m,g){
  const provider=g.fighters[id].controller,state=g.observe(id);if(state.legal_actions.length===1)return;
  m.busy[id]=true;m.next[id]=performance.now()+500;m.requests++;$('requestCount').textContent=`${m.requests} / 120 次`;
  const startAt=performance.now(),epoch=m.epoch;const s=m.stats[provider];s.calls++;
  try{
    const result=await post('/api/decision',{provider,session:m.session,state});
    const age=Math.round(performance.now()-startAt);s.latest={...result,roundTripMs:age};s.model=result.model;s.latencies.push(age);s.apiLatencies.push(result.latencyMs);if(result.usage.usd===null)s.unknownCost++;else s.usd+=result.usage.usd;
    let status='执行';
    if(result.invalid)status='无效输出';else if(match!==m||m.done)status='对局已结束';else if(paused||epoch!==m.epoch)status='暂停前的决定';else if(age>m.deadline)status='超过有效期';else if(!g.act(id,result.action))status='当前动作不可执行';
    if(status==='执行')s.executed++;else s.discarded++;
    const entry={provider,state,...result,roundTripMs:age,status,gameTimeMs:Math.round(g.time)};m.entries.push(entry);
    if(match===m){trace(entry);updateMetrics(provider,s);}
  }catch(e){
    s.errors++;if(!e.billingKnownZero)s.unknownCost++;const entry={provider,state,action:null,status:'调用失败',error:e.message,gameTimeMs:Math.round(g.time)};m.entries.push(entry);
    if(match===m){trace(entry);updateMetrics(provider,s);if(!m.done){paused=true;pauseReason='调用错误：'+e.message;notice(e.message+'。已暂停，可点击继续；不会自动重试。',true);setButtons();}}
  }finally{m.busy[id]=false;m.next[id]=Math.max(m.next[id],performance.now()+30);refreshReport(m);}
}
function finish(reason){
  if(!match||match.done)return;match.done=true;paused=true;
  const result=game.winner==='draw'?'平局':game.winner===null?'提前结束':names[game.fighters[game.winner].controller]+' 胜';
  match.record={mode:match.mode,controllers:match.controllers,result,reason,startedAt:match.startedAt,durationMs:Math.round(game.time),hp:game.fighters.map(f=>f.hp),stats:structuredClone(match.stats),pending:match.busy.filter(Boolean).length,comparison:compareMatch(match.stats),deadlineMs:match.deadline,entries:match.entries};reports.push(match.record);
  $('overlay').classList.remove('hidden');$('overlay').classList.add('complete');$('overlay').querySelector('h2').textContent=result;$('overlayText').textContent=`${reason} · ${game.fighters[0].hp} : ${game.fighters[1].hp} HP`;$('overlay').querySelector('.overlay-tag').textContent='ROUND COMPLETE';$('startOverlay').textContent='再来一局 ↗';$('stageStatus').textContent='ROUND COMPLETE';notice('对局已结束。尚在途中的请求会更新统计，但不会再执行动作。');renderComparison(match.record);setButtons();if(window.matchMedia('(max-width:1050px)').matches)$('comparisonPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderComparison(r){
  $('comparisonLabel').textContent='MATCH RESULT';$('comparisonPanel').classList.add('completed');const root=$('matchComparison');root.hidden=false;root.replaceChildren();
  const head=document.createElement('div');head.className='comparison-heading';
  const title=document.createElement('h2');title.textContent='本场对比';
  const status=document.createElement('span');status.textContent=r.pending?`还有 ${r.pending} 个请求返回后更新`:'统计已完成';head.append(title,status);root.append(head);
  const grid=document.createElement('div');grid.className='comparison-grid';
  const data=r.comparison||compareMatch(r.stats);
  for(const kind of ['speed','cost']){
    const c=data[kind],card=document.createElement('article');card.className='comparison-card '+(c.winner||'neutral');
    const label=document.createElement('span');label.className='comparison-label';label.textContent=kind==='speed'?'决策速度 · 本场中位耗时':'调用成本 · 本场总费用估算';
    const verdict=document.createElement('h3');
    verdict.textContent=c.status==='unavailable'?(kind==='speed'?'响应样本不足':'费用数据不完整'):c.status==='tie'?(kind==='speed'?'两者耗时相同':'两者费用相同'):`${names[c.winner]} ${kind==='speed'?'更快':'更省'}`;
    const diff=document.createElement('div');diff.className='comparison-difference';
    const number=document.createElement('strong');number.textContent=c.status==='unavailable'?'—':kind==='speed'?`${c.status==='ready'?'快 ':''}${Number(c.difference.toFixed(1))} ms`:`${c.status==='ready'?'省 ':''}$${c.difference.toFixed(6)}`;
    const pct=document.createElement('span');pct.textContent=c.status==='unavailable'?'暂不判定':`${kind==='speed'?'耗时减少':'费用减少'} ${Number(c.percent.toFixed(1))}%`;diff.append(number,pct);card.append(label,verdict,diff);
    for(const p of ['jev','deepseek']){
      const row=document.createElement('div');row.className='comparison-value '+p;
      const name=document.createElement('span');name.textContent=names[p];const value=document.createElement('b');
      value.textContent=kind==='speed'?(c[p]===null?'—':`${Number(c[p].toFixed(1))} ms · ${r.stats[p].latencies.length} 次响应`):`$${r.stats[p].usd.toFixed(6)}${r.stats[p].unknownCost?' + 未知费用':''} · ${r.stats[p].calls} 次调用`;
      row.append(name,value);card.append(row);
      if(c[p]!==null){const track=document.createElement('div');track.className='comparison-bar '+p;const fill=document.createElement('i');fill.style.width=(Math.max(c.jev||0,c.deepseek||0)>0?c[p]/Math.max(c.jev||0,c.deepseek||0)*100:0)+'%';track.append(fill);card.append(track);}
    }
    grid.append(card);
  }
  const note=document.createElement('p');note.className='comparison-note';note.textContent=`百分比以较慢／较贵的一方为基准。速度含请求往返；费用按 token 估算${r.pending?'，当前结果仍在更新':''}。`;
  root.append(grid,note);
}
function sampleState(kind){const g=new Arena(['jev','deepseek']);if(kind===0){g.fighters[0].x=440;g.fighters[1].x=515;g.act(1,'punch');}if(kind===1){g.fighters[0].x=200;g.fighters[1].x=800;}if(kind===2){g.fighters[0].hp=20;g.fighters[0].x=380;g.fighters[1].x=620;g.projectiles.push({x:560,velocity:-500,owner:1});}return g.observe(0);}
async function benchmark(){
  if(benchmarkBusy||(match&&!match.done))return;benchmarkBusy=true;setButtons();$('benchmarkResults').textContent='正在向两个模型发送相同局面…';const entries=[];
  try{
    const {session}=await post('/api/session',{});
    for(let i=0;i<3;i++){
      const state=sampleState(i);const group=await Promise.all(['jev','deepseek'].map(async provider=>{try{return {scenario:i,provider,state,...await post('/api/decision',{provider,session,state})};}catch(e){return {scenario:i,provider,error:e.message};}}));entries.push(...group);
      if(i<2)await new Promise(resolve=>setTimeout(resolve,550));
    }
    benchmarks.push({at:new Date().toISOString(),entries});$('benchmarkResults').replaceChildren();
    for(let i=0;i<3;i++){const row=document.createElement('div');row.className='bench-row';for(const text of [['近身出拳','远距离','来袭能量波'][i],...entries.filter(e=>e.scenario===i).map(e=>e.error?'失败':`${LABELS[e.action]||'无效'} / ${e.latencyMs}ms`)]){const s=document.createElement('span');s.textContent=text;row.append(s);}$('benchmarkResults').append(row);}
    const label=document.createElement('small');label.textContent='列顺序：局面 / Jev / DeepSeek。三组样本不是准确率或综合能力结论。';$('benchmarkResults').append(label);notice('同局面对照完成。');
  }catch(e){notice(e.message,true);}finally{benchmarkBusy=false;setButtons();}
}
$('swap').onclick=()=>{swapped=!swapped;$('swap').setAttribute('aria-pressed',String(swapped));$('swap').textContent=swapped?'左右已交换':'交换左右';game=new Arena(controllers());match=null;paused=true;updateNames();resetDisplay();readyOverlay();setButtons();};
$('start').onclick=start;$('startOverlay').onclick=start;$('stop').onclick=()=>finish('手动结束');$('pause').onclick=()=>{paused=!paused;pauseReason=paused?'手动暂停':'';match.epoch++;$('stageStatus').textContent=paused?'PAUSED':'ROUND 01 / LIVE';notice(paused?'已暂停。当前在途请求会计入费用，但返回动作不会执行。':'继续真实 API 对战。');setButtons();};$('sound').onclick=()=>{sound=!sound;$('sound').textContent='音效 '+(sound?'开':'关');$('sound').setAttribute('aria-pressed',String(sound));};$('benchmark').onclick=benchmark;

function handleVisibility(){
  if(!match||match.done)return;
  if(document.hidden&&!paused){
    paused=true;pauseReason='后台暂停，返回页面自动继续';match.epoch++;
    setButtons();notice('页面进入后台，暂时停止新请求；返回页面后自动继续。');
  }else if(!document.hidden&&paused&&pauseReason==='后台暂停，返回页面自动继续'){
    paused=false;pauseReason='';match.epoch++;
    $('stageStatus').textContent='ROUND 01 / LIVE';setButtons();
    notice('已返回页面，自动继续真实 API 对战。');
  }
}
document.addEventListener('visibilitychange',handleVisibility);
function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function draw(){
  const visualTime=performance.now();drawStage(ctx,visualTime);game.fighters.forEach(f=>drawSprite(ctx,f,game.fighters[1-f.id],game.time,visualTime));
  for(const p of game.projectiles){ctx.save();ctx.translate(p.x,352);ctx.scale(Math.sign(p.velocity),1);rect(-35,-10,38,20,p.owner===0?'#68c7b5':'#e59466');rect(-6,-17,30,34,p.owner===0?'#b8ffdf':'#ffd6a3');rect(12,-10,22,20,'#edf9d8');ctx.restore();}
  for(const e of game.effects){const age=(game.time-e.t)/280,c=e.guard?'#91e4da':'#ffe1ac';ctx.strokeStyle=c;ctx.lineWidth=3;for(let i=0;i<8;i++){const angle=i*Math.PI/4;ctx.beginPath();ctx.moveTo(e.x+Math.cos(angle)*age*12,e.y+Math.sin(angle)*age*12);ctx.lineTo(e.x+Math.cos(angle)*(12+age*30),e.y+Math.sin(angle)*(12+age*30));ctx.stroke();}}
  const [l,r]=game.fighters;$('leftHp').textContent=l.hp+' HP';$('rightHp').textContent=r.hp+' HP';$('leftBar').style.width=l.hp+'%';$('rightBar').style.width=r.hp+'%';$('clock').textContent=String(Math.ceil(Math.max(0,RULES.roundMs-game.time)/1000)).padStart(2,'0');$('distance').textContent=Math.round(Math.abs(l.x-r.x));$('leftAction').textContent=LABELS[l.action];$('rightAction').textContent=LABELS[r.action];
}
let previous=performance.now();function frame(now){const dt=Math.min(35,now-previous);previous=now;
  if(match&&!match.done&&!paused){
    game.step(dt);
    if(!match.done){if(match.requests>=120&&match.busy.every(b=>!b))finish('达到调用上限');else for(let id=0;id<2;id++)if(!match.busy[id]&&now>=match.next[id]&&match.requests<120)requestAction(id,match,game);}
  }
  draw();requestAnimationFrame(frame);
}requestAnimationFrame(frame);
try{config=await (await fetch('/api/config')).json();await loadSprites();assetsReady=true;updateNames();$('jevModel').textContent=config.models.jev;$('deepseekModel').textContent=config.models.deepseek+' / 非思考';notice(config.configured.jev&&config.configured.deepseek?'两个模型已配置。点击开始才会产生付费调用。':'部分模型未配置，请检查本地环境配置。',!(config.configured.jev&&config.configured.deepseek));setButtons();}catch{notice('本地服务或角色资源加载失败，请刷新页面或检查服务。',true);setButtons();}
