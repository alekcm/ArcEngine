import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const p=loadScripts(['js/fs/FSData.js','js/fs/FSEffects.js','js/fs/FSRules.js','js/fs/FSView.js','js/fs/FSGame.js']);
const data=p.get('FS_DATA'),r=p.get('FS_RULES'),view=p.get('FSView'),Game=p.get('FSGame');
const game=(n=2)=>r.newGame({seed:11,players:data.factions.slice(0,n).map((f,i)=>({name:'P'+i,faction:f.id}))});

test('planning alternates, rejects out-of-turn commands and stacks in placement order', () => {
    const s=game(3),sys=s.systems[0];
    // Arrange a shared legal system to exercise a single physical stack.
    for(const player of s.players) s.units.push({id:'test'+player.seat,seat:player.seat,system:sys.id,area:'TL',unit:'test'});
    assert.equal(r.apply(s,1,{type:'placeOrder',system:sys.id,order:'advance'}).ok,false);
    for(let i=0;i<12;i++) {
        const seat=i%3;assert.equal(s.turn,seat);
        assert.ok(r.apply(s,seat,{type:'placeOrder',system:sys.id,order:['advance','deploy','dominate'][seat]}).ok);
        assert.equal(sys.tokens.at(-1).seat,seat);
    }
    assert.equal(s.phase,'operations');assert.equal(s.turn,2,'blocked first two players are skipped');
    const resolved=[];
    while(s.phase==='operations') {
        const seat=s.turn; resolved.push(seat);
        assert.ok(r.apply(s,seat,{type:'resolveOrder',system:sys.id,toEventDeck:true}).ok);
    }
    assert.deepEqual(resolved,[2,1,0,2,1,0,2,1,0,2,1,0]);
    assert.equal(sys.tokens.length,0);
});

test('only the owner can see the top order; buried faces and placement log are secret', () => {
    const s=game(),sys=s.systems[0];
    for(const player of s.players) s.units.push({id:'test'+player.seat,seat:player.seat,system:sys.id,area:'TL',unit:'test'});
    assert.ok(r.apply(s,0,{type:'placeOrder',system:sys.id,order:'advance'}).ok);
    let a=r.view(s,0),b=r.view(s,1);
    assert.equal(a.systems[0].tokens[0].order,'advance');assert.equal(b.systems[0].tokens[0].order,null);
    assert.ok(!JSON.stringify(b.log).includes('наступление'));
    assert.ok(r.apply(s,1,{type:'placeOrder',system:sys.id,order:'deploy'}).ok);
    a=r.view(s,0);b=r.view(s,1);
    assert.deepEqual(Array.from(a.systems[0].tokens,t=>t.order),[null,null]);
    assert.deepEqual(Array.from(b.systems[0].tokens,t=>t.order),[null,'deploy']);
    assert.equal(sys.tokens[0].order,'advance','redaction must not mutate authoritative state');
});

test('clicking own setup miniatures removes exactly that figure, not an enemy or old tile', () => {
    const s=game(),sys=s.systems[0],u=s.units.find(x=>x.seat===0);u.system=sys.id;
    s.phase='setup';s.setup={stage:'forces',turn:0,currentSystem:sys.id,myTurn:true};s.seat=0;
    const g=Object.create(Game.prototype),sent=[];let meta={fs:'unit',unit:u.id,system:sys.id};
    Object.assign(g,{state:s,mode:'idle',view:{scene:{pick:()=>({hit:true,pickedMesh:{metadata:meta}})}},net:{cmd:c=>sent.push(c)},refresh(){},inspectAt(){}});
    g.onClick(0,0);assert.equal(sent[0].type,'removeSetupForce');assert.equal(sent[0].id,u.id);
    meta={fs:'unit',unit:u.id,system:'old'};g.onClick(0,0);assert.equal(sent.length,1);
    meta={fs:'unit',unit:s.units.find(x=>x.seat===1).id,system:sys.id};g.onClick(0,0);assert.equal(sent.length,1);
});

