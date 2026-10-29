# Forbidden Stars — Rules Reference (transcription)

Текст правил, извлечённый из `Warhammer/Forbidden Stars - Rules Reference.pdf` (16 страниц,
FFG, 2015). Это дословный текст из текстового слоя PDF: слова, нумерация и формулировки
сохранены, ничего не переписано «по памяти». Разбивка на разделы и списки восстановлена
автоматически (PDF — двухколоночный, поэтому в паре мест абзацы пришлось переставить вручную;
такие места отмечены `<!-- column fix -->`).

**Язык.** Текст оставлен на английском: это первоисточник и единственная версия правил, по
которой можно сверять спорные случаи. Русские материалы (планшеты фракций, карты) — в других
файлах этой папки.

**Иконки.** В PDF иконки набраны шрифтом, поэтому в текстовом слое они превратились в буквы:

| Буква в тексте | Что это на самом деле | Как это записано в `04-combat-cards.md` |
|---|---|---|
| `B`, `D`, `C` | иконки на боевых кубиках (наступление / оборона / мораль) | `att. cube`, `def. cube`, `morale cube` |
| `A`, `E` | жетоны боя (наступление / оборона) | `att. token`, `def. token` |
| `V` | «пустой» кубик: взять кубик из запаса и бросить его | `any cube` |

Буквы — это **код текстового слоя PDF**, а не обозначение для людей: в `04` те же иконки пишутся
словами (`att.` / `def.` / `morale` без рамки — вклад самой карты).

Пустые места в формулах («number of his  icons on his dice») — это те же иконки, выпавшие из
текстового слоя.

**Что дальше в папке:** `README.md` — что где лежит и статус переноса; `02-factions.md` — 12
фракций; `03-systems.md` — тайлы систем; `04-combat-cards.md`, `05-order-upgrades.md`,
`06-events.md` — карты; `07-tokens.md` — жетоны и кубики; `08-models.md` — 3D-модели.

---

## Using This Reference

This glossary lists all the gameplay terms and rules in detail. If you are unable to find a topic in this glossary, check the index on page 15.


### Active Player

The active player is the player currently placing an order token, resolving an order token, resolving an event card, or moving a Warp Storm.

*Related Topics: Active System*


### Active System

The active system is the system in which an order token was last revealed.

*Related Topics: Order Token*


### Adjacency

A gold border surrounds each area as well as each system tile. These borders define the boundaries of each system and area and also define adjacency, as follows:
- Two systems are adjacent if they share a gold border.
- Two areas are adjacent if they share a gold border.
- Systems that only share the corner of a border are not adjacent.
- Areas that are connected by only an order token box or the corner of a border are not adjacent.


*Related Topics: Advance Order, Areas, System, Warp Storms*


### Advance Order

The Advance Order is one of Forbidden Stars’ primary orders. By resolving an Advance Order, a player can move units and start combats. To resolve an Advance Order, the active player follows these steps:

1. Move Ships: The active player may move ships to any voids in the active system. These units can move from voids in the active system and/or one adjacent system. Each ship’s starting void and destination void do not need to be adjacent.

2. Move Ground Units: The active player may move ground units to any worlds in the active system connected by a legal path (see “Moving Ground Units” on page 8). These units can move from worlds in the active system and/or one adjacent system.

3. Resolve Combat: The active player resolves a combat if there is a contested area. If there is no contested area, he may resolve an orbital strike instead.


There are a number of additional exceptions and clarifications:
- If the player moved any ships from an adjacent system during this order, he cannot move ground units from a different adjacent system.
- If the active player moves units into an area that contains an opponent’s units or structures, that area becomes contested. Only one area can become contested during a single Advance Order.
- The active player can exceed each area’s unit capacity while resolving an Advance Order, but can never end the movement with more than five units in a single area.
  - After resolving an order, including any combat resolved during that order, players must destroy any of their units that are in excess of an area’s unit capacity.
- There are additional rules and restrictions for moving units (see “Moving Ground Units” on page 8, and “Moving Ships” on page 9).

### Using This Reference

This document provides players with a detailed reference for all game rules. The majority of this Rules Reference is the glossary which provides players with detailed rules and clarifications listed in alphabetical order by topic. Following the glossary is an index that provides a comprehensive list of each topic and its corresponding page number. The back of this rulebook has a quick reference to the steps of a round and some clarifications for card abilities.


### Stop!

This Rules Reference does not teach players how to play Forbidden Stars. It is recommended that players first read the Learn to Play booklet, then use this Rules Reference as needed when playing the game.


### The Golden Rules

The golden rules are fundamental concepts on which all other game rules are built.
- The Rules Reference is the definitive source for all rules information. If something in this document contradicts information from the Learn to Play booklet, this Rules Reference takes precedence.
- If the rules text on a card or faction sheet contradicts information from the Rules Reference, the rules on the card or sheet takes precedence.
- If a card uses the word “cannot,” that effect is absolute.


### Areas

Each system is divided into four areas which are separated from each other by gold borders.
- Each area is either a world or a void. A world contains an image of a planet accompanied by a banner, and a void contains an image of a star field without a banner.
- An area exists in one of four states, as follows:
  - Friendly: An area is friendly to a player if it contains at least one of his units or structures and none of his opponent’s units or structures.
  - Enemy: An area is enemy to a player if it contains at least one of an opponent’s units or structures and none of his own units or structures.
  - Uncontrolled: An uncontrolled area is any area that does not contain any units or structures from any faction; it may contain an objective token.
  - Contested: A contested area is any area that contains units or structures belonging to two factions. An area becomes contested whenever units are moved or placed onto an enemy area.


*Related Topics: Assets, Contested Area, Unit Capacity, Materiel*


### Assets

Some worlds have asset icons on their banners. When a player resolves a Dominate Order, he gains the assets that correspond to the asset icons on each friendly world in the active system.
- Below is a list of asset icons and instructions for how to resolve them.: Gain one forge token from the supply.: Gain one cache token from the supply.: Gain one reinforcement token from the supply.: Gain one asset token of the player’s choice.
- A player cannot have more than three of each asset token. If a game effect allows a player to gain an asset token but he already has three of that token, he does not gain the token.


*Related Topics: Areas, Cache Tokens, Dominate Order, Forge Tokens, Reinforcement Tokens*


### Attacker

See “Combat” on page 4 and “Orbital Strike” on page 9.


### Bastions

A bastion is a structure that a player can purchase to provide a defence bonus to the world on which it is placed.
- A bastion has a health value, a combat value, and a morale value printed on each faction sheet. If a bastion is present during a combat, use these values as if it were a unit.
- Players use structure control markers to identify which bastions belong to which players.
- A world with a bastion cannot be the target of an orbital strike.
- If the active player moves one or more units to a world that contains an opponent’s bastion, that area is contested and he must resolve a combat, even if there are no defending units. That is, a bastion can defend a world on its own.
- Bastions are not units and therefore cannot be targeted by effects that refer to units.
- Bastions cannot be routed nor can they retreat.
- When the attacker wins a battle, he takes control of all structures remaining on the world, including all bastions.


*Related Topics: Combat, Deploy Order, Orbital Strike, Structure*


### Borders

See “Adjacency” on page 2.


### Cache Tokens

