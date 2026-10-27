// cards.js — card / item descriptions and HTML rendering for the client (Russian text + icons).

import { CHARACTERS, FIELD_DATA, ITEMS, WOUNDS } from '/shared/data/cards.mjs';

export function describeCard(cardId) {
    if (cardId.startsWith('contam#')) return { name: 'Заражение', text: 'Нельзя разыграть или сбросить для оплаты. Проверяется в Хирургии, Автодоком или картой «Отдых».', contam: true };
    const base = cardId.split('#')[0];
    const [owner, key] = base.split('.');
    if (owner === 'field') return Object.assign({ field: true }, FIELD_DATA[key]);
    const ch = CHARACTERS[owner];
    return ch && ch.cards[key] ? ch.cards[key] : { name: cardId, text: '' };
}

export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

/** Hand card element. info = {enabled, reason} from the turn menu (optional). */
/** Characters whose action decks have illustrations in client/art/<charId>/<cardKey>.jpg. */
const ART_DECKS = {
    android: ['alwaysPrepared', 'computerSkills', 'deactivation', 'demolition', 'fastRepairs', 'interruption', 'powerUp', 'protocolOverride', 'search', 'selfRepair'],
    soldier: ['coveringFire', 'demolition', 'forcingFire', 'interruption', 'myLittleFriend', 'nervesOfSteel', 'repairs', 'rest', 'search', 'weakSpot'],
    scout: ['adrenaline', 'demolition', 'distraction', 'interruption', 'reconnaissance', 'repairs', 'rest', 'scavenging', 'search', 'weakSpot'],
    mechanic: ['computerSkills', 'demolition', 'duckAndCover', 'fastRepairs', 'fightFire', 'ingenuity', 'interruption', 'rest', 'search', 'technicalCorridors'],
    pilot: ['computerSkills', 'demolition', 'determination', 'interruption', 'knowledgeOfShip', 'piloting', 'repairs', 'rest', 'search', 'weakSpot'],
    hacker: ['computerSkills', 'demolition', 'interruption', 'masterPlan', 'neuralink', 'override', 'recharge', 'repairs', 'rest', 'search'],
    scientist: ['computerSkills', 'connection', 'demolition', 'duckAndCover', 'interruption', 'intranet', 'repairs', 'rest', 'riskAssessment', 'search'],
    medic: ['computerSkills', 'demolition', 'fieldSurgery', 'firstAid', 'interruption', 'neurotoxicGas', 'repairs', 'rest', 'search', 'synthesizedDrugs'],
    janitor: ['cleanUp', 'demolition', 'duckAndCover', 'emergencyKey', 'interruption', 'itShouldWork', 'maintenancePlan', 'repairs', 'rest', 'search'],
    ceo: ['backupBattery', 'command', 'computerSkills', 'demolition', 'fastRepairs', 'interruption', 'protect', 'rest', 'roboticPunch', 'search'],
    labrat: ['demolition', 'feelOfDark', 'inconspicuous', 'interruption', 'repairs', 'rest', 'search', 'sensitiveHearing', 'shriek', 'weirdMetabolism'],
    sentry: ['defensePlan', 'demolition', 'facilityTour', 'interruption', 'repairs', 'rest', 'search', 'securityControl', 'stun', 'weakSpot'],
    convict: ['bash', 'catchThis', 'demolition', 'duckAndCover', 'interruption', 'intimidate', 'repairs', 'rest', 'search', 'shortTemper'],
    psych: ['computerSkills', 'demolition', 'dontPanic', 'emotionScanner', 'interruption', 'lendAHand', 'repairs', 'rest', 'search', 'wouldYouKindly'],
    bounty: ['demolition', 'determination', 'goGirl', 'interruption', 'repairs', 'rest', 'search', 'sentinel', 'tacticalMove', 'weakSpot'],
    captain: ['authority', 'coveringFire', 'demolition', 'fanning', 'interruption', 'motivation', 'reload', 'repairs', 'rest', 'search'],
    survivor: ['alwaysPrepared', 'demolition', 'desperateAttack', 'distraction', 'interruption', 'obstinate', 'repairs', 'rest', 'search', 'vents'],
    xeno: ['demolition', 'fieldExperience', 'interruption', 'overmind', 'pheromones', 'repairs', 'rest', 'search', 'vivisection', 'workspacePlan'],
};
/** Field Data cards (hand id 'field.<key>') with illustrations in client/art/field/<key>.jpg. */
const ART_FIELD = ['fdAim', 'fdSprint', 'fdPatch', 'fdScan', 'fdHush', 'fdTrap'];
/** Items with illustrations in client/art/items/<itemKey>.jpg. */
const ART_ITEMS = ['synthFood', 'stimulants', 'caffeine', 'autodoc', 'medkit', 'antiseptic', 'stapler', 'adrenaline', 'supportCrate', 'selfDestructKey',
    'armor', 'grenade', 'flashbang', 'energyCharge', 'evacKey', 'taser', 'logCodes', 'detonator', 'cables', 'ductTape',
    'engineKey', 'extinguisher', 'glowstick', 'nemesisPlans', 'reagent', 'techPlan', 'tools', 'plasmaGun', 'flamethrower', 'hardenedArmor',
    'riotgun', 'soldierGun', 'handgun', 'scoutRifle', 'sawedOff', 'smartGun', 'riotShotgun', 'energyPistol', 'bountyRifle',
    'sixShooter', 'probeArm', 'xenoGun', 'survivorFavorite', 'pipe', 'cuffs', 'robot', 'ups', 'laika', 'wrench',
    'fieldKit', 'oculobe', 'sampleJar', 'navTablet', 'mechTools'];
