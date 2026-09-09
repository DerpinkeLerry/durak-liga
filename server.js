import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {start,act,snapshot} from './game.js';
const rooms=new Map(), sessions=new Map(), rates=new Map();
const root=fileURLToPath(new URL('./public/',import.meta.url));
function json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function broadcast(room) {room.updated=Date.now();for(const p of room.players) for(const stream of p.streams) stream.write(`data: ${JSON.stringify(snapshot(room,p.id))}\n\n`);}
function player(name) {
  if(typeof name!=='string' || !name.trim() || name.trim().length>20) throw Error('Use a name between 1 and 20 characters.');
  return {id:randomUUID(),token:randomBytes(32).toString('hex'),name:name.trim(),hand:[],streams:new Set()};
}
async function body(req) {
  let data='';for await(const chunk of req){data+=chunk;if(data.length>4096)throw Error('Request too large.');}
  try {return JSON.parse(data);} catch {throw Error('Invalid request.');}
}
export const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  try {
    if(url.pathname==='/health') return json(res,200,{ok:true});
    if(url.pathname==='/events' && req.method==='GET') {
      const session=sessions.get(url.searchParams.get('token'));
      if(!session) return json(res,401,{error:'This lobby has expired. Create or join another.'});
      const {room,p}=session;
      if(p.streams.size>=4) return json(res,429,{error:'Too many connections.'});
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      res.write('retry: 2000\n\n');p.streams.add(res);broadcast(room);
      const timer=setInterval(()=>res.write(': heartbeat\n\n'),15000);
      res.on('close',()=>{clearInterval(timer);p.streams.delete(res);broadcast(room);});return;
    }
    if(url.pathname.startsWith('/api/') && req.method==='POST') {
      if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) return json(res,403,{error:'Invalid origin.'});
      const ip=req.socket.remoteAddress, now=Date.now(), rate=rates.get(ip);
      if(!rate || now-rate.time>60000) rates.set(ip,{time:now,count:1});
      else if(++rate.count>600) return json(res,429,{error:'Too many requests. Wait a moment.'});
      const data=await body(req), action=url.pathname.slice(5);
      if(action==='create' || action==='join') {
        const p=player(data.name);let room;
        if(action==='create') {
          if(rooms.size>=500) throw Error('The server is full. Try again later.');
          let code;do {code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
          room={code,status:'waiting',players:[],host:p.id,updated:now};rooms.set(code,room);
        } else {
          room=rooms.get(String(data.code).trim().toUpperCase());
          if(!room) throw Error('Lobby not found. Check the six-character code.');
          if(room.status!=='waiting') throw Error('That game has already started.');
          if(room.players.length>=4) throw Error('That table is full.');
        }
        room.players.push(p);sessions.set(p.token,{room,p});broadcast(room);
        return json(res,200,{token:p.token,state:snapshot(room,p.id)});
      }
      const session=sessions.get(req.headers.authorization?.replace(/^Bearer /,''));
      if(!session) return json(res,401,{error:'Your session expired. Please join again.'});
      const {room,p}=session;
      if(action==='state') return json(res,200,{state:snapshot(room,p.id)});
      if(action==='start') {
        if(room.host!==p.id) throw Error('Only the host can deal.');
        if(room.status==='playing') throw Error('A game is already in progress.');
        if(room.players.some(p=>!p.streams.size)) throw Error('Wait for everyone to reconnect before dealing.');
        start(room);
        room.lastMove={id:(room.lastMove?.id||0)+1,kind:"deal",player:p.id};
      } else if(action==='leave') {
        if(room.status==='playing') throw Error('Finish the game before leaving. Refresh to reconnect.');
        sessions.delete(p.token);room.players=room.players.filter(x=>x!==p);for(const s of p.streams)s.end();
        if(room.host===p.id) room.host=room.players[0]?.id;
        if(!room.players.length) rooms.delete(room.code);
      } else {
        const round=room.round, target=room.players[room.defender]?.id;
        const taking=room.taking||action==='take';
        const kind=action==='play'?(room.stage==='defend'?'defense':'attack'):action;
        act(room,p.id,action,data.card);
        room.lastMove={id:(room.lastMove?.id||0)+1,kind,player:p.id,target,
          ...(action==='play'?{card:data.card}:{}),
          outcome:room.round!==round||room.status==='finished'?(taking?'taken':'defended'):null};
      }
      broadcast(room);return json(res,200,{ok:true});
    }
    const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
    if(req.method!=='GET' || !files[url.pathname]) return json(res,404,{error:'Not found.'});
    const name=files[url.pathname], type=name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html';
    res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-cache'});res.end(await readFile(root+name));
  } catch(error) {if(!res.headersSent)json(res,400,{error:error.message});else res.end();}
});
const cleanup=setInterval(()=>{
  for(const [code,room] of rooms) if(Date.now()-room.updated>2*60*60*1000 && room.players.every(p=>!p.streams.size)) {
    rooms.delete(code);for(const p of room.players)sessions.delete(p.token);
  }
  for(const [ip,r] of rates)if(Date.now()-r.time>60000)rates.delete(ip);
},60000);cleanup.unref();
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Durak is ready.'));