Cache tokens are assets that players can gain.
- When purchasing a unit or structure, a player may spend one cache token to temporarily reduce the materiel cost of that unit or structure by two.
  - This reduction applies only to one unit or structure—if a player wants to purchase multiple units or structures at a reduced cost, he must spend multiple cache tokens.
  - A player cannot spend more than one cache token to reduce the cost of a single unit or structure.
- When a player resolves a Dominate Order, he gains one cache token for each cache asset icon on friendly worlds in the active system. He takes the token from the supply and places it in his play area.
- Cache tokens cannot be spent to reduce the cost of upgrade cards.


*Related Topics: Assets, Cost, Deploy Order, Dominate Order*


### Cities

A city is a structure that a player can purchase to increase his command level.
- Each city that a player has on the game board increases his command level by one, allowing him to purchase higher level units and upgrades.
- Players use structure control markers to identify which cities belong to which players.


*Related Topics: Command Level, Deploy Order, Structures*


### Combat

When an area becomes contested, a combat occurs. Most combats occur after a player resolves an Advance Order; however, some game effects such as card and faction abilities can cause an area to become contested as well.
- During a combat, the player who moved units into the contested area is the attacker and the player who previously had units in the contested area is the defender.
- If all units and bastions belonging to one player are destroyed during combat, players resolve the rest of the execution round, and then proceed to the resolution step. The player with units remaining in the area is the winner of the combat.
- If the defender does not have unrouted units or bastions in the area at the start of a combat, the attacker immediately wins the combat. Players skip the preparation and execution steps and move directly to substep b) of the resolution step.
- A contested area cannot contain more than five attacking units at the start of combat.
- Each player can have a maximum of eight dice during each combat. If he is at this limit, he can only gain additional dice if he loses or spends one of his dice. To resolve a combat, players follow these steps:

1. Preparation: During preparation, players follow these substeps:

a. Roll Dice: Both the attacker and defender each roll a number of dice equal to the combined combat value of all of his unrouted units in the combat. Each player organizes his rolled dice into groups of like icons so that his opponent can easily evaluate his results.

b. Draw Combat Cards: Each player draws five combat cards from the top of his combat deck.

c. Reinforce: The attacker first decides how many of his reinforcement tokens to use, then the defender decides how many reinforcement tokens to use (see “Reinforcement Tokens” on page 11).

2. Execution: Players resolve three execution rounds. Each round consists of the following substeps:

a. Choose Combat Cards: The attacker and defender simultaneously choose one combat card from their hands and place it facedown in front of them.

b. Resolve Combat Cards: The attacker reveals and resolves his combat card. Then, the defender reveals and resolves his combat card.

c. Assess Damage: Both players calculate their total offence value and their total defence value, as follows: Offence Value: A player determines his offence value by adding the number of his icons on his dice, his combat tokens, and his faceup combat cards played during this execution round and the previous execution rounds. Defence Value: A player determines his defence value by adding the number of his icons on his dice, his combat tokens, and his faceup combat cards played during this round and the previous rounds of combat. Starting with the attacker, both players in the combat suffer damage equal to the difference of his opponent’s offence value and his own defence value. After both players have suffered damage, if only one player has units and/or bastions remaining in the area, he wins the combat and proceeds to the “Capture Structures” step of resolution.

3. Resolution: During resolution, players follow these substeps:

a. Determine Winner: Each player calculates his morale value by adding the number of his icons on his dice, unrouted units, bastions, and faceup combat cards that he played during the combat. The player with the highest morale value wins the combat and his opponent must retreat all of his units. If players’ morale totals are tied, the defender wins the combat and the attacking units must retreat.

b. Capture Structures: If the attacker wins the combat, he takes control of any structures on the world by removing his opponent’s control tokens and replacing them with his own.

c. Clean Up: Each player returns any reinforcement tokens he used during the combat to the supply and discards the combat cards he used during the combat by shuffling them back into his combat deck. Combat ends after resolving this substep.


*Related Topics: Combat Card Resolution, Combat Cards and Upgrade Cards, Combat Icons, Contested Areas, Damage and Health, Retreats, Routed Units, Structures, Suffering Damage*


### Combat Card Resolution

During a combat, each player draws five cards from his combat deck. Each player will resolve up to three of those cards during that combat.
- Each combat card has two ability boxes at the bottom of the card. The general ability box is green, and the unit ability box is brown.
  - When resolving a combat card, the player first resolves all abilities in the general ability box, then all abilities in the unit ability box. He resolves each ability in the order in which it is listed, from top to bottom.
  - A player can choose not to resolve one of his abilities, unless that ability uses the word must.
  - Each paragraph is a separate ability. If a player chooses to resolve an ability, he must resolve all of it.
  - When a combat card ability presents a choice, the owner of the combat card makes all decisions presented unless otherwise specified.
- Each unit ability denotes one or more units that a player must have in the combat to trigger the ability.
  - From among the listed units, the player needs only one unit to be present in the combat to trigger a card’s unit ability.
  - A unit used to meet this requisite must be unrouted; a player cannot use a routed unit to meet a requisite.
  - Unit abilities often abbreviate the unit’s name to fit the text on the card. For example, Hellebore Frigates are abbreviated on cards as “Frigate.”
  - After an ability is resolved, the requisite is not checked again. For example, if an ability lasts until the end of the combat, it will persist even if all required units are destroyed.
  - If an effect forces a player to discard a faceup combat card, the player can no longer use any of the card’s abilities. He cannot use the abilities even if they normally last until the end of the combat or execution round.
- Played combat cards are not discarded at the end of an execution round, but stay in play until the end of combat.
- Most combat cards have one or more combat icons arranged vertically along the left side of the card. These combat icons are used when determining a player’s offence, defence, and morale values.
  - Combat icons persist until the end of the combat unless the card is discarded. For example, a card played in the first execution round contributes its icons during all three execution rounds and during the resolution step.
  - If an effect forces a player to discard a faceup combat card, the player can no longer use the combat icons on that card.
  - Combat icons on combat cards are unaffected by abilities that specifically affect dice or require a player to spend dice.
- Some combat card abilities provide players with combat tokens, which are presented on cards as combat icons enclosed in circles (A and E). When a player gains a A or E, he takes a combat token from the supply and places it with the appropriate side faceup near his dice. The icons on these tokens are counted when calculating offence or defence values, but the tokens are returned to the supply at the end of each execution round.
  - Combat tokens are unaffected by abilities that specifically affect dice or require a player to spend dice.
- When a combat card refers to a unit, that unit must be in the contested area unless specifically stated otherwise.


*Related Topics: Combat, Combat Cards and Combat Upgrade Cards, Combat Icons, Component Limitations*


### Combat Cards And Combat Upgrade Cards

Each player has a combat deck comprised of ten combat cards. During a combat, each player draws five cards from his combat deck and uses them to resolve special abilities and gain combat icons.
- Each faction’s combat deck consists of ten combat cards. At the start of the game, each combat deck is comprised of the ten combat cards that have the faction’s icon printed in the upper-left corner.
- When a player purchases a combat upgrade card, he chooses and removes two copies of any card from his combat deck and replaces them with both copies of the purchased upgrade card.
- A player must shuffle his combat deck both at the end of combat and after combat upgrade cards are added to the deck.
- A player cannot purchase a combat upgrade card that has a command level greater than his current command level.
- When a player removes a card from his combat deck, he places it back in his upgrade deck.
  - If a player wishes to purchase basic combat cards that he previously removed from his combat deck, he may do so at a cost of zero materiel.