export function itemArt(key) { return ART_ITEMS.includes(key) ? 'art/items/' + key + '.jpg' : null; }
/** Thumbnail + hover preview (art, name, rules text) for an item instance; empty string when the item has no art. */
export function itemArtHtml(inst) {
    const art = itemArt(inst.item); if (!art) return '';
    const d = ITEMS[inst.item];
    return '<i class="ithumb" style="background-image:url(' + art + ')"></i><span class="ipop"><span class="ipart" style="background-image:url(' + art + ')"></span><b>' + esc(d.name) + '</b><span>' + esc(d.text || '') + '</span></span>';
}
/** Event cards with illustrations in client/art/events/<eventId>.jpg. */
const ART_EVENTS = ['breakingIn', 'bulkheadsOpen', 'damage', 'damagingFire', 'eggProtection', 'podEjection', 'fireWave', 'flammable', 'generatorOverheats', 'hatching',
    'leavingShell', 'lifeSupport', 'lurking', 'malfunction', 'onTheHunt', 'protectAndServe', 'scentOfPrey', 'shortCircuit', 'systemFailure', 'queenAwakens'];
export function eventArt(id) { return ART_EVENTS.includes(id) ? 'art/events/' + id + '.jpg' : null; }
/** Attack cards share one illustration per name: claws1..3 -> claws, fury1/2 -> fury, scratch1..4 -> scratch, tail1/2 -> tail. */
const ART_ATTACK = ['bite', 'bloodSense', 'claws', 'fury', 'infecting', 'miss', 'scratch', 'tail'];
export function attackArt(id) { const k = String(id).replace(/\d+$/, ''); return ART_ATTACK.includes(k) ? 'art/attack/' + k + '.jpg' : null; }
/** Shared illustrations: every Queen card uses one art, Computer cards one (Lock-down its red variant), objectives one per kind. */
export function queenArt() { return 'art/misc/queen.jpg'; }
export function computerArt(id) { return id === 'lockdown' ? 'art/misc/lockdown.jpg' : 'art/misc/computer.jpg'; }
export function objectiveArt(kind) { return kind === 'corporate' ? 'art/misc/objectiveCorporate.jpg' : 'art/misc/objectivePersonal.jpg'; }
export function cardArt(cardId) {
    const [owner, key] = cardId.split('#')[0].split('.');
    if (owner === 'field') return ART_FIELD.includes(key) ? 'art/field/' + key + '.jpg' : null;
    return ART_DECKS[owner] && ART_DECKS[owner].includes(key) ? 'art/' + owner + '/' + key + '.jpg' : null;
}

export function cardHtml(cardId, info, selected) {
    const d = describeCard(cardId);
    const cls = ['card'];
    if (d.contam) cls.push('contam'); if (d.field) cls.push('field');
    if (info && info.enabled) cls.push('playable'); else if (info) cls.push('disabled');
    if (selected) cls.push('selected');
    const icon = d.contam ? '☣' : d.reaction ? '⚡' : d.field ? '📡' : '';
    const art = cardArt(cardId);
    if (art) cls.push('with-art');
    return '<div class="' + cls.join(' ') + '" data-card="' + esc(cardId) + '" title="' + esc(d.text) + '">' +
        (art ? '<div class="cart" style="background-image:url(' + art + ')"></div>' : '') +
        (d.cost > 1 ? '<div class="ccost" title="Сбросьте ещё ' + (d.cost - 1) + '">' + d.cost + '</div>' : '') +
        '<div class="cname">' + icon + ' ' + esc(d.name) + '</div>' +
        '<div class="ctext">' + esc(d.text) + '</div>' +
        (info && !info.enabled && info.reason ? '<div class="cwhy">' + esc(info.reason) + '</div>' : '') +
        '</div>';
}

export function itemLabel(inst) {
    const d = ITEMS[inst.item];
    let s = d.name;
    if (d.weapon) s += ' [' + inst.ammo + '/' + d.weapon.max + ']';
    if (d.markers !== undefined) s += ' [' + (inst.charge ?? d.markers) + ' ⬢]';
    if (inst.broken) s += ' (сломано)';
    return s;
}
export function itemTitle(inst) { const d = ITEMS[inst.item]; return d.text || ''; }
export function woundName(w) { return WOUNDS[w] ? WOUNDS[w].name : w; }