test('select a movable model on the board, then click a destination', () => {
    const s=game();s.seat=0;const unit=s.units.find(u=>u.seat===0),sys=s.systems.find(x=>x.id===unit.system);
    s.phase='operations';s.turn=0;s.order={seat:0,order:'advance',phase:'move',system:sys.id};
    const dest=sys.areas.find(a=>a.world && a.pos!==unit.area && r.canMove(s,0,unit,{system:sys.id,pos:a.pos}).ok);
    assert.ok(dest);
    let meta={fs:'unit',unit:unit.id,system:sys.id,pos:unit.area};const sent=[];
    const g=Object.create(Game.prototype);Object.assign(g,{state:s,mode:'idle',pending:null,view:{scene:{pick:()=>({hit:true,pickedMesh:{metadata:meta}})},highlights:[]},net:{cmd:c=>sent.push(c)},highlightMove(){},refresh(){}});
    g.onClick(1,1);assert.equal(g.mode,'move');assert.equal(g.pending.unit,unit.id);
    meta={fs:'area',system:sys.id,pos:dest.pos};g.onClick(1,1);
    assert.equal(sent.length,1);assert.equal(sent[0].type,'moveUnits');assert.equal(sent[0].moves[0].unit,unit.id);assert.equal(sent[0].moves[0].pos,dest.pos);assert.equal(g.mode,'idle');
});

test('a strategize order must be resolved before it goes on the event deck', () => {
    const s=game(),sys=s.systems.find(x=>r.canPlaceOrder(s,0,x.id));
    assert.ok(r.apply(s,0,{type:'placeOrder',system:sys.id,order:'strategize'}).ok);
    while(s.phase==='planning') {
        const seat=s.turn, target=s.systems.find(x=>x.id!==sys.id&&r.canPlaceOrder(s,seat,x.id)) || sys;
        assert.ok(r.apply(s,seat,{type:'placeOrder',system:target.id,order:'advance'}).ok);
    }
    // Isolate the stack to test a top strategy without depending on tile placement.
    for(const x of s.systems) x.tokens=[];
    sys.tokens.push({seat:0,order:'strategize',faceUp:false});s.turn=0;
    const before=s.players[0].eventTokens;
    const result=r.apply(s,0,{type:'resolveOrder',system:sys.id,toEventDeck:true});
    assert.equal(result.ok,false);assert.equal(sys.tokens.length,1);assert.equal(s.players[0].eventTokens,before);assert.equal(s.order,null);
    assert.ok(r.apply(s,0,{type:'resolveOrder',system:sys.id}).ok);assert.equal(s.order.order,'strategize');
});

test('clicking a visible order stack selects only the active player’s top token', () => {
    const s=game(),sys=s.systems[0];s.phase='operations';s.turn=0;s.seat=0;s.order=null;
    sys.tokens=[{seat:0,order:'advance',faceUp:false},{seat:1,order:'deploy',faceUp:false}];
    const g=Object.create(Game.prototype);Object.assign(g,{state:s,mode:'idle',pending:null,view:{scene:{pick:()=>({hit:true,pickedMesh:{metadata:{fs:'orderToken',system:sys.id}}})}},refresh(){}});
    g.onClick(0,0);assert.equal(g.mode,'idle');
    sys.tokens.pop();g.onClick(0,0);assert.equal(g.mode,'selectOrder');assert.equal(g.pending.system,sys.id);
});

test('an extra planning token is placed after opponents reach their limits', () => {
    const s=game();s.players[0].extraOrderTokens=1;
    const turns=[];
    while(s.phase==='planning') {
        const seat=s.turn,sys=s.systems.find(x=>r.canPlaceOrder(s,seat,x.id));turns.push(seat);
        assert.ok(r.apply(s,seat,{type:'placeOrder',system:sys.id,order:'advance'}).ok);
    }
    assert.deepEqual(turns,[0,1,0,1,0,1,0,1,0]);
    assert.equal(s.players[0].placedTokens,5);assert.equal(s.players[1].placedTokens,4);
});