- Icons and abilities found on combat upgrade cards are resolved during combat as described in the “Combat Card Resolution” section on page 4.
- The unit ability box (brown) on each combat card has requisites presented in italics before the ability. These requisites denote one or more units. To resolve a unit ability, the player must have at least one of the specified units in the combat and at least one of those units must be unrouted; a routed unit cannot be used to fulfil a requisite.


*Related Topic: Combat, Combat Card Resolution, Combat Icons, Strategize Order*


### Combat Icons

There are three combat icons: offence ( ), defence ( ), and morale ( ). These icons appear on dice and combat cards. Additionally, the offence and defence icons appear on combat tokens. Players use these icons to determine offence, defence, and morale values during a combat.

*Related Topics: Combat, Combat Cards and Combat Upgrade Cards, Gaining and Losing*


### Command Level

A player’s command level is equal to the number of cities he controls on the game board. A high command level allows a player to purchase a broader range of units and upgrade cards.
- Each unit has a command level requirement presented to the left of the image of that unit on its corresponding faction sheet.
- Each upgrade card has a command level requirement listed in the upper-left corner of the card above its materiel cost.
- A player cannot purchase a unit or an upgrade whose command level requirement exceeds his command level.
- At the start of the game, each player’s command level is zero.
- If a player’s command level is reduced, any unit or upgrade cards that he has already purchased remain in play.


*Related Topics: Combat Cards and Combat Upgrade Cards, Cities, Deploy Order, Forge Tokens, Order Upgrade Cards*


### Component Limitations

Components are limited to the number included in the game. If a player needs to use a component but none are available, he cannot use that component. Combat tokens are an exception to this rule —combat tokens are unlimited.
- If a player needs a structure control token and one is not available, he cannot build additional structures.
  - If a player would acquire a new structure by winning a combat but he does not have an available structure control token, that structure is immediately destroyed.
- Each player cannot have more than eight dice during a combat If a player is allowed to roll more than eight dice at the start of combat, he rolls eight dice instead.
  - If an ability allows a player to gain a die in excess of this limit, he cannot roll the additional die.
- If a player needs to gain a combat token but one is not available, he can use another available marker to track this until the end of the execution round.


*Related Topics: Gaining and Losing*


### Contested Areas

A contested area is any area that contains units or structures belonging to two different factions.
- Typically, an area becomes contested when a player resolves an Advance Order. It is possible for game effects such as card and faction abilities to force an area to become contested.
- When resolving an Advance Order, a player cannot move units in such a way that more than one area becomes contested.
- After resolving an Advance Order or a game effect that causes an area to become contested, the players who control the units or structures in the contested area must resolve a combat.


*Related Topics: Areas, Advance Order, Combat*


### Convert

Some cards allow players to convert a die icon into another die icon. To resolve this effect, the player picks up one die with the indicated icon, and places it with the new icon faceup.

*Related Topics: Combat, Orbital Strike*


### Cost

Each unit, structure, and upgrade card has a materiel cost that a player must spend to purchase the unit, structure, or card.
- The costs of units and structures are indicated on each player’s faction sheet.
- The cost of each upgrade card is presented before a green gear in the upper-left corner of that card.
- Some units have the additional cost of one forge token. Such a cost is represented by a forge icon below a unit’s materiel cost on each player’s faction sheet.
- Some units and upgrade cards have a command level restriction in addition to the cost. This restriction can prevent the player from purchasing the unit or upgrade even if he has enough materiel to pay its cost.


*Related Topics: Cache Tokens, Command Level, Deploy Order, Forge Tokens, Spend, Strategize Order*


### Damage And Health

Players assign damage to units and bastions during combat and orbital strikes. If a unit or bastion ever suffers an amount of damage that equal to its health value, that unit or bastion is destroyed.
- Each player’s faction sheet lists the health values of his units and bastions.
- When a player assigns damage, he chooses one of his bastions or any one of his unrouted units in the combat to suffer the damage.
  - A player can assign damage to routed units only if all of his units in the combat are routed and he does not have a bastion in the combat.
- If the damage suffered equals or exceeds the chosen unit’s or chosen bastion’s health value, that unit or bastion is destroyed and removed from the game board.
  - Any damage that exceeds a unit’s or bastion’s health value must be applied to one of his other units or bastions.
  - Players repeat the process of suffering damage until either no more damage remains or no more units or bastions remain.
- If a unit suffers damage and is not destroyed, that unit is routed.
  - If the unit is already routed, there is no effect.
  - Damage suffered by a unit or bastion only persists until the end of the execution round. It does not carry over to future execution rounds or future combats.
- If a bastion suffers damage and is not destroyed, the bastion is not routed and that damage is ignored.
- Any units that suffer damage during an orbital strike but are not destroyed, are not routed. The damage is ignored.


*Related Topics: Bastion, Combat, Destroy, Orbital Strike, Rout and Rally, Unit*


### Defender

See “Combat” on page 4 or “Orbital Strike” on page 9.


### Deploy Order

Players use Deploy Orders to purchase new units and structures. To resolve this order, players follow these steps in order:

1. Purchase Units: If the active player has a factory in the active system, he may purchase units and place them on any friendly or uncontrolled areas in that system.
  - The maximum number of units that a player can purchase when resolving each Deploy Order is equal to his deploy limit in the active system. A player’s deploy limit is equal to the combined unit capacity from all friendly worlds in the active system that contain a factory.

2. Purchase Structure: The active player may purchase one structure and place it on a friendly world in the active system.
  - A player cannot purchase more than one structure while resolving a single Deploy Order.
  - A world cannot contain more than one structure unless a card or faction ability specifically states otherwise. There are a number of additional exceptions and clarifications:
- To purchase a unit or structure, a player must pay the materiel cost of the unit or structure. Some units also have the additional cost of one forge token.
- Players are limited to purchasing the number of units and structures provided in the game. A player cannot purchase a unit or building if all of the units or structures of that type are already on the game board.
- A player can place purchased units on any friendly or uncontrolled areas in the system, even areas that do not contain a factory.
  - Ships must be placed on voids.
  - Ground units and structures must be placed on worlds.
- A player can deploy units in an area in excess of that area’s unit capacity. After resolving the order, he must destroy units of his choice until he is obeying the area’s unit capacity.
- When placing a free unit or structure as a result of a card or faction ability effect, players do not spend materiel or forge tokens and they ignore command level restrictions.
- A player cannot purchase a unit that has a command level greater than his current command level.


*Related Topics: Component Limitations, Command Level, Costs, Factory, Free Units, Forge Tokens, Order Tokens, Purchasing Units and Structures, Structures, Units*


### Destroy

When a unit is destroyed, it is removed from the game board and placed back in its owner’s play area. Destroyed structures are returned to the supply of unused components.
- A player may purchase a destroyed unit or structure again; it is not removed from the game.


*Related Topics: Damage and Health*


### Dice Limit

See “Component Limitations” on page 5.


### Discarding Cards

Some effects have a player discard a card from his hand or from his play area. When a card is discarded, it is revealed to all players and then immediately shuffled back into the player’s deck.

*Related Topics: Combat Cards, Event Cards*


