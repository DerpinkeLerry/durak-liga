import test from 'node:test';
import assert from 'node:assert/strict';
import {start,act,beats,legalCards,snapshot} from '../game.js';
function room(n=2){return {code:'ABC123',players:Array.from({length:n},(_,i)=>({id:String(i),name:`Player ${i}`,hand:[],streams:new Set()}))};}
function fixture(){const r=room();Object.assign(r,{status:'playing',deck:[],discard:[],trump:'3',trumpCard:'314',attacker:0,defender:1,actor:0,stage:'attack',table:[],order:[0],priority:0,limit:2,round:1,taking:false});r.players[0].hand=['06','16','010'];r.players[1].hand=['07','18'];return r;}
test('trumps and same-suit higher cards beat correctly',()=>{assert.equal(beats('07','06','3'),true);assert.equal(beats('16','06','3'),false);assert.equal(beats('36','014','3'),true);assert.equal(beats('014','36','3'),false);assert.equal(beats('37','36','3'),true);});
test('initial deal, lowest trump and privacy',()=>{const r=room(4);start(r);assert.equal(r.deck.length,12);assert.equal(r.trumpCard,r.deck[0]);const all=r.players.flatMap(p=>p.hand).concat(r.deck);assert.equal(new Set(all).size,36);const trumps=r.players.flatMap((p,i)=>p.hand.filter(c=>c[0]===r.trump).map(c=>({i,rank:+c.slice(1)}))).sort((a,b)=>a.rank-b.rank);if(trumps.length)assert.equal(r.attacker,trumps[0].i);const s=snapshot(r,'0');assert.equal(s.hand.length,6);assert.ok(s.players.every(p=>!('hand'in p)&&!('token'in p)));assert.ok(!('deck'in s));});
test('illegal moves never mutate the game',()=>{const r=fixture();const before=JSON.stringify(r);assert.throws(()=>act(r,'1','play','07'));assert.throws(()=>act(r,'0','play','314'));assert.throws(()=>act(r,'0','pass'));assert.equal(JSON.stringify(r),before);});
test('successful defense changes attacker, enforces matching ranks',()=>{const r=fixture();act(r,'0','play','06');assert.deepEqual(legalCards(r,'1'),['07']);act(r,'1','play','07');assert.deepEqual(legalCards(r,'0'),['16']);act(r,'0','pass');assert.equal(r.attacker,1);assert.deepEqual(r.discard,['06','07']);});
test('pickup permits throw-ins then skips defender',()=>{const r=fixture();act(r,'0','play','06');act(r,'1','take');act(r,'0','play','16');assert.equal(r.attacker,0);assert.ok(r.players[1].hand.includes('06'));assert.ok(r.players[1].hand.includes('16'));assert.equal(r.table.length,0);});
test('other attackers receive priority in order',()=>{const r=fixture();r.players.push({id:'2',name:'Third',hand:['26','28']});r.order=[0,2];act(r,'0','play','06');act(r,'1','play','07');act(r,'0','pass');assert.equal(r.actor,2);act(r,'2','play','26');assert.equal(r.actor,1);act(r,'1','take');assert.ok(r.players[1].hand.includes('26'));});
test('last trump goes to the lead attacker before defender refills',()=>{const r=fixture();r.deck=['314'];act(r,'0','play','06');act(r,'1','play','07');act(r,'0','pass');assert.ok(r.players[0].hand.includes('314'));assert.equal(r.deck.length,0);});
test('last player loses; simultaneous empty hands draw',()=>{const r=fixture();r.players[0].hand=['06'];r.players[1].hand=['07','18'];act(r,'0','play','06');act(r,'1','take');assert.equal(r.status,'finished');assert.equal(r.loser,'1');const d=fixture();d.players[0].hand=['06'];d.players[1].hand=['07'];d.limit=1;act(d,'0','play','06');act(d,'1','play','07');assert.equal(d.status,'finished');assert.equal(d.loser,null);});
test('complete 2–4 player games preserve all 36 cards and reach an ending',()=>{
  for(let n=2;n<=4;n++)for(let trial=0;trial<12;trial++){
    const r=room(n);start(r);let steps=0;
    while(r.status==='playing'&&steps++<12000){
      const id=r.players[r.actor].id,legal=legalCards(r,id);
      if(legal.length)act(r,id,'play',legal[0]);else act(r,id,r.stage==='defend'?'take':'pass');
      const all=[...r.deck,...r.discard,...r.players.flatMap(p=>p.hand),...r.table.flatMap(p=>p.defense?[p.attack,p.defense]:[p.attack])];
      assert.equal(all.length,36);assert.equal(new Set(all).size,36);
      if(r.status==='playing'){assert.ok(r.actor!==undefined);assert.ok(r.table.length<=r.limit);}
    }
    assert.equal(r.status,'finished');
  }
});
