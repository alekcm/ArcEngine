// HeroesData.js — pure data tables and deterministic rules for Heroes V: creatures, spells,
// Haven town structures, hero progression, damage formulas, and army strength ratings.
// Contains no DOM or Babylon calls so tests run directly in Node.

/** @satisfies {Record<string, any>} */
const HeroesData = {
    MAX_SLOTS: 5,

    // Creature definitions across Haven, Necropolis and Inferno.
    UNITS: {
        peasant: {
            id: 'peasant',
            name: 'Ополченец',
            short: 'Ополч.',
            faction: 'haven',
            tier: 1,
            model: 'assets/models/character.glb',
            scale: 0.34,
            hp: 10,
            minDmg: 1,
            maxDmg: 2,
            atk: 2,
            def: 2,
            init: 8,
            speed: 4,
            shots: 0,
            growth: 18,
            cost: { gold: 35, crystal: 0 },
            power: 14,
            traits: ['taxpayer'],
            traitLabel: 'Налогоплательщик (+1 зол./день)',
        },
        archer: {
            id: 'archer',
            name: 'Арбалетчик',
            short: 'Арбал.',
            faction: 'haven',
            tier: 2,
            model: 'assets/models/unit_archer.glb',
            scale: 0.36,
            hp: 14,
            minDmg: 3,
            maxDmg: 5,
            atk: 5,
            def: 3,
            init: 10,
            speed: 4,
            shots: 12,
            growth: 10,
            cost: { gold: 85, crystal: 0 },
            power: 38,
            traits: ['ranged'],
            traitLabel: 'Стрелок (без штрафа вблизи)',
        },
        footman: {
            id: 'footman',
            name: 'Латник',
            short: 'Латник',
            faction: 'haven',
            tier: 3,
            model: 'assets/models/unit_footman.glb',
            scale: 0.38,
            hp: 32,
            minDmg: 5,
            maxDmg: 8,
            atk: 6,
            def: 9,
            init: 9,
            speed: 4,
            shots: 0,
            growth: 7,
            cost: { gold: 145, crystal: 0 },
            power: 72,
            traits: ['largeShield'],
            traitLabel: 'Большой щит (-35% от стрел)',
        },
        griffin: {
            id: 'griffin',
            name: 'Королевский Грифон',
            short: 'Грифон',
            faction: 'haven',
            tier: 4,
            model: 'assets/models/unit_griffin.glb',
            scale: 0.42,
            hp: 54,
            minDmg: 10,
            maxDmg: 15,
            atk: 9,
            def: 8,
            init: 13,
            speed: 7,
            shots: 0,
            growth: 4,
            cost: { gold: 340, crystal: 0 },
            power: 165,
            traits: ['fly', 'unlimitedRetal'],
            traitLabel: 'Полёт · Бесконечный отпор',
        },
        angel: {
            id: 'angel',
            name: 'Архангел',
            short: 'Арханг.',
            faction: 'haven',
            tier: 5,
            model: 'assets/models/unit_angel.glb',
            scale: 0.42,
            hp: 145,
            minDmg: 28,
            maxDmg: 36,
            atk: 15,
            def: 15,
            init: 14,
            speed: 8,
            shots: 0,
            growth: 2,
            cost: { gold: 1150, crystal: 1 },
            power: 520,
            traits: ['fly', 'noRetal', 'holy'],
            traitLabel: 'Полёт · Удар без ответа',
        },
        imp: {
            id: 'imp',
            name: 'Бес-квазит',
            short: 'Бесы',
            faction: 'inferno',
            tier: 1,
            model: 'assets/models/unit_imp.glb',
            scale: 0.38,
            hp: 8,
            minDmg: 1,
            maxDmg: 3,
            atk: 3,
            def: 2,
            init: 11,
            speed: 5,
            shots: 0,
            growth: 16,
            cost: { gold: 40, crystal: 0 },
            power: 15,
            traits: ['manaSteal', 'demon'],
            traitLabel: 'Похититель маны',
        },
        skeleton: {
            id: 'skeleton',
            name: 'Скелет-воин',
            short: 'Скелет',
            faction: 'necropolis',
            tier: 2,
            model: 'assets/models/unit_skeleton.glb',
            scale: 0.37,
            hp: 13,
            minDmg: 2,
            maxDmg: 4,
            atk: 4,
            def: 4,
            init: 10,
            speed: 4,
            shots: 0,
            growth: 14,
            cost: { gold: 55, crystal: 0 },
            power: 26,
            traits: ['undead', 'largeShield'],
            traitLabel: 'Нежить · Щит от стрел',
        },
        hellhound: {
            id: 'hellhound',
            name: 'Адская гончая',
            short: 'Гончая',
            faction: 'inferno',
            tier: 3,
            model: 'assets/models/unit_hellhound.glb',
            scale: 0.40,
            hp: 36,
            minDmg: 6,
            maxDmg: 11,
            atk: 8,
            def: 5,
            init: 13,
            speed: 7,
            shots: 0,
            growth: 6,
            cost: { gold: 190, crystal: 0 },
            power: 88,
            traits: ['noRetal', 'demon'],
            traitLabel: 'Стремительный укус без ответа',
        },
        demon: {
            id: 'demon',
            name: 'Пещерный владыка',
            short: 'Владыка',
            faction: 'inferno',
            tier: 5,
            model: 'assets/models/unit_demon.glb',
            scale: 0.42,
            hp: 125,
            minDmg: 22,
            maxDmg: 32,
            atk: 14,
            def: 13,
            init: 11,
            speed: 6,
            shots: 0,
            growth: 2,
            cost: { gold: 1050, crystal: 1 },
            power: 430,
            traits: ['demon'],
            traitLabel: 'Карающий клинок Бездны',
        },
    },

    HAVEN_RECRUITS: ['peasant', 'archer', 'footman', 'griffin', 'angel'],

    // Spells of Light and Destructive Magic (HoMM5 spellbook).
    SPELLS: [
        {
            id: 'smite',
            name: 'Карающий Свет',
            mana: 5,
            target: 'enemy',
            desc: 'Святой луч по врагу (+35% по нежити и демонам)',
            calcPower(sp) { return Math.round(22 + 16 * sp); },
        },
        {
            id: 'bless',
            name: 'Божественная Сила',
            mana: 4,
            target: 'ally',
            desc: 'Отряд бьёт макс. уроном и получает +3 к Атаке (3 хода)',
            calcPower(sp) { return 3 + Math.floor(sp / 4); },
        },
        {
            id: 'stoneskin',
            name: 'Щит Света',
            mana: 5,
            target: 'ally',
            desc: '+6 к Защите и -20% получаемого урона (3 хода)',
            calcPower(sp) { return 3 + Math.floor(sp / 4); },
        },
        {
            id: 'fireball',
            name: 'Огненный Шар',
            mana: 9,
            target: 'cell',
            desc: 'Взрыв пламени в квадрате 3×3 по всем целям',
            calcPower(sp) { return Math.round(24 + 17 * sp); },
        },
        {
            id: 'resurrect',
            name: 'Воскрешение',
            mana: 11,
            target: 'ally',
            desc: 'Исцеляет и возвращает павших бойцов отряда в строй',
            calcPower(sp) { return Math.round(38 + 26 * sp); },
        },
    ],

    // Haven Town buildings (1 construction per day).
    BUILDINGS: [
        {
            id: 'hall',
            name: 'Магистрат',
            desc: 'Доход замка: 1250 золота/день',
            req: '',
            cost: { gold: 1000, wood: 2, ore: 2, crystal: 0 },
        },
        {
            id: 'capitol',
            name: 'Капитолий',
            desc: 'Доход замка: 2500 золота/день',
            req: 'hall',
            cost: { gold: 2600, wood: 5, ore: 5, crystal: 1 },
        },
        {
            id: 'citadel',
            name: 'Цитадель',
            desc: '+50% к недельному приросту всех войск',
            req: '',
            cost: { gold: 1600, wood: 3, ore: 6, crystal: 0 },
        },
        {
            id: 'mage_guild',
            name: 'Гильдия Магов',
            desc: 'Все заклинания + полное восстановление маны',
            req: '',
            cost: { gold: 1400, wood: 4, ore: 4, crystal: 2 },
        },
        {
            id: 'barracks',
            name: 'Стрелковая Башня',
            desc: 'Открывает найм: Арбалетчики (Ур. 2)',
            req: '',
            cost: { gold: 850, wood: 4, ore: 2, crystal: 0 },
            unlockUnit: 'archer',
        },
        {
            id: 'armory',
            name: 'Оружейная Палата',
            desc: 'Открывает найм: Латники (Ур. 3)',
            req: 'barracks',
            cost: { gold: 1350, wood: 3, ore: 5, crystal: 0 },
            unlockUnit: 'footman',
        },
        {
            id: 'griffin_tower',
            name: 'Бастион Грифонов',
            desc: 'Открывает найм: Королевские Грифоны (Ур. 4)',
            req: 'armory',
            cost: { gold: 2100, wood: 5, ore: 5, crystal: 2 },
            unlockUnit: 'griffin',
        },
        {
            id: 'altar_light',
            name: 'Алтарь Света',
            desc: 'Открывает найм: Архангелы (Ур. 5)',
            req: 'griffin_tower',
            cost: { gold: 3400, wood: 7, ore: 7, crystal: 4 },
            unlockUnit: 'angel',
        },
    ],

    // Hero level-up perk options.
    PERKS: [
        { id: 'might', title: '⚔ Военное искусство (+2 Атака, +1 Защита)', apply(h) { h.atk += 2; h.def += 1; } },
        { id: 'bastion', title: '🛡 Несокрушимый бастион (+3 Защита)', apply(h) { h.def += 3; } },
        { id: 'magic', title: '✨ Магия Света (+2 Колдовство, +1 Знание)', apply(h) { h.sp += 2; h.know += 1; h.mana += 10; } },
        { id: 'wisdom', title: '📖 Тайное Знание (+2 Знание, +20 Маны)', apply(h) { h.know += 2; h.mana += 20; } },
        { id: 'logistics', title: '🐎 Логистика Асхана (+4 Очка хода, +1 Атака)', apply(h) { h.moveBonus = (h.moveBonus || 0) + 4; h.movePts += 4; h.atk += 1; } },
        { id: 'leadership', title: '👑 Лидерство (+1 Боевой дух, +1 Удача, +1 Защита)', apply(h) { h.morale += 1; h.luck += 1; h.def += 1; } },
    ],

    getSpell(id) {
        return this.SPELLS.find(s => s.id === id) || null;
    },

    getBuilding(id) {
        return this.BUILDINGS.find(b => b.id === id) || null;
    },

    hasTrait(unitId, trait) {
        const u = this.UNITS[unitId];
        return !!(u && u.traits && u.traits.includes(trait));
    },

    // XP needed to reach the NEXT level from `level` (1 -> 1000, 2 -> 2200, 3 -> 3800...).
    xpForNextLevel(level) {
        const lv = Math.max(1, Math.floor(level));
        return Math.round(1000 * lv + 250 * (lv - 1) * lv);
    },

    maxMana(hero) {
        return Math.max(10, (hero.know || 1) * 10);
    },

    maxMovePoints(hero, baseMove) {
        const b = baseMove || (typeof HEROES_HERO_MOVE_PTS !== 'undefined' ? HEROES_HERO_MOVE_PTS : 22);
        return b + (hero.moveBonus || 0);
    },

    // Town daily gold from built structures.
    townDailyGold(built) {
        if (built && built.capitol) return 2500;
        if (built && built.hall) return 1250;
        return 500;
    },

    canAfford(res, cost) {
        return (res.gold || 0) >= (cost.gold || 0) &&
            (res.wood || 0) >= (cost.wood || 0) &&
            (res.ore || 0) >= (cost.ore || 0) &&
            (res.crystal || 0) >= (cost.crystal || 0);
    },

    spend(res, cost) {
        res.gold -= cost.gold || 0;
        res.wood -= cost.wood || 0;
        res.ore -= cost.ore || 0;
        res.crystal -= cost.crystal || 0;
    },

    // Merge `count` of `unitId` into an army array (max 5 slots). Returns true if added.
    addUnitsToArmy(army, unitId, count) {
        if (!count || count <= 0 || !this.UNITS[unitId]) return false;
        const existing = army.find(s => s && s.id === unitId && s.count > 0);
        if (existing) {
            existing.count += count;
            return true;
        }
        const emptyIdx = army.findIndex(s => !s || s.count <= 0);
        if (emptyIdx >= 0) {
            army[emptyIdx] = { id: unitId, count };
            return true;
        }
        if (army.length < this.MAX_SLOTS) {
            army.push({ id: unitId, count });
            return true;
        }
        return false;
    },

    armyPower(army, hero) {
        let sum = 0;
        for (const s of (army || [])) {
            if (!s || s.count <= 0) continue;
            const u = this.UNITS[s.id];
            if (u) sum += u.power * s.count;
        }
        if (hero) {
            const mult = 1 + 0.04 * ((hero.atk || 0) + (hero.def || 0)) + 0.03 * (hero.sp || 0);
            sum = Math.round(sum * mult);
        }
        return sum;
    },

    // HoMM5 stack size word ("Мало", "Отряд", "Толпа", "Орда", "Легион").
    stackSizeWord(count) {
        if (count < 5) return 'Несколько';
        if (count < 10) return 'Мало';
        if (count < 20) return 'Отряд';
        if (count < 50) return 'Толпа';
        if (count < 100) return 'Орда';
        return 'Легион';
    },

    // Threat assessment comparing player army power to guard army power.
    threatLabel(playerPower, enemyPower) {
        if (enemyPower <= 0) return 'Без охраны';
        const r = playerPower / Math.max(1, enemyPower);
        if (r >= 2.0) return 'Легко';
        if (r >= 1.25) return 'Умеренно';
        if (r >= 0.85) return 'Риск';
        return 'Смертельно';
    },

    // HoMM5 Damage calculation between attacker stack and defender stack.
    // opts: { roll?: 0..1, rangedShot?: boolean, meleePenalty?: boolean, luck?: boolean }
    // Returns { damage, minDamage, maxDamage, kills }.
    calcStackDamage(attacker, defender, atkHero, defHero, opts) {
        const o = opts || {};
        const uA = this.UNITS[attacker.id];
        const uD = this.UNITS[defender.id];
        if (!uA || !uD || attacker.count <= 0) {
            return { damage: 0, minDamage: 0, maxDamage: 0, kills: 0 };
        }

        const effAtk = uA.atk + (atkHero ? atkHero.atk || 0 : 0) + (attacker.buffBless ? 3 : 0);
        const effDef = uD.def + (defHero ? defHero.def || 0 : 0) +
            (defender.buffShield ? 6 : 0) + (defender.defending ? Math.max(2, Math.round(uD.def * 0.3)) : 0);

        // HoMM5 Attack vs Defense modifier: +5% per point above defense (up to 3.0x),
        // or 1 / (1 + 0.05 * diff) when defense exceeds attack (down to 0.3x).
        const diff = effAtk - effDef;
        const statMult = diff >= 0
            ? Math.min(3.0, 1 + 0.05 * diff)
            : Math.max(0.3, 1 / (1 - 0.05 * diff));

        let tacticMult = 1;
        if (o.meleePenalty) tacticMult *= 0.5;
        if (o.rangedShot && this.hasTrait(defender.id, 'largeShield')) tacticMult *= 0.65;
        if (defender.buffShield) tacticMult *= 0.80;
        if (this.hasTrait(attacker.id, 'holy') && (this.hasTrait(defender.id, 'demon') || this.hasTrait(defender.id, 'undead'))) {
            tacticMult *= 1.25;
        }
        if (o.luck) tacticMult *= 1.5;

        const minRaw = Math.max(1, Math.round(attacker.count * uA.minDmg * statMult * tacticMult));
        const maxRaw = Math.max(minRaw, Math.round(attacker.count * uA.maxDmg * statMult * tacticMult));

        let dmg;
        if (attacker.buffBless) {
            dmg = maxRaw;
        } else {
            const roll = o.roll != null ? o.roll : 0.5;
            dmg = Math.round(minRaw + (maxRaw - minRaw) * Math.max(0, Math.min(1, roll)));
        }

        const totalBefore = (defender.count - 1) * uD.hp + defender.topHp;
        const totalAfter = Math.max(0, totalBefore - dmg);
        const aliveAfter = totalAfter > 0 ? Math.ceil(totalAfter / uD.hp) : 0;
        const kills = Math.max(0, defender.count - aliveAfter);

        return { damage: dmg, minDamage: minRaw, maxDamage: maxRaw, kills };
    },

    // Apply `dmg` to a combat stack { id, count, topHp, startCount } and return actual casualties.
    applyDamageToStack(stack, dmg) {
        const u = this.UNITS[stack.id];
        if (!u || stack.count <= 0 || dmg <= 0) return { damage: 0, kills: 0 };
        const beforeCount = stack.count;
        const totalBefore = (stack.count - 1) * u.hp + stack.topHp;
        const totalAfter = Math.max(0, totalBefore - Math.round(dmg));
        if (totalAfter <= 0) {
            stack.count = 0;
            stack.topHp = 0;
            return { damage: totalBefore, kills: beforeCount };
        }
        stack.count = Math.ceil(totalAfter / u.hp);
        stack.topHp = totalAfter - (stack.count - 1) * u.hp;
        return { damage: Math.round(dmg), kills: beforeCount - stack.count };
    },

    // Apply resurrection/healing `healHp` to an allied stack up to its `startCount`.
    applyResurrectToStack(stack, healHp) {
        const u = this.UNITS[stack.id];
        if (!u || healHp <= 0) return { healed: 0, revived: 0 };
        const capCount = Math.max(stack.count, stack.startCount || stack.count);
        const maxPool = capCount * u.hp;
        const beforeCount = stack.count;
        const totalBefore = stack.count > 0 ? (stack.count - 1) * u.hp + stack.topHp : 0;
        const totalAfter = Math.min(maxPool, totalBefore + Math.round(healHp));
        stack.count = Math.max(1, Math.ceil(totalAfter / u.hp));
        stack.topHp = totalAfter - (stack.count - 1) * u.hp;
        return { healed: totalAfter - totalBefore, revived: Math.max(0, stack.count - beforeCount) };
    },

    // Hero direct sideline strike damage (free action in HoMM5, scales with level and Attack).
    calcHeroStrikeDamage(hero) {
        const lv = Math.max(1, hero.level || 1);
        return Math.round(14 + lv * 9 + (hero.atk || 1) * 5);
    },
};