### Dominate Order

Players use Dominate Orders to gain assets from worlds and to use the ability on their faction sheets. To resolve this order, the active player performs these steps in order:

1. Collect Assets: The active player gains the assets indicated on each friendly world in the active system.
  - To gain assets, the active player takes the appropriate tokens from the supply and places them in his play area. If the player gains a prosperity asset (represented by a white eagle), he gains one asset token of his choice.

2. Resolve Faction Ability: The active player may resolve the special ability listed on the front of his faction sheet.


*Related Topics: Assets*


### Eliminated

See “Player Elimination” on page 10.


### Enemy

See “Areas” on page 3.


### Event Cards

Each faction has a unique deck of event cards. Event cards provide effects as specified on the card. They also control the movement of Warp Storms.
- During the Refresh Phase, each player draws one card for each order token that is on top of his event deck, returning the order tokens to his supply.
  - A player can choose any one of his drawn event cards to resolve, even if he cannot move any Warp Storms using that card.
  - If a player does not have any order tokens on top of his event deck during the Refresh Phase, he does not draw or resolve any event cards. He will however, reveal the top card of his event deck for Warp Storm movement.
- A player places his order token on his event deck after resolving a Strategize Order during the Operations Phase.
- A player can place an order token on his event deck after revealing an Advance, Deploy, or Dominate Order during the Operations Phase instead of resolving that order normally.
- There are two types of event cards: tactics and schemes.
  - Tactic event cards are resolved immediately and then shuffled back into the player’s event deck.
  - Scheme event cards remain in play. When a player chooses to resolve a scheme event card, he places it faceup next to his faction sheet in his play area. He can use the effects of a scheme event card that is faceup in his play area by following the instructions on the card.
- A player can choose not to resolve the ability on his chosen event card, but must resolve the card’s Warp Storm movement icon.
- If an event card uses the phrase “instead of revealing an order”, this effect takes the place of a player’s normal turn during the Operations Phase. He does not reveal or discard any of his order tokens. After resolving this effect, the next player would take a turn revealing and resolving an order.
- If an event card has an ability that is resolved during combat, the ability only affects units participating in the combat.


*Related Topics: Refresh Phase, Strategize Order, Operations Phase, Warp Storms*


### Factories

Factories are structures that provide players with the capability of purchasing units using Deploy Orders.
- When a player resolves a Deploy Order, he may purchase units if he has at least one factory in the active system.
- Players use structure control markers to identify which factories belong to which players.
- The active player’s deploy limit is equal to the unit capacity for the world on which his factory is located.
  - If the active player has more than one factory in a system, the deploy limit is the sum of the unit capacities for each friendly world containing a factory in the active system.
  - Some cards allow a player to have two factories on the same world. That world’s unit capacity is doubled when determining that player’s deploy limit.


*Related Topics: Deploy Order, Structures, Unit Capacity*


### First Player

The first player is the player with the first-player token.
- The first player begins each phase as the active player, meaning that he is the first to deploy orders, resolve orders, and resolve event cards during the round.
- At the end of each game round, the first player passes the first player token to the player to his left.


*Related Topics: Refresh Phase, Setup*


### Forge Tokens

Forge tokens are assets that players can gain. Forge tokens are required to purchase certain units, and can also be spent to reduce a unit’s command level restriction.
- When a player resolves a Dominate Order, he gains one forge token for each forge asset icon on friendly worlds in the active system. He takes the token from the supply and places it in his play area.
- Some units have the additional cost of one forge token. Such a cost is represented by a forge icon below a unit’s materiel cost on its faction sheet.
- When purchasing a unit, the active player may spend one forge token to temporarily reduce that unit’s command level restriction by one.
  - This reduction applies only to one unit—if a player wants to purchase more than one unit at a reduced command level, he must spend an equal number of forge tokens.
  - A player cannot spend more than one forge token to reduce a single unit’s command level requirement.
- A player cannot spend forge tokens to reduce the command level restriction for upgrade cards.


*Related Topics: Deploy Order, Command Level, Dominate Order*


### Free Units

Some abilities allow players to place free units in areas.
- Free units come from the player’s supply, and he does not need to spend materiel or forge tokens to purchase these units.
- When placing a free unit, a player can place a unit even if he doesn’t satisfy that unit’s command level restriction.
- When placing a free unit, if the player does not have any of that unit in his supply, he cannot place that unit.
- An ability that allows a player to place a free unit describes where the free units can be placed.
- If an ability allows a player to replace a unit with a free unit of another type, the free unit is placed unrouted, even if the replaced unit was routed.


*Related Topics: Units*


### Friendly

See “Areas” on page 3.


### Gaining And Losing

Some abilities instruct a player to gain or lose a die (B, D, C, or V) or a combat token (A or E) To resolve these abilities, players follow these rules:
- When a player gains a die that includes a combat icon (B, D, or C), he takes one die from the supply and places it in his play area with the appropriate icon displayed.
- When a player gains a die with no icon (V), the player takes a die from the supply, rolls it, and places it in his play area.
- Each player cannot have more than eight dice during a combat. If a player already has eight dice, he cannot gain any dice.
- When a player gains a combat token (A or E), he takes one token with that icon from the supply and places it in his play area.
- When a player loses a die or token, he removes it from his play area and returns it to the supply of unused components.
- If a player loses more dice or tokens than he has available, he loses as many dice or tokens of the specific type as he is able to. If he does not have any of the required dice or tokens, he loses nothing.


*Related Topics: Combat Card Resolution, Component Limitations, Spend*


### Health

See “Damage and Health” on page 6.


### Materiel And Materiel Dials

Players acquire materiel, which they can use to purchase units, structures, and upgrades. A player’s materiel is tracked on his materiel dial.
- During the Refresh Phase, each player increases his materiel dial by the sum of the materiel values on all friendly worlds. Unspent materiel persists from round to round and is not lost or reset.
- When a player purchases units, structures, or upgrade cards, he decreases his materiel dial by an amount equal to the materiel cost of the purchased units, structures, or upgrade cards.
  - A player can spend one cache token when purchasing a unit or structure to reduce its materiel cost by 2.
- The maximum amount of materiel that a player can have at any time is 14.
- Each player begins the game with the amount of materiel in the “Initial Forces” box on the back of his faction sheet.


*Related Topics: Cache Tokens, Combat Cards and Combat Upgrade Cards, Deploy Order, Order Upgrade Cards*


### Morale

Units, dice, and combat cards all add to a player’s morale value ( ) during a combat.
- When determining the winner of a combat, the player with the highest morale value wins.
  - If players are tied for morale during a combat, the defender wins the tie.
- Each unit and bastion has a morale attribute depicted on its corresponding faction sheet.
- Routed units do not contribute their morale to a player’s total morale.


*Related Topics: Combat, Combat Icons*


### Moving Ground Units

