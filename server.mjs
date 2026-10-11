import http from 'node:http';
import {readFile, appendFile, mkdir, readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {EnvHttpProxyAgent, fetch} from 'undici';
import {RequestGate} from './lib/request-gate.mjs';
import {ACTIONS, QUESTION, validateState, normalizeAction, priceFor} from './lib/decisions.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
try {
  for (const line of (await readFile(path.join(root, '.env.local'), 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch {}
const port = Number(process.env.PORT || 8878);
const token = randomBytes(24).toString('hex');
const models = {jev: process.env.JEV_MODEL || 'jev-1.13.0', deepseek: process.env.DEEPSEEK_MODEL || 'deepseek-flash'};
const keys = {jev: process.env.TYPESAFE_API_KEY, deepseek: process.env.DEEPSEEK_API_KEY};
const dispatcher = new EnvHttpProxyAgent({httpsProxy:process.env.https_proxy || process.env.HTTPS_PROXY || process.env.all_proxy || process.env.ALL_PROXY});
const sessions = new Map();
const files = new Map([['/', ['public/index.html', 'text/html']], ['/app.js', ['public/app.js','text/javascript']], ['/style.css',['public/style.css','text/css']], ['/engine.js',['public/engine.js','text/javascript']]]);
files.set('/comparison.js',['public/comparison.js','text/javascript']);
files.set('/sprites.js',['public/sprites.js','text/javascript']);
for(const asset of await readdir(path.join(root,'public/assets/kof'))) {
  if(/^(?:[a-z-]+\.png|manifest\.json)$/.test(asset)) files.set('/assets/kof/'+asset,['public/assets/kof/'+asset,asset.endsWith('.png')?'image/png':'application/json']);
}
const safeError = status => ({401:'密钥无效或已撤销',402:'账户余额不足',429:'服务限流，已暂停自动请求',529:'服务暂时过载'}[status] || `模型服务错误（${status}）`);
export async function decide(provider, state) {
  validateState(state);
  if (!keys[provider]) throw new Error('本地未配置此模型密钥');
  const criteria = Object.fromEntries(state.legal_actions.map(a=>[a,ACTIONS[a]]));
  const payload = provider === 'jev'
    ? {model:models.jev,state,questions:{action:{type:'choice',instructions:QUESTION,criteria}}}
    : {model:models.deepseek,thinking:{type:'disabled'},max_tokens:32,response_format:{type:'json_object'},messages:[{role:'system',content:QUESTION+' Return JSON with only the action field.'},{role:'user',content:JSON.stringify({state,criteria})}]};
  const start = performance.now();
  const response = await fetch(provider === 'jev' ? 'https://api.typesafe.ai/v1/systemone' : 'https://api.deepseek.com/chat/completions', {
    method:'POST',headers:{Authorization:`Bearer ${keys[provider]}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000),dispatcher
  });
  if (!response.ok) { const e = new Error(safeError(response.status)); e.status = response.status; throw e; }
  const data = await response.json();
  const latencyMs = Math.round(performance.now() - start);
  const cost = priceFor(provider, data.usage);
  let action, invalid = false;
  try { action = normalizeAction(provider,data,state.legal_actions); } catch { invalid = true; }
  return {provider,model:data.model || models[provider],action:action || null,invalid,latencyMs,usage:cost,confidence:provider==='jev'?data.answers?.action?.confidence:null,probabilities:provider==='jev'?data.answers?.action?.probabilities:null};
}
function json(res,status,data) { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(data)); }
async function body(req) {
  let text = '';
  for await (const chunk of req) {text += chunk; if(text.length>12000) throw new Error('Request too large');}
  return JSON.parse(text);
}
const server = http.createServer(async(req,res)=>{
  const origin = `http://127.0.0.1:${port}`;
  const url = new URL(req.url,origin);
  if (![ `127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return json(res,403,{error:'仅允许本机访问'});
  try {
    if(req.method==='GET' && url.pathname==='/api/config') return json(res,200,{token,models,configured:{jev:!!keys.jev,deepseek:!!keys.deepseek},limit:120});
    if(req.method==='POST' && url.pathname.startsWith('/api/')) {
      if(req.headers['x-demo-token']!==token || (req.headers.origin && ![origin,`http://localhost:${port}`].includes(req.headers.origin))) return json(res,403,{error:'请求来源不允许'});
      const data = await body(req);
      if(url.pathname==='/api/session') {
        for (const [id,s] of sessions) if(Date.now()-s.created>600000) sessions.delete(id);
        if(sessions.size>=30) return json(res,429,{error:'本机对局数量达到上限，请重启服务'});
        const id = randomBytes(12).toString('hex'); sessions.set(id,{created:Date.now(),count:0,gate:new RequestGate()});
        return json(res,200,{session:id,limit:120});
      }
      if(url.pathname==='/api/decision') {
        const {provider,session,state}=data;
        if(!['jev','deepseek'].includes(provider)) return json(res,400,{error:'未知模型'});
        validateState(state);
        const s=sessions.get(session);
        if(!s || Date.now()-s.created>600000) return json(res,400,{error:'对局已过期'});
        if(s.count>=120) return json(res,429,{error:'本局达到 120 次调用上限'});
        const result=await s.gate.run(provider,async()=>{if(s.count>=120){const e=new Error('本局达到 120 次调用上限');e.status=429;e.billingKnownZero=true;throw e;}s.count++;return await decide(provider,state);});
        await mkdir(path.join(root,'runs'),{recursive:true});
        await appendFile(path.join(root,'runs',`${session}.jsonl`),JSON.stringify({at:new Date().toISOString(),state,result})+'\n');
        return json(res,200,result);
      }
      return json(res,404,{error:'Not found'});
    }
    if(req.method==='GET' && files.has(url.pathname)) {
      const [file,type] = files.get(url.pathname);
      const content = await readFile(path.join(root,file));
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
      return res.end(content);
    }
    json(res,404,{error:'Not found'});
  } catch(e) { json(res,e.status || 400,{billingKnownZero:!!e.billingKnownZero,error:e.name==='TimeoutError'?'模型请求超时，已暂停自动请求':e.message.includes('fetch')?'无法连接模型服务，已暂停自动请求':e.message}); }
});
if(process.argv[1]===fileURLToPath(import.meta.url)) server.listen(port,'127.0.0.1',()=>console.log(`Decision Arena: http://127.0.0.1:${port}`));
