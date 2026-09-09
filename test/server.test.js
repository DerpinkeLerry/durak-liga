import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.js';
test('two real HTTP clients join, receive private streams, play, and reconnect',async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const controllers=[];
  const api=async(action,data={},token)=>{const r=await fetch(base+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return {status:r.status,...await r.json()};};
  const stream=async(token)=>{const controller=new AbortController();controllers.push(controller);const r=await fetch(base+'/events?token='+token,{signal:controller.signal});assert.equal(r.status,200);const reader=r.body.getReader();let buffer='';return {controller,next:async()=>{while(true){const split=buffer.indexOf('\n\n');if(split>=0){const msg=buffer.slice(0,split);buffer=buffer.slice(split+2);if(msg.startsWith('data: '))return JSON.parse(msg.slice(6));continue;}const {value,done}=await reader.read();if(done)throw Error('Stream closed');buffer+=new TextDecoder().decode(value);}}};};
  try {
    assert.equal((await fetch(base+'/')).status,200);
    const a=await api('create',{name:'Alice'}),b=await api('join',{name:'Bob',code:a.state.code});assert.equal(a.status,200);assert.equal(b.status,200);
    const sa=await stream(a.token),sb=await stream(b.token);
    assert.equal((await api('start',{},b.token)).status,400);
    assert.equal((await api('start',{},a.token)).status,200);
    let first;do{first=await sa.next();}while(first.status!=='playing');let second;do{second=await sb.next();}while(second.status!=='playing');
    assert.equal(first.hand.length,6);assert.equal(second.hand.length,6);assert.ok(first.hand.every(c=>!second.hand.includes(c)));
    const attacker=first.actor===first.you?a:b,defender=attacker===a?b:a;
    const active=(await api('state',{},attacker.token)).state;
    assert.equal((await api('play',{card:active.legal[0]},defender.token)).status,400);
    assert.equal((await api('play',{card:active.legal[0]},attacker.token)).status,200);
    const after=(await api('state',{},defender.token)).state;assert.equal(after.table.length,1);assert.equal(after.actor,after.you);
    assert.equal(after.lastMove.kind,'attack');assert.equal(after.lastMove.card,active.legal[0]);assert.equal(after.lastMove.player,active.you);assert.equal(after.lastMove.target,after.you);assert.equal(after.lastMove.id,active.lastMove.id+1);
    sa.controller.abort();await new Promise(r=>setTimeout(r,20));
    const reconnect=await stream(a.token);const resumed=await reconnect.next();assert.equal(resumed.you,first.you);assert.equal(resumed.table.length,1);assert.deepEqual(resumed.lastMove,after.lastMove);
    assert.equal((await api('join',{name:'Late',code:first.code})).status,400);
    assert.equal((await api('state',{},'fake')).status,401);
  } finally {controllers.forEach(c=>c.abort());server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('server performs forced moves and continues after a live departure',async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const controllers=[],players=[];
  const api=async(action,data={},token)=>{const r=await fetch(base+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return {status:r.status,...await r.json()};};
  try{
    const first=await api('create',{name:'Host'});players.push(first);
    for(const name of ['Second','Third'])players.push(await api('join',{name,code:first.state.code}));
    for(const p of players){const c=new AbortController();controllers.push(c);const res=await fetch(base+'/events?token='+p.token,{signal:c.signal});assert.equal(res.status,200);}
    assert.equal((await api('start',{},first.token)).status,200);
    let automatic=false;
    for(let i=0;i<100;i++){
      const all=await api('state',{},first.token);assert.equal(all.state.status,'playing');
      const p=players.find(p=>p.state.you===all.state.actor);const {state:s}=await api('state',{},p.token);
      if(!s.legal.length){
        await new Promise(r=>setTimeout(r,1100));
        const {state:after}=await api('state',{},p.token);assert.ok(after.lastMove.id>s.lastMove.id);assert.equal(after.lastMove.automatic,true);automatic=true;break;
      }
      assert.equal((await api('play',{card:s.legal[0]},p.token)).status,200);
    }
    assert.equal(automatic,true);
    assert.equal((await api('leave',{},first.token)).status,200);
    const {state:continued}=await api('state',{},players[1].token);
    assert.equal(continued.players.length,2);assert.equal(continued.status,'playing');assert.equal(continued.host,players[1].state.you);
    assert.equal((await api('state',{},first.token)).status,401);
    assert.equal((await api('leave',{},players[1].token)).status,200);
    const {state:waiting}=await api('state',{},players[2].token);assert.equal(waiting.status,'waiting');assert.equal(waiting.players.length,1);
    const newcomer=await api('join',{name:'New friend',code:waiting.code});assert.equal(newcomer.status,200);players.push(newcomer);
  } finally {
    for(const p of players)await api('leave',{},p.token);
    controllers.forEach(c=>c.abort());server.closeAllConnections();await new Promise(r=>server.close(r));
  }
});