A player may move ground units to worlds in the active system when he resolves an Advance Order. He may also move ground units using a variety of abilities.
- When one or more ground units move during an Advance Order, they are removed from their current world and placed on the destination world. There must be a legal path between the starting world and the destination world.
  - A legal path is a series of contiguous friendly areas leading to the destination world. This can include worlds and/or voids.
  - The destination world must be in the active system.
  - The world a ground unit moves from must be in the active system or one system that is adjacent to the active system. Ground units cannot move into the active system from more than one adjacent system.
  - During an Advance Order, if a ship moved from an adjacent system to the active system, ground units cannot move into the active system from a different adjacent system. Ground units that are already in the active system are not restricted by this.
  - Ground units on a world adjacent to the destination world always have a legal movement path.
  - Ground units cannot move through a contested, uncontrolled, or enemy void.
  - A contested area cannot be used as part of a legal path.
  - During an Advance Order, all ground units move simultaneously. This means that all legal paths are determined before moving any ground units.
- A ground unit must end its movement on a world.
- If an ability allows a player to place a ground unit in an area, it does not need a legal path to move to that area. A ground unit cannot be placed on a void.
- A player can move up to five ground units to a world, even if, by doing so, he exceeds the world’s unit capacity. After resolving all movement, including any combat started while resolving the order, he must destroy any units that are in excess of the world’s unit capacity.


*Related Topics: Advance Order, Areas, Unit Capacity, Moving Ships, Systems, Warp Storms*


### Moving Ships

A player may move ships to voids in the active system when he resolves an Advance Order. He may also move ships using a variety of abilities.
- When a ship moves, it is removed from its current void and placed in its destination void.
  - Ships do not require a path to move. They may move to any void in the active system, even if it’s not adjacent to the starting void.
  - The destination void must be in the active system.
  - The void a ship moves from must be in the active system or one system that is adjacent to the active system. Ships cannot move into the active system from more than one adjacent system.
- A player can move up to five ships to a void, even if, by doing so, he exceeds the void’s unit capacity of three. After resolving all movement, including any combat started while resolving the order, he must destroy any units that are in excess of three (the void’s unit capacity).
- If an ability allows a player to place a ship in an area, it does not need a legal path to move to that area. The ship cannot be placed on a world.


*Related Topics: Advance Order, Areas, Systems, Unit Capacity, Warp Storms*


### Objective Tokens

Objective tokens are placed on worlds during setup. A player wins the game if he collects a number of his faction’s objective tokens equal to the number of players in the game.
- During step 1 of each Refresh Phase, each player collects each of his faction’s objective tokens that are on worlds he controls. He places all collected objective tokens on his faction sheet so that all players can clearly see them.
- A player can only collect objective tokens belonging to his faction.


*Related Topics: Refresh Phase, Winning and Losing the Game*


### Operations Phase

During the Operations Phase, players take turns resolving the order tokens they placed during the Planning Phase. Starting with the first player and proceeding clockwise, each player takes a turn resolving one of his orders as follows:

1. The active player must choose one of his order tokens that is on the top of a stack.

2. The active player flips the chosen token faceup and then resolves that order’s effects.

3. The active player removes the chosen token from the game board, placing it in his play area or on the top of his event deck as appropriate. Then, the player to his left resolves one of his orders.
  - After a player resolves an Advance, Deploy, or Dominate Order, he places the order token in his play area.
  - After a player resolves a Strategize Order, he places the order token on top of his event deck.
  - When a player reveals an Advance, Deploy, or Dominate order, he may place the order token on top of his event deck instead of resolving its effect.
- Players take turns resolving order tokens until none remain on the game board.
- If a player cannot resolve an order, he skips his turn.
  - A player cannot resolve an order if he has no order tokens on the game board or if he does not have an order token that is on the top of a stack.
  - Even if a player’s turn is skipped, he will still resolve all of his order tokens during the Operations Phase. He will just resolve them later during the phase.


*Related Topics: Advance Order, Deploy Order, Dominate Order, First Player, Order Tokens, Planning Phase, Refresh Phase, Stack, Strategize Order*


### Orbital Strike

If the active player did not resolve a combat when resolving an Advance Order, he may resolve an orbital strike.
- An orbital strike is an attack resolved using ships in one void area that targets an enemy world.
  - Both the void and world areas must be in the active system.
  - The void and world must be adjacent to each other.
  - An orbital strike cannot be resolved against a world containing a bastion.
  - Routed ships cannot participate in an orbital strike.
- To resolve an orbital strike, the active player rolls a number of dice equal to the combined offence value of all of his ships participating in the orbital strike.
  - The opponent’s units on the target world suffer an amount of damage equal to the number of B rolled.
  - Each unit that suffers damage during an orbital strike that is not destroyed does not become routed.
- A player is limited to 8 dice while resolving an orbital strike. He cannot roll or gain dice in excess of this limit.
- Each faction has two order upgrade cards that apply to orbital strikes. A player decides whether to use these cards before rolling dice.
  - A player can use multiple order upgrades during the same orbital strike.
  - Each order upgrade card can be used only once per game round.
- Each faction has one order upgrade card that allows it to perform an orbital strike against a world containing a bastion. When using one of these cards, the bastion suffers damage as if it were a unit.
- If an ability requires the player to spend dice during an orbital strike, the dice are spent before any damage is suffered.


*Related Topics: Advance Order, Combat, Order Upgrade Cards*


### Order Tokens

Players use order tokens to perform the game’s four main actions.
- During the Planning Phase, players take turns placing order tokens facedown in order token boxes on systems. During the Operations Phase, players take turns resolving the order tokens they placed.
- Players can look at the faces of their own order tokens that are on the top of a stack at any time.


*Related Topics: Advance Order, Deploy Order, Strategize Order, Dominate Order, Operations Phase, Planning Phase*


### Order Upgrade Cards

Each faction has a set of unique order upgrade cards.
- When resolving a Strategize Order, a player may purchase one of his order upgrade cards for which he meets the command level requirement.
- After a player purchases an order upgrade card, he places the card faceup in his play area.
- Order upgrade cards are permanent. After a player purchases an order upgrade card, it remains faceup in his play area for the duration of the game.
- When a player resolves an order, if he has an upgrade card that matches the order he is resolving, he may choose to resolve the card’s effect.
- Each order upgrade card can be used only once per round. To track the use of an order upgrade card, players turn the card facedown after use and then flip it faceup at the end of the Refresh Phase.
- A player may use an order upgrade card during the round in which it is purchased.
- Each faction has two special order upgrade cards that are used when resolving an orbital strike. These have an altered Advance Order icon.
- When a player chooses not to resolve an order token’s effect and places it on top of his event deck, he cannot resolve any order upgrade card effects.
- If an effect allows a player to resolve one order as if it were a different order, the new type of order can benefit from the use of other order upgrade cards.


*Related Topics: Command Level, Orbital Strike, Order Tokens, Strategize Order*


### Path

See “Moving Ground Units” on page 8.


### Planning Phase

During the Planning Phase, players take turns placing their order tokens on the game board. Starting with the first player and proceeding clockwise, each player places one facedown order token of his choice in the order token box of a system. The players continue to alternate placing order tokens until each player has placed four tokens.
- A player must place his order token in either a system containing one of his units or structures, or a system adjacent to a system containing one of his units or structures.
- Each player must place four order tokens during each Planning Phase. Players cannot choose to place more or fewer tokens.
- If a system already contains one or more order tokens, the active player places his order token on the top of those order tokens, creating a stack.
- All order tokens that are placed during the Planning Phase are resolved during the following Operations Phase.


*Related Topics: First Player, Operations Phase, Order Tokens, Stack*


### Player Elimination

