const $=id=>document.getElementById(id);
const suits=['♠','♥','♦','♣'], names=['spades','hearts','diamonds','clubs'];
let state, stream, busy=false, connected=false, toastTimer, lastSessionCheck=0;
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
  stream.onmessage=e=>{state=JSON.parse(e.data);render();};
  stream.onerror=()=>{connected=false;$('connection').textContent='Reconnecting…';if(state)render();if(token&&Date.now()-lastSessionCheck>10000){lastSessionCheck=Date.now();api('state').catch(e=>{if(!token)notify(e.message);});}};
}
function cardNode(card,button=false){
  const el=document.createElement(button?'button':'div');const s=Number(card[0]),r=Number(card.slice(1)),face=({11:'J',12:'Q',13:'K',14:'A'})[r]||r;
  el.className='card'+([1,2].includes(s)?' red':'');
  el.setAttribute('aria-label',`${face} of ${names[s]}`);
  const corner=document.createElement('span');corner.append(String(face),document.createElement('br'),suits[s]);
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
  const myIndex=s.players.findIndex(p=>p.id===s.you);const others=Array.from({length:s.players.length-1},(_,i)=>s.players[(myIndex+i+1)%s.players.length]);
  $('opponents').replaceChildren();
  others.forEach((p,i)=>{
    const position=others.length===1?0:others.length===2?(i===0?1:2):[1,0,2][i];
    const seat=elem('div',`seat pos-${position}`+(p.id===s.actor?' active':''));
    seat.append(elem('div','avatar',['🧑🏻','👩🏽','🧔🏾','👩🏼'][s.players.findIndex(x=>x.id===p.id)]),elem('div','seat-name',p.name));
    const role=p.out?'Out of cards':!p.online?'Reconnecting…':s.status==='waiting'?'Ready':p.id===s.defender?'Defender':p.id===s.attacker?'Lead attacker':'Attacker';
    seat.append(elem('div','seat-state',role+(s.status==='waiting'?'':` · ${p.count}`)));
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
    for(const pair of s.table){const el=elem('div','pair');el.append(cardNode(pair.attack));if(pair.defense){const d=cardNode(pair.defense);d.classList.add('defense');el.append(d);}$('battle').append(el);}
    if(s.status==='finished'){
      $('waiting').append(elem('h2','',s.loser===s.you?'The fool, this time.':s.loser?'One fool. Good company.':'Nobody’s fool.'),elem('p','',s.notice));
      $('turn-tag').textContent='THAT’S THE GAME';$('instruction').textContent='Another round?';$('hint').textContent='The host can deal again with the same players.';
      if(s.host===s.you)$('actions').append(actionButton('Play again','start'));
    }else{
      $('turn-tag').textContent=me.out?'YOU’RE OUT':myTurn?'YOUR TURN':'AT THE TABLE';
      let instruction,hint;
      if(myTurn&&s.stage==='defend'){instruction='Beat the attack.';hint='Play a highlighted card, or take the table.';$('actions').append(actionButton('Take cards','take',false));}
      else if(myTurn){instruction=s.taking?'One last throw-in?':s.table.length?'Keep the attack going?':'Your opening move.';hint=s.table.length?'Match a rank on the table, or pass.':'Play any card to begin the attack.';if(s.table.length)$('actions').append(actionButton('Pass','pass'));}
      else{instruction=me.out?'You’re safe. Enjoy the show.':`${actor?.name||'Your friend'} ${s.stage==='defend'?'is defending':'is attacking'}.`;hint=s.taking?'The defender is taking. Attackers can still throw in.':'Your playable cards light up when it’s your turn.';}
      const offline=s.players.filter(p=>!p.online&&!p.out&&p.id!==s.you);
      if(!connected)hint='Connection lost. Reconnecting automatically…';else if(offline.length)hint=`Waiting for ${offline.map(p=>p.name).join(', ')} to reconnect.`;
      $('instruction').textContent=instruction;$('hint').textContent=hint;
      if(!s.table.length)$('waiting').append(elem('p','',`${s.players.find(p=>p.id===s.defender)?.name} defends this round`));
    }
    const hand=[...s.hand].sort((a,b)=>(a[0]===s.trump?10:Number(a[0]))-(b[0]===s.trump?10:Number(b[0]))||Number(a.slice(1))-Number(b.slice(1)));
    for(const c of hand){const el=cardNode(c,true);const legal=s.legal.includes(c)&&!busy&&connected;el.disabled=!legal;if(legal)el.classList.add('playable');el.onclick=()=>move('play',c);$('hand').append(el);}
  }
  $('your-name').textContent=me.name+(s.host===s.you?' · Host':'');$('hand-count').textContent=`${s.hand.length} cards`;
}
$('copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(state.code);notify('Lobby code copied. Send it to your friends.');}catch{notify('Your lobby code is '+state.code);}};
$('leave').onclick=async()=>{try{await api('leave');clearSession();}catch(e){notify(e.message);}};
$('rules-button').onclick=()=>$('rules').showModal();$('close-rules').onclick=()=>$('rules').close();
$('rules').addEventListener('click',e=>{if(e.target===$('rules')){const r=$('rules').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('rules').close();}});
if(token)api('state').then(r=>{state=r.state;connect();render();}).catch(e=>notify(e.message));
