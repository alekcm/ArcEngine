import { createEngineContext } from './fs-engine.mjs';
import vm from 'node:vm';
const ctx = createEngineContext();
const R = vm.runInContext('FS_RULES', ctx);

const st = R.newReadyGame({ seed: 7, players: [
  { faction: 'имперская-гвардия', name: 'P0', id: 'p0' },
  { faction: 'орки', name: 'P1', id: 'p1' }] });
st.units = []; st.structures = []; st.objectives = []; st.storms = [];
for (const s of st.systems) s.tokens = [];
st.phase = 'operations'; st.turn = 0;
const sys = st.systems[0].id;
const world = st.systems[0].areas.find(a => a.world).pos;
R.addUnit(st, 0, 'гвардейцы', sys, world);
st.players[0].materiel = 14; st.players[0].supply.units['гвардейцы'] = 9;
st.order = { seat: 0, order: 'dominate', system: sys, pos: world, phase: 'dominate' };
R.addStructure(st, 0, 'factory', sys, world);
R.runEffects(st, 0, [{ op: 'guardDeploy' }], { kind: 'ability', ctx: null });
const r = R.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: sys, pos: world });
console.log('покупка:', r.ok, r.error || '');
console.log('запись покупки:', st.order.purchases[0].name, '| deal =', st.order.purchases[0].deal && st.order.purchases[0].deal.constructor.name);
try { const s = JSON.stringify(st.order); console.log('JSON заказа: ok,', s.length, 'байт'); }
catch (e) { console.log('JSON заказа ПАДАЕТ:', e.message.slice(0, 160)); }
try { JSON.stringify(st); console.log('JSON состояния: ok'); }
catch (e) { console.log('JSON состояния ПАДАЕТ:', e.message.slice(0, 160)); }