A player is eliminated from the game if he does not have any friendly worlds.
- When a player is eliminated, he removes all of his components from the game. He cannot win the game, and no longer resolves any of the phases of the game.
- When a player is eliminated, this does not reduce the number of objective tokens needed to win the game.
- If only one player remains in the game, that player immediately wins.


*Related Topics: Winning the Game*


### Purchasing Units And Structures

See “Deploy Order” on page 6.


### Refresh Phase

The Refresh Phase is the last phase of each game round. To resolve this phase, players perform the following steps in order:

1. Collect Objective Tokens: All players simultaneously collect each objective token belonging to their faction that is on a friendly world.

2. Collect Materiel: All players simultaneously increase their materiel dials by an amount equal to the combined materiel values of their friendly worlds.
  - A player cannot have more than 14 materiel. Any materiel gained in excess of this limit is lost.

3. Rally Routed Units: All players simultaneously rally each of their routed units by standing them upright.

4. Events and Warp Storms: Starting with the first player and proceeding clockwise, each player resolves all of the following substeps:

a. The active player draws a number of event cards from his deck equal to the number of order tokens on his deck. He chooses one of the drawn cards to resolve, discards the others, and returns all of the tokens to his play area.

b. The active player chooses one Warp Storm on the game board and moves it in one of the two directions shown on the Warp Storm icon on his chosen card. If a player did not draw any event cards, he reveals the top card of his event deck and uses its Warp Storm movement icon to move a Warp Storm; he cannot resolve the ability on the revealed card. Then, he shuffles the card back into his event deck.

c. If the active player drew at least one event card, he resolves the chosen card’s ability. Then, he shuffles all event cards back into his event deck, excluding the “Scheme” event card if it is in play.

5. End of Round: The first player gives the first player token to the player on his left. Then, he advances the round marker one space on the round track.
  - If the round marker would advance off the “8” space of the track, the game ends and the player with the most objective tokens wins the game.


*Related Topics: Event Cards, Objective Tokens, Operations Phase, Routed Units, Strategize Order, Warp Storms, Winning and Losing the Game*


### Reinforcement Tokens

Reinforcement tokens are assets that players can gain. Players can use these tokens as additional units during a combat. Each of these tokens is treated as one of his command level zero units, either a ground unit or ship as appropriate for the combat.
- When a player resolves a Dominate Order, he gains one reinforcement token for each reinforcement asset icon on friendly worlds in the active system. He takes the tokens from the supply and places them in his play area.
- After rolling dice in combat, each player may place a number of his reinforcement tokens into the area by his units.
  - The attacker first decides how many reinforcement tokens to use, then the defender decides how many reinforcement tokens to use.
  - The maximum number of reinforcement tokens a player can use during a combat is equal to the number of plastic units he has in that combat. Bastions do not count toward this number.
- During a combat on a world, a player’s reinforcement tokens are treated as his command level zero ground units.
- During a combat on a void, a player’s reinforcement tokens are treated as his command level zero ships.
- Reinforcement tokens in combat are treated like plastic units for all rules and game effects (including unit requisites on cards).
- Reinforcement tokens do not contribute dice to a combat; however, they are treated as the appropriate command level zero unit for all other purposes.
- When a reinforcement token is routed, a player flips that token to its routed side.
- After a combat is resolved, all reinforcement tokens that were used during the combat are returned to the supply.
- If an ability allows a player to place free reinforcement tokens, he takes the tokens from the supply and places them by his units in the contested area. These tokens can exceed the normal limit to the number of reinforcement tokens he can use in the combat.


*Related Topics: Assets, Combat, Dominate Order*


### Retreats

When a player loses a combat, all of his units in the contested area must retreat. Retreat rules differ for the attacker and defender. As such, this reference entry provides general retreat rules that apply to all units as well as attacker- and defender-specific rules.
- General: Below is a list of general retreat rules that apply to both the attacker and the defender.
  - Ground units must retreat along a legal path.
  - After a unit retreats, it is routed.
  - All retreating units must move to the same area.
  - The area that units retreat to does not need to be adjacent to the contested area.
  - A player can exceed an area’s unit capacity during a retreat. After resolving a retreat, he must destroy units of his choice in excess of the area’s unit capacity. A player may be forced to retreat to an area where he must destroy units.
  - Ground units must retreat to worlds, and ships must retreat to voids.
  - If there is no area for a unit to retreat to, that unit is destroyed. Unrouted Side Routed Side
  - Some game effects allow a unit to retreat during an execution round of combat. These retreats must follow the normal retreat rules based on if the unit is an attacker or defender. Any units that retreat during this step do not suffer any damage. If a player retreats all of his units during this step, players still perform the assign damage step. However, any retreating units do not suffer damage.
  - Each retreat, whether it occurs during the “Determine Winner” step of combat or the “Execution” substep of combat is treated as a separate retreat. As such, it is possible for units in the same combat to retreat to different areas—one area per retreat—if multiple retreats are resolved.
- Attacker: An attacker must observe the following special rules while resolving retreats:
  - If the units did not move into the contested area via an Advance Order, they must move to an area that at least one unit moved from to start the combat.
  - If the units were placed in the contested area by any effect other than an Advance Order, the units cannot retreat and are destroyed.
- Defender: A defender must observe the following special rules while resolving retreats:
  - Retreating units must move to a friendly area. If there are no friendly areas that the retreating units can move to, they must move to an uncontrolled area.
  - The area the retreating units move to must either be in the active system or in a system adjacent to the active system.
  - If attacking units moved from an adjacent system, the defender’s units cannot retreat to that system.
  - Defending units cannot retreat to an area from which attacking units moved from.


*Related Topics: Combat, Moving Ground Units, Moving Ships, Rout and Rally*


### Rout And Rally

Many game effects can rout or rally units. When a unit is routed, it is tipped onto its side. When a unit is rallied, it is stood back up to its unrouted state.
- Routed units follow these restrictions:
  - Routed units do not count toward requisites needed to trigger specific abilities on combat cards.
  - Routed units do not add their morale when a player is determining his morale value during a combat.
  - Routed units do not contribute combat dice at the start of combat or orbital strikes.
  - A player cannot choose to deal damage to a routed unit unless all of his units in the combat are routed and he does not have a bastion in the combat.
  - A routed unit can retreat; however, it cannot move or be placed in a different area by an order or card effect.
  - A unit cannot become routed if it is already routed.
- During the Refresh Phase, all routed units are rallied.
- If a reinforcement token is routed, it is flipped to its routed side.
- All retreating units are routed after retreating.


*Related Topics: Combat, Refresh Phase, Reinforcement Tokens*


### Scheme Event Cards

See “Event Cards” on page 7.


### Setup

Before starting a game of Forbidden Stars, players must perform the following setup steps:

1. Choose Factions: Each player chooses one faction and gathers that faction’s corresponding faction sheet, tokens, event cards, upgrade cards, combat cards, and units.

2. Claim Starting Components: Each player claims all components listed in the “Initial Forces” box on the back of his faction sheet. Then, he flips his faction sheet faceup and places these claimed components on top of it. Finally, he claims a materiel dial and sets the number at “6”—this value is also listed in the “Initial Forces” box on the back of his faction sheet.

3. Determine First Player: Mix one of each player’s structure control markers in the box lid and draw one randomly. That player is assigned the first player token.

