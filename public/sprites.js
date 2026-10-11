const atlasImages=new Map();let manifest,ready=false;const koStarts=new WeakMap();
export const characterNames=['草薙京','不知火舞'];
export async function loadSprites(){
  const response=await fetch('/assets/kof/manifest.json');if(!response.ok)throw new Error('角色资源清单加载失败');manifest=await response.json();
  const animations=[manifest.stage,...Object.values(manifest.characters).flatMap(c=>Object.values(c))];
  await Promise.all(animations.map(a=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{atlasImages.set(a.file,img);resolve();};img.onerror=()=>reject(new Error('角色动画加载失败'));img.src='/assets/kof/'+a.file;})));ready=true;
}
function frameAt(a,time){const total=a.durations.reduce((x,y)=>x+y,0);let t=Math.max(0,time)%total;for(let i=0;i<a.frames;i++){if(t<a.durations[i])return i;t-=a.durations[i];}return 0;}
function paint(ctx,a,index,x,y,w,h){const col=index%a.columns,row=Math.floor(index/a.columns);ctx.drawImage(atlasImages.get(a.file),col*a.width,row*a.height,a.width,a.height,x,y,w,h);}
export function drawStage(ctx,time){
  if(!ready)return;const a=manifest.stage,scale=500/a.height,w=a.width*scale;ctx.imageSmoothingEnabled=false;
  paint(ctx,a,frameAt(a,time),(1000-w)/2,0,w,500);
  const shade=ctx.createLinearGradient(0,0,0,500);shade.addColorStop(0,'rgba(10,12,24,.13)');shade.addColorStop(.6,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(7,9,18,.24)');ctx.fillStyle=shade;ctx.fillRect(0,0,1000,500);
}
export function drawSprite(ctx,f,opponent,time,visualTime){
  if(!ready)return;const char=f.id===0?'kyo':'mai',set=manifest.characters[char],hurt=f.hurtUntil>time;
  let key=f.hp===0?'ko':hurt?'hurt':f.height>0?'jump':f.action==='dash'?'approach':f.action==='wait'?'idle':f.action;
  const a=set[key]||set.idle,dir=f.x<=opponent.x?1:-1,scale=2;
  let index=frameAt(a,key==='idle'?visualTime:time-(f.actionStartedAt||0));
  if(['punch','kick','special'].includes(key)){const length={punch:500,kick:740,special:800}[key];index=Math.min(a.frames-1,Math.floor((time-(f.actionStartedAt||0))/length*a.frames));}
  if(key==='block')index=0;
  if(key==='hurt')index=Math.min(a.frames-1,Math.floor((190-Math.max(0,f.hurtUntil-time))/190*a.frames));
  if(key==='ko'){if(!koStarts.has(f))koStarts.set(f,visualTime);index=Math.min(a.frames-1,Math.floor((visualTime-koStarts.get(f))/90));}
  let anchorY=a.anchorY;
  // Jump GIFs contain a vertical path; the game physics already supplies that path.
  if(key==='jump')anchorY=a.footY?.[index]||a.height;
  ctx.save();ctx.translate(Math.round(f.x),Math.round(414-f.height));ctx.scale(dir,1);ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='rgba(0,0,0,.23)';ctx.beginPath();ctx.ellipse(0,f.height-3,36,7,0,0,Math.PI*2);ctx.fill();
  if(hurt)ctx.globalAlpha=.65+Math.sin(time*.08)*.25;
  paint(ctx,a,index,-a.anchorX*scale,-anchorY*scale,a.width*scale,a.height*scale);
  if(key==='block'){ctx.strokeStyle='#1abc9c';ctx.lineWidth=3;ctx.beginPath();ctx.arc(15,-80,52,-1.25,1.25);ctx.stroke();}
  ctx.restore();
  ctx.textAlign='center';ctx.font='bold 13px monospace';ctx.fillStyle=f.controller==='jev'?'#1abc9c':'#f39c12';ctx.fillText(f.controller.toUpperCase(),f.x,452);ctx.textAlign='left';
}
