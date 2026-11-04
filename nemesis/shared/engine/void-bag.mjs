import { randInt } from '../rng.mjs';

/** Put a randomly chosen physical Nightmare token from the finite supply into the bag. */
export function addVoidToken(state) {
    if (!state.voidSupply.length) return null;
    const token = state.voidSupply.splice(randInt(state, state.voidSupply.length), 1)[0];
    state.bag.push(token);
    return token;
}
