// FSRequisitionCatalog.js — the three hidden-draft suits and their Blitz cards.
//
// The source files in "Warhammer/Блитц - Requisition" name the suits in the
// rules and group the six cards in "Колоды 1–3". The groups map as follows:
// 1 — Authority, 2 — Reconnaissance, 3 — Command.
// Cards stay face down through the complete draft; these records are shown only
// after a player reveals one during tile setup.

const FS_REQUISITIONS = {
    suits: [
        { id: 'authority', name: 'Authority', translation: 'Власть', deck: 1,
            description: 'ресурсы и постройки', cards: ['supplies', 'salvage', 'populous', 'fortified', 'industrious', 'efficient'] },
        { id: 'reconnaissance', name: 'Reconnaissance', translation: 'Разведка', deck: 2,
            description: 'манёвры и вмешательство', cards: ['skirmish', 'astronomic-flux', 'strike-force', 'rescue', 'holdfields', 'prepare'] },
        { id: 'command', name: 'Command', translation: 'Командование', deck: 3,
            description: 'войска и подкрепления', cards: ['recruits', 'detachment', 'battalion', 'blockade', 'veterancy', 'armada'] },
    ],
    cards: [
        { id: 'supplies', name: 'Supplies', suit: 'authority', effect: 'materiel', amount: 4,
            text: 'Получите 4 материи.' },
        { id: 'salvage', name: 'Salvage', suit: 'authority', effect: 'asset', asset: 'forge', amount: 2,
            text: 'Получите 2 жетона кузницы из запаса.' },
        { id: 'populous', name: 'Populous', suit: 'authority', effect: 'structure', structure: 'city',
            text: 'Поставьте 1 бесплатный город на мир активной системы.' },
        { id: 'fortified', name: 'Fortified', suit: 'authority', effect: 'structure', structure: 'bastion',
            text: 'Поставьте 1 бесплатный бастион на мир активной системы.' },
        { id: 'industrious', name: 'Industrious', suit: 'authority', effect: 'structure', structure: 'factory',
            text: 'Поставьте 1 бесплатную фабрику на мир активной системы.' },
        { id: 'efficient', name: 'Efficient', suit: 'authority', effect: 'efficient',
            text: 'Бесплатно приобретите улучшение уровня командования 0 и положите любой жетон приказа на верх своей колоды событий.' },

        { id: 'skirmish', name: 'Skirmish', suit: 'reconnaissance', effect: 'rout',
            text: 'Деморализуйте все отряды в одной области враждебной системы, соседней с этой.' },
        { id: 'astronomic-flux', name: 'Astronomic Flux', suit: 'reconnaissance', effect: 'swap',
            text: 'После размещения этой системы обменяйте её местами с любой одной соседней системой.' },
        { id: 'strike-force', name: 'Strike Force', suit: 'reconnaissance', effect: 'unit', kl: 0, unitType: 'ground', target: 'uncontrolled-hostile-world',
            text: 'Поставьте 1 бесплатный отряд уровня командования 0 на неконтролируемый мир во враждебной системе.' },
        { id: 'rescue', name: 'Rescue', suit: 'reconnaissance', effect: 'unit', kl: 2, unitType: 'ground', routed: true, target: 'unoccupied-hostile-world',
            text: 'Поставьте 1 бесплатный деморализованный отряд уровня командования 2 на незанятый мир во враждебной системе.' },
        { id: 'holdfields', name: 'Holdfields', suit: 'reconnaissance', effect: 'holdfields',
            text: 'В течение первого раунда ни один игрок не может выбирать ваши дружественные миры целью орбитального удара.' },
        { id: 'prepare', name: 'Prepare', suit: 'reconnaissance', effect: 'prepare',
            text: 'Выберите 1 свою карту событий и положите её на верх своей колоды событий. В течение первого раунда не перемешивайте колоду событий перед добором и разрешением карт событий.' },

        { id: 'recruits', name: 'Recruits', suit: 'command', effect: 'asset', asset: 'reinforcement', amount: 3,
            text: 'Получите 3 жетона подкрепления из запаса.' },
        { id: 'detachment', name: 'Detachment', suit: 'command', effect: 'unit', kl: 1, unitType: 'ground', target: 'active-world',
            text: 'Поставьте 1 бесплатный отряд уровня командования 1 на мир активной системы.' },
        { id: 'battalion', name: 'Battalion', suit: 'command', effect: 'unit-pair', kl: 0, unitType: 'ground', target: 'active-world', sameArea: true,
            text: 'Поставьте 2 бесплатных отряда уровня командования 0 на один мир активной системы.' },
        { id: 'blockade', name: 'Blockade', suit: 'command', effect: 'unit-pair', kl: 0, unitType: 'ship', target: 'active-void', differentAreas: true,
            text: 'Поставьте по 1 бесплатному отряду уровня командования 0 в две разные области пустоты активной системы.' },
        { id: 'veterancy', name: 'Veterancy', suit: 'command', effect: 'combat-upgrade', kl: 0,
            text: 'Бесплатно приобретите боевую карту улучшения уровня командования 0.' },
        { id: 'armada', name: 'Armada', suit: 'command', effect: 'unit', kl: 2, unitType: 'ship', target: 'active-void',
            text: 'Поставьте 1 бесплатный отряд уровня командования 2 в пустоту активной системы.' },
    ],

    card(id) {
        return this.cards.find(card => card.id === id) || null;
    },
    suit(id) {
        return this.suits.find(suit => suit.id === id) || null;
    },
    cardsIn(suitId) {
        const suit = this.suit(suitId);
        return suit ? suit.cards.map(id => this.card(id)).filter(Boolean) : [];
    },
};
