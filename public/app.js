const $=id=>document.getElementById(id);
const suits=['♠','♥','♦','♣'], names=['spades','hearts','diamonds','clubs'];
let state, stream, busy=false, connected=false, toastTimer, lastSessionCheck=0;
const activeFlights=new Set();
let token=sessionStorage.getItem('durak-token');
const nick=sessionStorage.getItem('durak-name');if(nick)$('name').value=nick;
const invite=new URLSearchParams(location.search).get('code');if(invite)$('code').value=invite.slice(0,6);
function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
async function api(action,data={}) {
  const response=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok){if(response.status===401)clearSession();throw Error(result.error||'Could not complete that move.');}return result;
}
function clearSession(){stream?.close();stream=null;token=null;state=null;connected=false;sessionStorage.removeItem('durak-token');$('game').hidden=true;$('welcome').hidden=false;$('connection').textContent='A table for friends';}
function connect(){
  stream?.close();stream=new EventSource('/events?token='+encodeURIComponent(token));
  stream.onopen=()=>{connected=true;$('connection').textContent='Connected to the table';if(state)render();};
  stream.onmessage=e=>{
    const previous=state;state=JSON.parse(e.data);render();
    if(previous&&state.lastMove&&previous.lastMove?.id!==state.lastMove.id)animateMove(state.lastMove);
  };
  stream.onerror=()=>{connected=false;$('connection').textContent='Reconnecting…';if(state)render();if(token&&Date.now()-lastSessionCheck>10000){lastSessionCheck=Date.now();api('state').catch(e=>{if(!token)notify(e.message);});}};
}
function cardNode(card,button=false){
  const el=document.createElement(button?'button':'div');const s=Number(card[0]),r=Number(card.slice(1)),face=({11:'J',12:'Q',13:'K',14:'A'})[r]||r;
  el.dataset.card=card;
  el.className='card'+([1,2].includes(s)?' red':'');
  el.setAttribute('aria-label',`${face} of ${names[s]}`);
  const corner=document.createElement('span');corner.append(String(face),document.createElement('br'),suits[s]);
  if(activeFlights.has(card))el.style.visibility='hidden';
  const symbol=document.createElement('b');symbol.textContent=suits[s];symbol.setAttribute('aria-hidden','true');el.append(corner,symbol);return el;
}
function elem(tag,className,text){const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;}
function actionButton(label,action,primary=true){const el=elem('button',primary?'primary':'secondary',label);el.disabled=busy||!connected;el.onclick=()=>move(action);return el;}
async function move(action,card){if(busy||!connected)return;busy=true;render();try{await api(action,{card});}catch(e){notify(e.message);}finally{busy=false;if(state)render();}}
$('lobby-form').onsubmit=async e=>{
  e.preventDefault();if(busy)return;const action=e.submitter?.value||'create';const name=$('name').value.trim(),code=$('code').value.trim();
  if(action==='join'&&!/^[a-f0-9]{6}$/i.test(code))return notify('Enter the six-character lobby code.');
  busy=true;for(const b of e.currentTarget.querySelectorAll('button'))b.disabled=true;
  try{const result=await api(action,{name,code});token=result.token;state=result.state;sessionStorage.setItem('durak-token',token);sessionStorage.setItem('durak-name',name);connect();render();}
  catch(e){notify(e.message);}finally{busy=false;document.querySelectorAll('#lobby-form button').forEach(b=>b.disabled=false);if(state)render();}
};
function render(){
  if(!state)return;const s=state,me=s.players.find(p=>p.id===s.you),myTurn=s.actor===s.you,actor=s.players.find(p=>p.id===s.actor);
  $('welcome').hidden=true;$('game').hidden=false;$('copy-code').textContent=s.code+' ⧉';$('round-label').textContent=s.status==='waiting'?'2–4 players':`Round ${s.round} · Trump ${suits[Number(s.trump)]}`;
  $('leave').hidden=s.status==='playing';
  renderRoles(s,me);
  const myIndex=s.players.findIndex(p=>p.id===s.you);const others=Array.from({length:s.players.length-1},(_,i)=>s.players[(myIndex+i+1)%s.players.length]);
  $('opponents').replaceChildren();
  others.forEach((p,i)=>{
    const position=others.length===1?0:others.length===2?(i===0?1:2):[1,0,2][i];
    const seat=elem('div',`seat pos-${position}`+(p.id===s.actor?' active':''));
    seat.dataset.player=p.id;
    seat.classList.add(p.id===s.defender?'defender-seat':'attacker-seat');
    seat.append(elem('div','avatar',['🧑🏻','👩🏽','🧔🏾','👩🏼'][s.players.findIndex(x=>x.id===p.id)]),elem('div','seat-name',p.name));
    const role=playerRole(p,s);
    seat.append(elem('div','role-badge'+(p.id===s.defender?' defense-badge':' attack-badge'),role));
    seat.append(elem('div','seat-state',!p.online?'Reconnecting…':s.status==='waiting'?'Ready':`${p.count} cards`));
    const backs=elem('div','mini-hand');for(let n=0;n<Math.min(p.count,6);n++)backs.append(elem('i','card-back'));seat.append(backs);$('opponents').append(seat);
  });
  $('stock').replaceChildren();$('discard').textContent='';$('battle').replaceChildren();$('waiting').replaceChildren();$('actions').replaceChildren();$('hand').replaceChildren();
  if(s.status==='waiting'){
    $('waiting').append(elem('h2','',`${s.players.length} at the table`),elem('p','',s.players.length<2?'Share your lobby code. A good game takes company.':'Everyone here? The host can deal the cards.'));
    $('turn-tag').textContent=me.id===s.host?'YOU’RE THE HOST':'YOUR SEAT IS SAVED';$('instruction').textContent='Make yourself comfortable.';$('hint').textContent='Send your friends the code above. They can join on any device.';
    if(s.host===s.you){const b=actionButton('Deal cards','start');b.disabled||=s.players.length<2;$('actions').append(b);}
  }else{
    if(s.deckCount)$('stock').append(cardNode(s.trumpCard));else $('stock').append(elem('strong','',suits[Number(s.trump)]));
    $('stock').append(elem('span','stock-label',`${s.deckCount} in deck`));$('discard').textContent=`${s.discardCount} discarded`;
    for(const pair of s.table){const el=elem('div','pair'+(!pair.defense&&!s.taking?' uncovered':''));el.append(elem('span','pair-label',pair.defense?'BEATEN':s.taking?'TAKING':'ATTACK'));el.append(cardNode(pair.attack));if(pair.defense){const d=cardNode(pair.defense);d.classList.add('defense');el.append(d);}$('battle').append(el);}
    if(s.status==='finished'){
      $('waiting').append(elem('h2','',s.loser===s.you?'The fool, this time.':s.loser?'One fool. Good company.':'Nobody’s fool.'),elem('p','',s.notice));
      $('turn-tag').textContent='THAT’S THE GAME';$('instruction').textContent='Another round?';$('hint').textContent='The host can deal again with the same players.';
      if(s.host===s.you)$('actions').append(actionButton('Play again','start'));
    }else{
      $('turn-tag').textContent=me.out?'YOU’RE OUT':myTurn?'YOUR TURN':'AT THE TABLE';
      let instruction,hint;
      if(myTurn&&s.stage==='defend'){instruction='You are defending.';hint='Play a highlighted card, or take the table.';$('actions').append(actionButton('Take cards','take',false));}
      else if(myTurn){instruction=s.taking?'One last throw-in?':s.table.length?'Your turn to add an attack.':'You attack first.';hint=s.table.length?'Match a rank on the table, or pass.':'Play any card to begin the attack.';if(s.table.length)$('actions').append(actionButton('Pass','pass'));}
      else{instruction=me.out?'You’re safe. Enjoy the show.':`Waiting for ${actor?.name||'your friend'} to ${s.stage==='defend'?'defend':'attack or pass'}.`;hint=s.taking?'The defender is taking. Attackers can still throw in.':'Your playable cards light up when it’s your turn.';}
      const offline=s.players.filter(p=>!p.online&&!p.out&&p.id!==s.you);
      if(!connected)hint='Connection lost. Reconnecting automatically…';else if(offline.length)hint=`Waiting for ${offline.map(p=>p.name).join(', ')} to reconnect.`;
      $('instruction').textContent=instruction;$('hint').textContent=hint;
      if(!s.table.length)$('waiting').append(elem('p','',`${s.players.find(p=>p.id===s.defender)?.name} defends this round`));
    }
    const hand=[...s.hand].sort((a,b)=>(a[0]===s.trump?10:Number(a[0]))-(b[0]===s.trump?10:Number(b[0]))||Number(a.slice(1))-Number(b.slice(1)));
    for(const c of hand){const el=cardNode(c,true);const legal=s.legal.includes(c)&&!busy&&connected;el.disabled=!legal;if(legal)el.classList.add('playable');el.onclick=()=>move('play',c);$('hand').append(el);}
  }
  $('your-role').textContent=s.status==='playing'?playerRole(me,s):'YOUR HAND';
  $('your-name').textContent=me.name+(s.host===s.you?' · Host':'');$('hand-count').textContent=`${s.hand.length} cards`;
}
$('copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(state.code);notify('Lobby code copied. Send it to your friends.');}catch{notify('Your lobby code is '+state.code);}};
$('leave').onclick=async()=>{try{await api('leave');clearSession();}catch(e){notify(e.message);}};
$('rules-button').onclick=()=>$('rules').showModal();$('close-rules').onclick=()=>$('rules').close();
$('rules').addEventListener('click',e=>{if(e.target===$('rules')){const r=$('rules').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('rules').close();}});
if(token)api('state').then(r=>{state=r.state;connect();render();}).catch(e=>notify(e.message));

function playerRole(p,s){
  if(s.status==='waiting')return p.id===s.host?'HOST':'AT THE TABLE';
  if(s.status==='finished')return p.id===s.loser?'DURAK':p.out?'SAFE':'DRAW';
  if(p.out)return 'OUT · SAFE';
  if(p.id===s.defender)return s.taking?'TAKING CARDS':p.id===s.actor?'DEFEND NOW':'DEFENDER';
  if(p.id===s.actor)return s.taking?'THROW IN OR PASS':'ATTACK NOW';
  return p.id===s.attacker?'LEAD ATTACKER':'WAITING TO ATTACK';
}
function displayName(id){const p=state.players.find(p=>p.id===id);return p?.name||'A player';}
function moveText(m){
  if(!m)return 'The table is ready. Share the code to invite your friends.';
  const who=displayName(m.player),target=displayName(m.target);
  const face=m.card?(({11:'J',12:'Q',13:'K',14:'A'})[Number(m.card.slice(1))]||m.card.slice(1))+suits[Number(m.card[0])]:'';
  let text=m.kind==='deal'?`${who} dealt a new game.`:m.kind==='attack'?`${who} attacked ${target} with ${face}.`:m.kind==='defense'?`${who} defended with ${face}.`:m.kind==='take'?`${who} chose to take the table.`:`${who} passed the attack.`;
  if(m.outcome)text+=m.outcome==='taken'?` ${target} picks up the cards.`:` ${target} beat the attack. Table cleared!`;
  return text;
}
function renderRoles(s,me){
  const strip=$('role-strip');strip.replaceChildren();strip.hidden=s.status!=='playing';
  if(s.status==='playing'){
    for(const [label,id,kind] of [['LEAD ATTACKER',s.attacker,'attack'],[s.taking?'TAKING CARDS':'DEFENDER',s.defender,'defense'],['TO PLAY',s.actor,'current']]){
      const tile=elem('div','role-tile '+kind);tile.append(elem('span','',label),elem('strong','',displayName(id)+(id===s.you?' (you)':'')));strip.append(tile);
    }
  }
  $('live-action').textContent=moveText(s.lastMove);
  $('live-action').dataset.kind=s.lastMove?.kind||'deal';
  $('table-status').textContent=s.status==='playing'?(s.taking?'PICKING UP':s.stage==='defend'?'DEFENCE IN PROGRESS':'ATTACKERS TO PLAY')+` · ${s.table.length} / ${s.limit} attacks`:'';
  $('turn-bar').classList.toggle('your-turn',s.status==='playing'&&s.actor===s.you);
  $('turn-bar').classList.toggle('defending',s.defender===s.you);
}
function animateMove(m){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const banner=$('live-action');banner.animate([{opacity:.35,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:260});
  const origin=m.player===state.you?$('hand'):Array.from(document.querySelectorAll('.seat')).find(el=>el.dataset.player===m.player);
  if(origin)origin.animate([{filter:'brightness(1)'},{filter:'brightness(1.5)'},{filter:'brightness(1)'}],{duration:500});
  if(!m.card)return;
  const target=Array.from($('battle').querySelectorAll('.card')).find(el=>el.dataset.card===m.card);
  const sourceRect=(origin||$('hand')).getBoundingClientRect();
  const destRect=(target||$('battle')).getBoundingClientRect();
  const flying=cardNode(m.card);flying.style.visibility='';activeFlights.add(m.card);flying.classList.add('flying-card');flying.setAttribute('aria-hidden','true');
  const w=target?destRect.width:72,h=target?destRect.height:102;
  const x=destRect.left+destRect.width/2-w/2,y=destRect.top+destRect.height/2-h/2;
  Object.assign(flying.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});document.body.append(flying);
  if(target)target.style.visibility='hidden';
  const dx=sourceRect.left+sourceRect.width/2-x-w/2,dy=sourceRect.top+sourceRect.height/2-y-h/2;
  const tilt=m.kind==='defense'?8:0;
  const animation=flying.animate([
    {transform:`translate(${dx}px,${dy}px) rotate(${m.kind==='defense'?-22:18}deg) scale(.7)`,opacity:.3},
    {offset:.75,transform:`translate(0,-12px) rotate(${tilt}deg) scale(1.12)`,opacity:1},
    {transform:`translate(0,0) rotate(${tilt}deg) scale(1)`,opacity:1}
  ],{duration:m.kind==='defense'?520:420,easing:'cubic-bezier(.2,.7,.25,1)',fill:'forwards'});
  animation.finished.then(()=>{
    activeFlights.delete(m.card);
    document.querySelectorAll('.card').forEach(el=>{if(el.dataset.card===m.card)el.style.visibility='';});
    if(target){target.style.visibility='';flying.remove();target.animate([{boxShadow:`0 0 0 5px ${m.kind==='defense'?'#84d9ef':'#e9bd71'}`},{boxShadow:'0 5px 10px #0005'}],{duration:450});}
    else {const fade=flying.animate([{opacity:1},{opacity:0,transform:'translateY(30px) scale(.8)'}],{duration:300,delay:180,fill:'forwards'});fade.finished.then(()=>flying.remove());}
  });
}
