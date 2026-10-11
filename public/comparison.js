export function median(values) {
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
function compare(jev,deepseek) {
  if(jev===null||deepseek===null)return {status:'unavailable',jev,deepseek};
  if(jev===deepseek)return {status:'tie',jev,deepseek,difference:0,percent:0};
  const winner=jev<deepseek?'jev':'deepseek',difference=Math.abs(jev-deepseek);
  return {status:'ready',winner,jev,deepseek,difference,percent:difference/Math.max(jev,deepseek)*100};
}
export function compareMatch(stats) {
  const j=stats.jev,d=stats.deepseek;
  return {
    speed:compare(median(j.latencies),median(d.latencies)),
    cost:compare(j.unknownCost||!j.calls?null:j.usd,d.unknownCost||!d.calls?null:d.usd)
  };
}