4. Construct Game Board: To construct the game board, players perform the following substeps.

a. Distribute System Tiles: Each player claims the system tile that has his faction icon on it. Then, the first player takes all system tiles that do not have faction icons on them, randomizes them by shuffling them under the table, and deals two to each player.

b. Distribute Objective Tokens: Each player gives two of his objective tokens to each other player and returns any remaining tokens to the game box.

c. Build the Game Board: Starting with the first player and proceeding clockwise, each player places one system tile and components in the play area as follows:

  i. Place a System Tile: The player chooses one of his system tiles and places it adjacent to at least one other system tile. He cannot place a tile where it would exceed the maximum game board size (see page 16 of the Learn to Play booklet).

  ii. Place Units and Structures: The player may place any number of his initial forces (claimed in step 2) on the tile he just placed. He cannot exceed an area’s unit capacity.
- If a player gained asset tokens in his initial forces, he does not places these on a system. He keeps these tokens by his faction sheet until used during the game.
- When placing his third system tile, a player must place all remaining initial units and structures on that tile.

  iii. Place Objective Tokens: The player must place one of his opponent’s objective tokens on each objective token space on the system tile he just placed, obeying the following restrictions:
- A player cannot place two tokens from the same faction on the same system tile.
- A player cannot place an objective token that belongs to one faction if he has more objective tokens that belong to another faction.
- After he has placed all tokens received during substep b), he does not place any more objective tokens. Players repeat this process until each player has placed all of his system tiles and all of his components listed in the “Initial Forces” box on his faction sheet. d. Place Warp Storms: Starting with the player who placed the last system tile and proceeding anticlockwise, each player places one Warp Storm along any system tile edge; this may include the outer edges of the game board.

5. Create Event, Combat, and Upgrade Decks: Each player shuffles his event cards and places them in a facedown deck in his play area. Then, each player finds the ten combat cards with his faction symbol printed on the upper-left corner and shuffles them to form his combat deck. Finally, each player forms two upgrade decks using all of his faction’s order upgrade cards and his remaining combat cards; these decks do not need shuffling. He places them faceup next to his faction sheet making sure not to mix them with his combat deck.

6. Prepare Round Track: Place the round track near the game board, and place the round marker on the “1” space of the track.

7. Create Supply: Separate all reinforcement tokens, cache tokens, forge tokens, dice, and plastic structures in piles and place them near the game board where all players can reach them. After completing setup, players begin the first planning phase.


*Related Topics: Objective Tokens, Systems, Units, Warp Storms*


### Simultaneous Effects

If multiple players have effects that are resolved at the same time, the first player resolves his effect first, followed by other players in clockwise order.
- During combat, the attacker resolves his abilities first followed by the defender.
- An ability must be fully resolved before another ability can be resolved.


### Spend

Some effects require players to spend materiel, tokens, or dice.
- To spend materiel, a player decreases his materiel dial by the amount he is spending. His materiel dial must display the number of remaining materiel after subtracting what he spent.
- To spend a token, a player takes a token from his play area and places it back in the supply of unused tokens.
- To spend a die, the player takes one of the dice that he has rolled or gained, and returns it to the supply of unused dice.
- A player can only spend his own components.


*Related Topics: Cost, Deploy Order, Gaining and Losing*


### Stack

Facedown order tokens in a system’s order token box form a stack. A stack may include one token or multiple tokens placed on top of each other.
- The order token on the top of the stack is the next order token from that system that a player can reveal and resolve.
- Players can look at the faces of their own order tokens that are on the top of a stack at any time.
- Players cannot resolve or look at any order that is below another order token in a stack.
- When a player places an order token during the Planning Phase, he either places it on the top of a stack or he begins a new stack in a system that doesn’t contain any order tokens.
- After resolving an order token, it is removed from the stack and either placed in the player’s play area or on top of his event deck, as appropriate.
- There is no limit to the number of order tokens that can be in a single stack.


*Related Topics: Planning Phase, Operations Phase, Order Tokens*


### Strategize Order

Players use Strategize Orders to purchase new upgrade cards and to draw additional event cards during the Refresh Phase. To resolve this order, players follow these steps:

1. Purchase Upgrade: The active player may purchase up to one combat upgrade and up to one order upgrade from his upgrade decks.
  - The active player can purchase upgrades only if he has at least one unit or structure in the active system.

2. Place Order Token on Event Deck: The active player takes the order token from the game board and places it on top of his event deck. This will allow him to draw an event card during the Refresh Phase.


*Related Topics: Event Cards, Combat Cards and Combat Upgrades, Order Upgrades, Refresh Phase*


### Structures

Bastions, cities, and factories are structures. The active player can purchase a structure when resolving a Deploy Order.
- A structure can only be placed on a world.
- A player cannot build a structure on a world that already contains a structure unless an ability specifically allows it.
- After placing a structure on a world, the active player places one of his structure control tokens underneath the structure.
- Structures are not units.
- When the attacker wins a battle, he gains control of all enemy structures on the world.


*Related Topics: Bastions, Cities, Combat, Deploy Order, Factories*


### Suffering Damage

See “Damage and Health” on page 6.


### Systems

A system is a single tile composed of four areas that are separated by gold borders.
- The centre of each system tile contains a hexagonal order token box on which players place order tokens.
- Some system tiles have a faction icon printed on their order token box. Players can use these icons to identify which tiles belongs to which factions. The icons have no other game effect, and any player may freely place order tokens in these systems.
- Printed in the corner of each system tile is a unique code. This number and letter combination is used to identify the tile and has no gameplay function.


*Related Topics: Area, Adjacency, Stack, Order Tokens, Setup*


### Tactic Event Cards

See “Event Cards” on page 7.


### Unit Capacity

Each area has a unit capacity which limits the maximum number of units a player can have in the area.
- The unit capacity of each world is equal to the number of skull icons printed on that world’s banner.
- The unit capacity of each void is three.
- If a player has a number of units in an area that exceeds that area’s unit capacity, he must destroy units of his choice in that area until the number of units is equal to or less than the area’s unit capacity. This is only checked after resolving an order and at the end of each Event Phase.
- Players can voluntarily exceed the unit capacity of an area when moving units, retreating, placing units, or deploying units. After resolving that order or action, each player must choose and destroy units in the area until he is within the area’s unit capacity.
- Structures do not count toward a world’s unit capacity.


*Related Topics: Advance Order, Deploy Order, Moving Ground Units, Moving Ships, Retreats, Structures*


### Units

All ships and ground units are units. Structures are not units.

*Related Topics: Deploy Order, Structures*


### Upgrade Cards

Each faction has upgrade cards which increase the functionality of its order tokens and the potency of its combat deck.
- A player can purchase upgrade cards when he resolves a Strategize Order.
- Each player keeps his upgrade cards in two faceup decks, one for his order upgrade cards and one for his combat upgrade cards.


*Related Topics: Combat Cards and Upgrade Combat Cards, Order Upgrade Cards, Strategize Order*


### Voids

A void is an area that depicts a star field without a world.
- Voids have a unit capacity of three.
- Ground units cannot be on voids, but can move through voids.


*Related Topics: Advance Order, Areas, Unit Capacity, Moving Ground Units, Moving Ships*


### Warp Storms

