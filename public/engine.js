export const LABELS = {wait:'等待',approach:'接近',retreat:'后退',block:'防守',punch:'出拳',kick:'踢击',jump:'跳跃',dash:'突进',special:'能量波'};
export const RULES = {width:1000,roundMs:45000,deadlineMs:1500};
export function fighter(id,controller){return {id,controller,x:id===0?230:770,height:0,vy:0,hp:100,action:'wait',actionStartedAt:0,koAt:null,until:0,hitAt:0,hitDone:true,specialReady:0,dashReady:0,hurtUntil:0,recent:[],hits:0,damage:0};}
export class Arena {
  constructor(controllers,onEvent=()=>{}){this.fighters=controllers.map((c,i)=>fighter(i,c));this.time=0;this.projectiles=[];this.effects=[];this.onEvent=onEvent;this.finished=false;this.winner=null;}
  legal(f){
    if(f.hurtUntil>this.time || (['punch','kick','special'].includes(f.action)&&f.until>this.time)) return ['wait'];
    const out=['wait','approach','retreat','block','punch','kick'];
    if(f.height===0) out.push('jump');
    if(f.dashReady<=this.time&&f.height===0)out.push('dash');
    if(f.specialReady<=this.time&&f.height===0)out.push('special');
    return out;
  }
  act(id,action){
    const f=this.fighters[id];
    if(this.finished||!this.legal(f).includes(action))return false;
    if(action==='wait')return true;
    f.action=action;f.actionStartedAt=this.time;f.recent.push(action);f.recent=f.recent.slice(-5);
    const lengths={approach:300,retreat:300,block:500,punch:500,kick:740,jump:280,dash:200,special:800};
    f.until=this.time+lengths[action];f.hitDone=true;
    if(['punch','kick','special'].includes(action)){f.hitAt=this.time+({punch:240,kick:380,special:520}[action]);f.hitDone=false;}
    if(action==='jump'){f.vy=530;}
    if(action==='dash')f.dashReady=this.time+900;
    if(action==='special')f.specialReady=this.time+1800;
    this.onEvent({type:'action',id,action});return true;
  }
  hit(attacker,defender,damage,knock=18){
    const guard=defender.action==='block'&&defender.until>this.time&&defender.height===0;
    const amount=guard?Math.max(1,Math.round(damage*.2)):damage;
    defender.hp=Math.max(0,defender.hp-amount);if(defender.hp===0&&defender.koAt===null)defender.koAt=this.time;attacker.damage+=amount;if(!guard)attacker.hits++;
    const direction=Math.sign(defender.x-attacker.x)||1;
    defender.x=Math.max(50,Math.min(950,defender.x+direction*(guard?5:knock)));
    if(!guard){defender.hurtUntil=this.time+190;defender.action='wait';defender.until=this.time;defender.hitDone=true;}
    this.effects.push({x:defender.x,y:410-defender.height-65,t:this.time,guard});
    this.onEvent({type:'hit',id:defender.id,guard,damage:amount});
  }
  step(dt){
    if(this.finished)return;
    this.time+=dt;const seconds=dt/1000;const impacts=[];
    for(const f of this.fighters){
      const o=this.fighters[1-f.id],dir=Math.sign(o.x-f.x)||1;
      if(f.height>0||f.vy>0){f.height+=f.vy*seconds;f.vy-=1600*seconds;if(f.height<=0){f.height=0;f.vy=0;}}
      if(f.until>this.time&&f.hurtUntil<=this.time){
        if(['approach','retreat','dash'].includes(f.action))f.x+=dir*(f.action==='retreat'?-1:1)*(f.action==='dash'?550:220)*seconds;
      }else if(f.until<=this.time)f.action='wait';
      f.x=Math.max(50,Math.min(950,f.x));
      if(!f.hitDone&&this.time>=f.hitAt){
        f.hitDone=true;
        if(f.action==='special')this.projectiles.push({x:f.x+dir*40,velocity:dir*500,owner:f.id});
        else if(Math.abs(o.x-f.x)<=({punch:92,kick:136}[f.action]||0)&&Math.abs(o.height-f.height)<85)impacts.push([f,o,f.action==='punch'?9:14]);
      }
    }
    for(const [attacker,defender,damage] of impacts)this.hit(attacker,defender,damage);
    const [a,b]=this.fighters;
    if(Math.abs(a.x-b.x)<48&&Math.abs(a.height-b.height)<65){const mid=(a.x+b.x)/2,dir=a.x<=b.x?1:-1;a.x=mid-dir*24;b.x=mid+dir*24;}
    this.projectiles=this.projectiles.filter(p=>{
      p.x+=p.velocity*seconds;const target=this.fighters[1-p.owner];
      if(Math.abs(target.x-p.x)<32&&target.height<75){this.hit(this.fighters[p.owner],target,12,25);return false;}
      return p.x>-50&&p.x<1050;
    });
    this.effects=this.effects.filter(e=>this.time-e.t<280);
    if(a.hp===0||b.hp===0||this.time>=RULES.roundMs){this.finished=true;this.winner=a.hp===b.hp?'draw':a.hp>b.hp?0:1;this.onEvent({type:'finish',winner:this.winner});}
  }
  observe(id){
    const describe=f=>({hp:f.hp,x:Math.round(f.x),height:Math.round(f.height),action:f.action,action_remaining_ms:Math.round(Math.max(0,f.until-this.time)),windup_remaining_ms:f.hitDone?0:Math.round(Math.max(0,f.hitAt-this.time)),special_cooldown_ms:Math.round(Math.max(0,f.specialReady-this.time)),dash_cooldown_ms:Math.round(Math.max(0,f.dashReady-this.time)),recent_actions:[...f.recent]});
    return {self:describe(this.fighters[id]),opponent:describe(this.fighters[1-id]),distance:Math.round(Math.abs(this.fighters[0].x-this.fighters[1].x)),legal_actions:this.legal(this.fighters[id]),projectiles:this.projectiles.map(p=>({x:Math.round(p.x),velocity:p.velocity,owner:p.owner===id?'self':'opponent'})),remaining_ms:Math.round(Math.max(0,RULES.roundMs-this.time)),arena_width:1000};
  }
}
