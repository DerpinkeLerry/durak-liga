const $=id=>document.getElementById(id);
const suits=['♠','♥','♦','♣'], names=['spades','hearts','diamonds','clubs'];
let state, stream, busy=false, connected=false, toastTimer, lastSessionCheck=0;
const activeFlights=new Set();
const touchHand=matchMedia('(max-width:760px), (pointer:coarse)');
let selectedCard=null,handPage=0;
let token=sessionStorage.getItem('durak-token');
const nick=sessionStorage.getItem('durak-name');if(nick)$('name').value=nick;
const invite=new URLSearchParams(location.search).get('code');if(invite)$('code').value=invite.slice(0,6);
function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
async function api(action,data={}) {
  const response=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok){if(response.status===401)clearSession();throw Error(result.error||'Could not complete that move.');}return result;
}
function clearSession(){selectedCard=null;handPage=0;stream?.close();stream=null;token=null;state=null;connected=false;sessionStorage.removeItem('durak-token');$('game').hidden=true;$('welcome').hidden=false;$('connection').textContent='A table for friends';}
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
function actionButton(label,action,primary=true){const el=elem('button',primary?'primary':'secondary',label);el.dataset.action=action;el.disabled=busy||!connected;el.onclick=()=>move(action);return el;}
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
  if(!s.legal.includes(selectedCard))selectedCard=null;
  $('hand-pager').replaceChildren();$('hand-pager').hidden=true;
  $('welcome').hidden=true;$('game').hidden=false;$('copy-code').textContent=s.code+' ⧉';$('round-label').textContent=s.status==='waiting'?'2–4 players':`Round ${s.round} · Trump ${suits[Number(s.trump)]}`;
  $('leave').hidden=false;$('leave').disabled=busy;
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
      if(myTurn&&!s.legal.length){
        $('actions').replaceChildren(elem('span','auto-move',s.stage==='defend'?'Taking automatically…':'Passing automatically…'));
        hint=s.stage==='defend'?'No card can beat this attack. The table is being picked up.':'No matching rank. Your turn passes automatically.';
      }
      const offline=s.players.filter(p=>!p.online&&!p.out&&p.id!==s.you);
      if(!connected)hint='Connection lost. Reconnecting automatically…';else if(offline.length)hint=`Waiting for ${offline.map(p=>p.name).join(', ')} to reconnect.`;
      $('instruction').textContent=instruction;$('instruction').title=instruction;$('hint').textContent=hint;$('hint').title=hint;
      if(!s.table.length)$('waiting').append(elem('p','',`${s.players.find(p=>p.id===s.defender)?.name} defends this round`));
    }
    const hand=[...s.hand].sort((a,b)=>(a[0]===s.trump?10:Number(a[0]))-(b[0]===s.trump?10:Number(b[0]))||Number(a.slice(1))-Number(b.slice(1)));
    const pageSize=4,totalPages=Math.max(1,Math.ceil(hand.length/pageSize));
    handPage=Math.min(handPage,totalPages-1);
    const shown=touchHand.matches?hand.slice(handPage*pageSize,(handPage+1)*pageSize):hand;
    $('hand').classList.toggle('touch-hand',touchHand.matches);
    for(const [index,c] of shown.entries()){
      const el=cardNode(c,true),legal=s.legal.includes(c)&&!busy&&connected;
      el.disabled=!legal;if(legal)el.classList.add('playable');
      el.classList.toggle('selected',c===selectedCard);el.setAttribute('aria-pressed',String(c===selectedCard));
      const fan=shown.length===1?0:(index/(shown.length-1)-.5);
      el.style.setProperty('--fan-angle',(fan*12)+'deg');el.style.setProperty('--fan-drop',(Math.abs(fan)*12)+'px');
      el.onclick=()=>{if(touchHand.matches){selectedCard=selectedCard===c?null:c;render();}else move('play',c);};$('hand').append(el);
    }
    if(touchHand.matches&&hand.length){
      const pager=$('hand-pager');pager.hidden=false;
      const back=elem('button','quiet','‹');back.setAttribute('aria-label','Previous cards');back.disabled=handPage===0;back.onclick=()=>{handPage--;selectedCard=null;render();};
      const forward=elem('button','quiet','›');forward.setAttribute('aria-label','Next cards');forward.disabled=handPage===totalPages-1;forward.onclick=()=>{handPage++;selectedCard=null;render();};
      pager.append(back,elem('span','',`${handPage*pageSize+1}–${Math.min((handPage+1)*pageSize,hand.length)} / ${hand.length}${myTurn&&s.legal.length?' · '+s.legal.length+' playable':''}`),forward);
      if(myTurn&&s.legal.length){
        const play=actionButton(selectedCard?'Play '+cardLabel(selectedCard):'Select a card','play');
        play.disabled=busy||!connected||!selectedCard;play.onclick=()=>{const c=selectedCard;selectedCard=null;move('play',c);};$('actions').prepend(play);
      }
    }

  }
  $('your-role').textContent=s.status==='playing'?playerRole(me,s):'YOUR HAND';
  const dock=document.querySelector('.action-dock');
  dock.classList.toggle('dock-active',myTurn&&s.status==='playing');
  dock.classList.toggle('dock-defense',s.stage==='defend');
  if(!$('actions').childElementCount)$('actions').append(elem('span','dock-idle',s.status==='waiting'?'Waiting for the host':s.status==='finished'?'Waiting for a rematch':myTurn?'Choose a card':'Waiting for your turn'));
  requestAnimationFrame(fitHand);
  $('your-name').textContent=me.name+(s.host===s.you?' · Host':'');$('hand-count').textContent=`${s.hand.length} cards`;
}
$('copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(state.code);notify('Lobby code copied. Send it to your friends.');}catch{notify('Your lobby code is '+state.code);}};
$('leave').onclick=async()=>{
  if(busy)return;busy=true;stream?.close();$('leave').disabled=true;
  try{await api('leave');clearSession();notify('You left the table.');}
  catch(e){notify(e.message);if(token)connect();}
  finally{busy=false;if(state)render();}
};
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
  if(m.kind==='leave')return `${m.name||'A player'} left the table. ${state.status==='waiting'?'Waiting for another player.':state.status==='finished'?'The game is over.':'The game continues.'}`;
  const who=displayName(m.player),target=displayName(m.target);
  const face=m.card?(({11:'J',12:'Q',13:'K',14:'A'})[Number(m.card.slice(1))]||m.card.slice(1))+suits[Number(m.card[0])]:'';
  let text=m.kind==='deal'?`${who} dealt a new game.`:m.kind==='attack'?`${who} attacked ${target} with ${face}.`:m.kind==='defense'?`${who} defended with ${face}.`:m.kind==='take'?`${who} chose to take the table.`:`${who} passed the attack.`;
  if(m.automatic)text=m.kind==='take'?`${who} cannot defend — taking automatically.`:`${who} has no matching card — automatic pass.`;
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
  $('live-action').title=moveText(s.lastMove);
  $('live-action').dataset.kind=s.lastMove?.kind||'deal';
  $('table-status').textContent=s.status==='playing'?(s.taking?'PICKING UP':s.stage==='defend'?'DEFENCE IN PROGRESS':'ATTACKERS TO PLAY')+` · ${s.table.length} / ${s.limit} attacks`:'';
  $('turn-bar').classList.toggle('your-turn',s.status==='playing'&&s.actor===s.you);
  $('turn-bar').classList.toggle('defending',s.defender===s.you);
}
function animateMove(m){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const banner=$('live-action');if(!banner.hidden)banner.animate([{opacity:.35,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:260});
  const origin=m.player===state.you?$('hand'):Array.from(document.querySelectorAll('.seat')).find(el=>el.dataset.player===m.player);
  if(origin)origin.animate([{filter:'brightness(1)'},{filter:'brightness(1.5)'},{filter:'brightness(1)'}],{duration:500});
  if(m.outcome||m.kind==='defense'||m.automatic)impactEffect(m);
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

// Overlap cards within the reserved hand area instead of growing or scrolling it.
function fitHand(){
  const hand=$('hand'),cards=hand.querySelectorAll('.card');
  if(!matchMedia('(min-width:761px)').matches||cards.length<2){hand.style.removeProperty('--hand-overlap');return;}
  if(touchHand.matches){hand.style.removeProperty('--hand-overlap');return;}
  const available=hand.clientWidth-64, width=cards[0].offsetWidth;
  const overlap=Math.min(-width*.48,(available-width*cards.length)/(cards.length-1));
  hand.style.setProperty('--hand-overlap',overlap+'px');
}
new ResizeObserver(fitHand).observe($('hand'));

function impactEffect(move){
  const rect=document.querySelector('.felt').getBoundingClientRect();
  const color=move.kind==='defense'||move.outcome==='defended'?'#8ed6eb':'#e9bd71';
  const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
  const wave=elem('div','impact-wave');wave.setAttribute('aria-hidden','true');
  Object.assign(wave.style,{left:x+'px',top:y+'px',borderColor:color});document.body.append(wave);
  const delay=move.card?360:0;
  wave.animate([{transform:'translate(-50%,-50%) scale(.2)',opacity:0},{offset:.15,opacity:.8},{transform:'translate(-50%,-50%) scale(2.4)',opacity:0}],{duration:700,delay,fill:'both'}).finished.then(()=>wave.remove());
  if(move.kind==='defense')for(let i=0;i<8;i++){
    const spark=elem('i','impact-spark');spark.setAttribute('aria-hidden','true');
    Object.assign(spark.style,{left:x+'px',top:y+'px',background:color});document.body.append(spark);
    const a=i*Math.PI/4,dx=Math.cos(a)*80,dy=Math.sin(a)*50;
    spark.animate([{transform:'translate(0,0) scale(0)',opacity:0},{offset:.15,opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.2)`,opacity:0}],{duration:600,delay,fill:'both'}).finished.then(()=>spark.remove());
  }
}

function cardLabel(c){return (({11:'J',12:'Q',13:'K',14:'A'})[Number(c.slice(1))]||c.slice(1))+suits[Number(c[0])];}
touchHand.addEventListener('change',()=>{selectedCard=null;handPage=0;if(state)render();});
