export const ACTIONS = Object.freeze({
  wait: 'Stay still briefly; no automatic defence.',
  approach: 'Walk towards the opponent for 300ms. No attack or guard.',
  retreat: 'Walk away for 300ms. This is not a guard.',
  block: 'Guard for 500ms. Reduces incoming damage; no attack.',
  punch: 'Punch: range 92, windup 240ms, damage 9, recovery 260ms.',
  kick: 'Kick: range 136, windup 380ms, damage 14, recovery 360ms.',
  jump: 'Jump for about 650ms. Can evade low attacks and projectiles.',
  dash: 'Dash towards the opponent for 200ms, no guard. Cooldown 900ms.',
  special: 'Projectile: windup 520ms, damage 12, speed 500 units/s, cooldown 1800ms.'
});
export const QUESTION = 'Choose exactly one next action to win this fighting game. Use distance, opponent action and attack timing, health, recent actions, and cooldowns. Responses take time: the game continues while you decide. Do not invent actions. The opponent may change its action. Choose only an action in legal_actions. No training or learning between rounds.';
export function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid state');
  for (const side of ['self', 'opponent']) {
    const f = state[side];
    if (!f || typeof f !== 'object') throw new Error('Missing fighter state');
    for (const key of ['hp', 'x', 'height', 'action_remaining_ms', 'windup_remaining_ms', 'special_cooldown_ms', 'dash_cooldown_ms']) {
      if (!Number.isFinite(f[key]) || f[key] < 0 || f[key] > 100000) throw new Error('Invalid fighter value');
    }
    if (f.hp > 100 || f.x > 1000 || f.height > 500 || !Object.hasOwn(ACTIONS, f.action)) throw new Error('Invalid fighter');
    if (!Array.isArray(f.recent_actions) || f.recent_actions.length > 5 || f.recent_actions.some(a => !Object.hasOwn(ACTIONS, a))) throw new Error('Invalid history');
  }
  if (!Array.isArray(state.legal_actions) || !state.legal_actions.length || state.legal_actions.some(a => !Object.hasOwn(ACTIONS, a))) throw new Error('Invalid legal actions');
  if (!Number.isFinite(state.distance) || state.distance < 0 || state.distance > 1000) throw new Error('Invalid distance');
  if (!Array.isArray(state.projectiles) || state.projectiles.length > 12) throw new Error('Invalid projectiles');
  for (const p of state.projectiles) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.velocity) || p.x < -100 || p.x > 1100 || Math.abs(p.velocity) > 1000 || !['self', 'opponent'].includes(p.owner)) throw new Error('Invalid projectile');
  }
  return state;
}
export function normalizeAction(provider, data, legal) {
  let action;
  if (provider === 'jev') action = data?.answers?.action?.choice;
  else {
    const content = data?.choices?.[0]?.message?.content;
    try { action = JSON.parse(content)?.action; } catch { throw new Error('Model returned invalid JSON'); }
  }
  if (!Object.hasOwn(ACTIONS, action) || !legal.includes(action)) throw new Error('Model returned an unavailable action');
  return action;
}
export function priceFor(provider, usage, date = new Date(), overrides = {}) {
  const input = provider === 'jev' ? usage?.input_tokens : usage?.prompt_tokens;
  const output = provider === 'jev' ? usage?.output_tokens : usage?.completion_tokens;
  if (!Number.isFinite(input) || !Number.isFinite(output)) return { usd: null, input: null, output: null };
  const weekday = date.getUTCDay() >= 1 && date.getUTCDay() <= 5;
  const hour = date.getUTCHours();
  const peak = weekday && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
  const multiplier = peak ? 1 : 0.5;
  const cached = provider === 'jev' ? 0 : Math.min(input, Math.max(0, usage?.prompt_cache_hit_tokens ?? 0));
  const inputRate = provider === 'jev' ? (overrides.jevInput ?? 0.042) : (overrides.deepseekInput ?? 0.3 * multiplier);
  const cacheRate = overrides.deepseekCache ?? 0.006 * multiplier;
  const outputRate = overrides.deepseekOutput ?? 1.2 * multiplier;
  return { usd: provider === 'jev' ? input * inputRate / 1e6 : ((input - cached) * inputRate + cached * cacheRate + output * outputRate) / 1e6, input, output, cached, peak };
}
