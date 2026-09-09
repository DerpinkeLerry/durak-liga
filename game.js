import { randomInt } from 'node:crypto';
export const suits = ['♠','♥','♦','♣'];
export const rank = c => Number(c.slice(1));
export const suit = c => suits[Number(c[0])];
export function beats(card, attack, trump) {
  return card[0] === attack[0] ? rank(card) > rank(attack) : card[0] === trump;
}
const fail = message => { throw new Error(message); };
export function start(room) {
  if (room.players.length < 2) fail('You need at least two players.');
  const deck = suits.flatMap((_,s) => Array.from({length:9},(_,i)=>`${s}${i+6}`));
  for(let i=deck.length-1;i>0;i--) { const j=randomInt(i+1); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  room.players.forEach(p=>{ p.hand=[]; p.out=false; });
  for(let i=0;i<6;i++) for(const p of room.players) p.hand.push(deck.pop());
  room.deck=deck; room.trumpCard=deck[0]; room.trump=deck[0][0]; room.discard=[];
  room.status='playing'; room.round=0; room.loser=null;
  let low=15, first=0;
  room.players.forEach((p,i)=>p.hand.forEach(c=>{if(c[0]===room.trump && rank(c)<low){low=rank(c);first=i;}}));
  begin(room,first);
}
function next(room,i) {
  for(let n=1;n<=room.players.length;n++) { const j=(i+n)%room.players.length; if(!room.players[j].out) return j; }
}
function begin(room,attacker) {
  room.attacker=attacker; room.defender=next(room,attacker); room.table=[];
  room.limit=Math.min(6,room.players[room.defender].hand.length);
  room.taking=false; room.round++; room.stage='attack';
  room.order=[];
  for(let n=0;n<room.players.length;n++) {
    const i=(attacker+n)%room.players.length;
    if(i!==room.defender && !room.players[i].out) room.order.push(i);
  }
  resetPriority(room);
  room.notice=`${room.players[attacker].name} attacks. ${room.players[room.defender].name} defends.`;
}
function resetPriority(room) {
  room.priority=0;
  while(room.priority<room.order.length && !room.players[room.order[room.priority]].hand.length) room.priority++;
  room.actor=room.order[room.priority];
}
function finishBout(room) {
  const defender=room.defender, taking=room.taking;
  const cards=room.table.flatMap(p=>p.defense?[p.attack,p.defense]:[p.attack]);
  if(taking) room.players[defender].hand.push(...cards); else room.discard.push(...cards);
  // Principal attacker first, other players clockwise, defender last.
  for(const i of [...room.order,defender]) {
    const p=room.players[i];
    while(p.hand.length<6 && room.deck.length) p.hand.push(room.deck.pop());
  }
  if(!room.deck.length) room.players.forEach(p=>{p.out=p.hand.length===0;});
  const remaining=room.players.filter(p=>!p.out);
  if(remaining.length<=1) {
    room.status='finished'; room.loser=remaining[0]?.id??null; room.table=[];
    room.notice=remaining.length?`${remaining[0].name} is the Durak!`:'A draw — everyone is out!'; return;
  }
  const newAttacker=taking || room.players[defender].out ? next(room,defender) : defender;
  begin(room,newAttacker);
}
export function legalCards(room,id) {
  const i=room.players.findIndex(p=>p.id===id), p=room.players[i];
  if(room.status!=='playing' || i!==room.actor || !p) return [];
  if(room.stage==='defend') {
    const attack=room.table.find(p=>!p.defense).attack;
    return p.hand.filter(c=>beats(c,attack,room.trump));
  }
  if(room.table.length>=room.limit) return [];
  if(!room.table.length) return p.hand.slice();
  const ranks=room.table.flatMap(p=>[rank(p.attack),...(p.defense?[rank(p.defense)]:[])]);
  return p.hand.filter(c=>ranks.includes(rank(c)));
}
export function act(room,id,action,card) {
  if(room.status!=='playing') fail('This game is not in progress.');
  const i=room.players.findIndex(p=>p.id===id);
  if(i!==room.actor) fail('Please wait for your turn.');
  if(action==='play') {
    if(!legalCards(room,id).includes(card)) fail('That card cannot be played here.');
    room.players[i].hand.splice(room.players[i].hand.indexOf(card),1);
    if(room.stage==='defend') {
      room.table.find(p=>!p.defense).defense=card;
      room.stage='attack'; resetPriority(room);
      if(room.table.length===room.limit || room.actor===undefined) finishBout(room);
    } else {
      room.table.push({attack:card,defense:null});
      if(room.taking) {
        resetPriority(room);
        if(room.table.length===room.limit || room.actor===undefined) finishBout(room);
      } else {room.stage='defend'; room.actor=room.defender;}
    }
  } else if(action==='take') {
    if(room.stage!=='defend') fail('You can only take while defending.');
    room.taking=true; room.stage='attack'; resetPriority(room);
    if(room.table.length===room.limit || room.actor===undefined) finishBout(room);
  } else if(action==='pass') {
    if(room.stage!=='attack' || !room.table.length) fail('Play an opening card first.');
    do {room.priority++;} while(room.priority<room.order.length && !room.players[room.order[room.priority]].hand.length);
    room.actor=room.order[room.priority];
    if(room.actor===undefined) finishBout(room);
  } else fail('Unknown action.');
}
export function snapshot(room,id) {
  const me=room.players.find(p=>p.id===id);
  return {code:room.code,status:room.status,host:room.host,you:id,
    players:room.players.map(p=>({id:p.id,name:p.name,count:p.hand.length,out:p.out,online:!!p.streams?.size})),
    hand:me?.hand??[],trump:room.trump,trumpCard:room.trumpCard,deckCount:room.deck?.length??0,
    discardCount:room.discard?.length??0,table:room.table??[],attacker:room.players[room.attacker]?.id,
    defender:room.players[room.defender]?.id,actor:room.players[room.actor]?.id,
    stage:room.stage,taking:room.taking,limit:room.limit,round:room.round,notice:room.notice,
    lastMove:room.lastMove,loser:room.loser,legal:legalCards(room,id)};
}