Warp Storm tokens are placed on the game board during setup and are moved during each Refresh Phase. Units cannot move through Warp Storms.
- Systems separated by a Warp Storm are still adjacent.


*Related Topics: Event Card, Refresh Phase, Setup*


### Warp Storms, Moving

During the Event Phase, each player chooses one of his drawn event cards to resolve. First, he moves one Warp Storm of his choice following one of the available directions provided by the Warp Storm icon on the card, then he resolves the card’s ability. If a player does not have any order tokens on top of his event deck during the Refresh Phase, he reveals the top card of his event deck and moves one Warp Storm of his choice following the Warp Storm icon on the card. Then, he discards the card and shuffles it back into his deck without resolving the card’s ability.
- Each Warp Storm movement icon indicates two possible directions in which a player can choose to move a Warp Storm.
  - A player must move a Warp Storm if he can.
  - If a player can move a Warp Storm in only one of the two indicated directions on his chosen card, he must choose that direction.
  - A player must choose a Warp Storm that he can legally move.
  - If a player cannot move any Warp Storms in either direction indicated on his chosen event card, he does not move a Warp Storm.
- Each Warp Storm can move only once during each Refresh Phase.
- After moving a Warp Storm, flip the Warp Storm token facedown to track which Warp Storms have or have not moved during the phase. At the end of the round, flip all Warp Storms back to their pink side.
- A Warp Storm cannot move onto a border occupied by another Warp Storm.
- A Warp Storm can move to the edge of the game board, but cannot move off the edge of the game board.
- Warp Storms are always placed so they are on the edge of a system tile or on a shared edge between two system tiles. The Warp Storm token spans the entire edge of the system tile on which it is placed and must be parallel to that edge.


*Related Topics: Event Card, Refresh Phase, Warp Storms*


### Winning And Losing The Game

When a player has collected a number of his objective tokens equal to or exceeding the number of players, the game ends and he wins the game.
- If multiple players win the game at the same time, the player that has collected the most objective tokens wins. If still tied, the tied player who has the most friendly worlds wins. If still tied, the player with the most units on the game board wins. If still tied, the tied players share the victory.
- During the first step of the Refresh Phase, all players simultaneously collect all objective tokens that belong to their faction and on friendly worlds.
  - Players cannot collect objective tokens that belong to other factions.
- If a player does not control any worlds, he is eliminated from the game. All of his ships are destroyed, and he no longer participates in the game and cannot win.
  - If all players except one are eliminated from the game, the remaining player immediately wins, regardless of the number of objective tokens he has collected.
- If no player has won the game by the end of the eighth game round, then the game ends and the player that has gathered the most objective tokens wins the game. Ties are broken following the rules listed above.


*Related Topics: Areas, Objective Tokens, Player Elimination, Refresh Phase*


### Worlds

A world is an area that contains an image of a planet accompanied by a banner.
- Each world has a unit capacity, and most have a materiel value.
- Most worlds have an icon which depicts an asset. When a player resolves a Dominate Order, he gains the asset provided by each friendly world in the active system.


*Related Topics: Assets, Area, Dominate Order, Materiel and Materiel Dial, System, Unit Capacity, Void*


---

# Печатная памятка (стр. 16 оригинального PDF)

## Round overview

Каждый игровой раунд состоит из трёх фаз:

1. **Planning Phase** — начиная с первого игрока, игроки по очереди выкладывают жетоны
   приказов на поле, пока каждый не выложит четыре приказа.
2. **Operations Phase** — начиная с первого игрока, игроки по очереди выполняют
   выложенные жетоны приказов.
3. **Refresh Phase** — игроки выполняют шаги:
   1. Collect Objectives
   2. Collect Materiel
   3. Rally Units
   4. Move Warp Storms and Resolve Event Cards
   5. End of Round (pass first player and advance round marker)

## Order tokens

| Приказ | Что делает |
|---|---|
| **Deploy** | Если в системе есть фабрика игрока, он тратит материю и покупает новые отряды. Затем он может построить структуру на любом дружественном мире в системе. |
| **Strategize** | Если в активной системе есть отряд или структура игрока, он может купить приказ-апгрейд, боевой апгрейд или и то и другое. Затем он кладёт жетон приказа на свою колоду событий — это даст ему карту события в фазе обновления. |
| **Dominate** | Игрок получает ресурсы с каждого дружественного мира в системе. Он также может применить особую способность со своего планшета фракции. |
| **Advance** | Игрок может переместить свои отряды в активную систему и, возможно, начать один бой. |

## Combat

1. **Preparation**
   1. Roll Dice (equal to units' combat values)
   2. Draw Combat Cards (attacker and defender both draw five)
   3. Reinforce
2. **Execution** (perform three times)
   1. Choose Combat Cards
   2. Resolve Combat Cards (attacker first)
   3. Assess Damage
3. **Resolution**
   1. Determine Winner (based on morale)
   2. Capture Structures
   3. Clean Up (discard reinforcement tokens and combat cards)

## Card Clarifications

### Combat Cards
- **Armoured Advance:** Combat tokens are used in both assess damage steps and are not
  discarded until the end of the second assess damage step.
- **Chaos United:** The opponent must choose whether or not to rout one of his units before the
  Chaos player chooses which die he gains from this card's general ability.
- **Mark of Nurgle:** The Chaos player automatically gains 2 defence combat tokens from this
  card's unit ability if he has the required unit and his opponent does not have any routed units.
- **Mark of Tzeentch:** This card can replace a reinforcement token with a Chaos Space Marine.
- **Wave Serpent:** The Eldar player can only move units into one contested area, regardless of
  how many Wave Serpent cards he plays during the combat.

### Event Cards
- **Exodite Colony:** The Eldar player must follow the restriction of one structure per world.
  The Eldar player controls this structure, even if placed on an uncontrolled world.
- **Incantation of Tzeentch:** Only resolve the ability of the chosen event card. Do not resolve
  the Warp Storm movement icon on that card.
- **Seduced by Chaos:** The Chaos player must be participating in the combat, and the opponent's
  unit must be in the contested area.
- **Teer It Down!:** The Ork player must be participating in the combat to use this ability.

### Order Upgrade Cards
- **Complete Destruction:** The player who has units on the world can choose to destroy any
  structure or unit on the world.
- **Dread Ritual:** There does not need to be a factory in the active system to purchase the unit.
- **Strafing Run:** The Eldar player resolves the effects of all dice rolled, even if he moves
  ships out of the system.

## Icon Reference

Combat icons appear on dice, combat cards, and combat tokens. В текстовом слое PDF иконки
превратились в буквы (см. таблицу в начале файла): `B`, `D`, `C` — иконки на боевых кубиках,
`A`, `E` — иконки на жетонах боя, `V` — «пустой» кубик (взять из запаса и бросить).

| Иконка на компонентах | Значение |
|---|---|
| зелёная шестерёнка | стоимость в материи (materiel cost) |
| шестерёнка + жетон кузницы | стоимость в материи + 1 жетон кузницы (forge) |
| синий ромб со стрелками | боевое значение (combat value — сколько кубиков бросает отряд) |
| красный череп в прицеле | прочность (health — сколько урона уничтожает отряд) |
| оранжевые крылья | мораль (morale) |
| круг с цифрой слева от отряда | требуемый уровень командования (command level) |
| золотая шестерёнка на карте | стоимость карты |
