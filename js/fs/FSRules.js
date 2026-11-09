// FSRules.js — the rules engine of Forbidden Stars: the facade of the rules.
//
// The engine is one state object and one command function, exactly as the
// server needs it: FS_RULES.apply(state, seat, cmd) changes the state and
// returns { ok, error }. The rules themselves are split by responsibility into
// the classes of js/fs/rules (setup, planning, operations, each order, the
// refresh, the storms, the combat, the shared core). The classes are rule
// services: they never keep state of their own, every method takes the state
// first, and they call each other through this engine.
//
// This file is only the composition root: it builds FS_RULES from the services
// and the constants of FSRulesConfig.js. A new rule belongs in the service of
// its phase, not here.

/** The rule services, in the order they are loaded. */
const FS_RULE_SERVICES = [
    CoreRules,
    SetupRules,
    PlanningRules,
    OperationsRules,
    AdvanceRules,
    DeployRules,
    StrategizeRules,
    DominateRules,
    RefreshRules,
    StormsRules,
    CombatRules,
];

/** @type {Record<string, any>} */
const FS_RULES = Object.assign({}, FS_RULES_CONFIG);

// Every service becomes a set of methods of the engine. The service gets the
// engine as its collaborator, so a rule of one phase may use a rule of another
// (an advance starts a combat; a combat logs through the core).
for (const Service of FS_RULE_SERVICES) {
    const service = new Service(FS_RULES);
    for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(service))) {
        if (name === 'constructor') continue;
        FS_RULES[name] = function (...args) {
            return service[name](...args);
        };
    }
}
