import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadScripts } from './browser-scripts.mjs';
import { collectRefs } from '../tools/asset-scan.mjs';

const page=loadScripts(['js/fs/FSData.js','js/fs/FSEffects.js','js/fs/FSRules.js','js/fs/FSView.js','js/fs/FSGame.js']);
const rules=page.get('FS_RULES'),data=page.get('FS_DATA'),view=page.get('FSView'),Game=page.get('FSGame');
const makeGame=()=>rules.newGame({seed:9,players:data.factions.slice(0,2).map((f,i)=>({name:'P'+i,faction:f.id}))});

test('supplied token art is cropped into distinct transparent image assets', () => {
    for(const name of ['order-advance','order-deploy','order-strategize','order-dominate','asset-cache','asset-forge','asset-reinforcement']) {
        const file='assets/fs-icons/'+name+'.png';assert.ok(existsSync(file),file);
        assert.deepEqual([...readFileSync(file).subarray(0,8)],[137,80,78,71,13,10,26,10]);
    }
});

test('order art never exposes an opponent or a covered own order', () => {
    const sys={tokens:[{seat:0,order:'advance',faceUp:false},{seat:1,order:'deploy',faceUp:false}]};
    assert.equal(view.visibleOrder({seat:0},sys,sys.tokens[0],0),null);
    assert.equal(view.visibleOrder({seat:0},sys,sys.tokens[1],1),null);
    assert.equal(view.visibleOrder({seat:1},sys,sys.tokens[1],1),'deploy');
    assert.equal(view.visibleOrder({seat:1},sys,{seat:1,order:null},1),null);
    assert.equal(view.visibleOrder({seat:0},sys,{seat:1,order:'dominate',faceUp:true},1),'dominate');
});

test('planning actions use the correct artwork without changing command labels', () => {
    const state=rules.view(makeGame(),0),client=Object.create(Game.prototype);
    Object.assign(client,{state,mode:'idle',pending:null,status:'',net:{cmd(){}},highlightOrders(){},refresh(){}});
    const ctx={actions:[]};client.panelPlanning(state,ctx);
    assert.deepEqual(Array.from(ctx.actions,a=>[a.label,a.orderIcon]),[
        ['Наступление','advance'],['Развёртывание','deploy'],['Стратегия','strategize'],['Доминирование','dominate']]);
});

test('tile previews use the supplied asset images with accessible names', () => {
    function element(tag) { return { tagName:tag, children:[],textContent:'',append(...items){this.children.push(...items);} }; }
    const ui=loadScripts(['js/fs/FSUI.js'],{document:{createElement:element}}).get('FSUI');
    const tile=data.tiles.find(t=>t.id==='13A'),root=ui.tilePreview(tile);
    const all=node=>[node,...node.children.flatMap(all)];
    const images=all(root).filter(x=>x.tagName==='img');
    assert.ok(images.some(x=>x.src==='assets/fs-icons/asset-forge.png'&&x.alt==='Кузница'));
    assert.ok(images.some(x=>x.src==='assets/fs-icons/asset-cache.png'&&x.alt==='Запасы материалов'));
    assert.ok(images.every(x=>x.alt&&x.title));
});

test('late resource image loads invalidate tiles and repaint the current local preview', () => {
    const images=[];class Image { constructor(){images.push(this);} }
    const fs=loadScripts(['js/fs/FSView.js'],{Image}).get('FSView');
    const v=Object.create(fs),rec={drawn:'previous'},preview={ghost:{},sys:{},rec:{}},state={};let draw=null,updates=0;
    v.drawTile=(...args)=>draw=args;
    const board={assetImages:{},tiles:new Map([['s',rec]]),setupPreview:preview,previewState:state,onModelReady(){updates++;}};
    v.loadAssetImages(board);assert.equal(images.length,3);
    assert.equal(images[0].src,'assets/fs-icons/asset-forge.png');images[0].onload();
    assert.equal(board.assetImages.forge,images[0]);assert.equal(rec.drawn,'');assert.equal(updates,1);
    assert.deepEqual(draw,[preview.ghost,preview.sys,preview.rec,state]);
});


test('all token artwork is included in the asset scanner for builds', async () => {
    const scan=await collectRefs(process.cwd());
    for(const name of ['order-advance','order-deploy','order-strategize','order-dominate','asset-cache','asset-forge','asset-reinforcement']) {
        const path='assets/fs-icons/'+name+'.png';
        assert.ok(scan.refs.includes(path),path);assert.ok(!scan.missing.includes(path),path);
    }
});
