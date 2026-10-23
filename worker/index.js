/** Cloudflare Workers + SQLite Durable Object multiplayer server.
 * All authority and sealed negotiation data stay here, never in a student's state snapshot.
 */
import {createGame,startGame,endTurn,activeTeam,standings,publicState,IDS,clone,log} from '../engine.js';
import {resolveTeamCommand} from '../multiplayer.js';

const CODE=/^[A-HJ-NP-Z2-9]{6}$/;
const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode(){const v=new Uint8Array(6);crypto.getRandomValues(v);return Array.from(v,b=>chars[b%chars.length]).join('');}
export function makeToken(){const a=new Uint8Array(32);crypto.getRandomValues(a);return Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');}
async function hash(x){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const err=(message,status=400)=>json({ok:false,error:message},status);
function getToken(request,url){return (request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'')||url.searchParams.get('token')||''}
function limited(x,max=12000){return typeof x==='string'&&x.length<max}
async function getBody(request){try{const s=await request.text();if(s.length>12000)return null;return JSON.parse(s)}catch{return null}}

export class GameRoom {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async data(){return await this.ctx.storage.get('room')||null;}
 async save(room){await this.ctx.storage.put('room',room)}
 async auth(room,token){if(!room||!limited(token,100))return {role:'none'};const h=await hash(token);if(h===room.teacherHash)return {role:'host'};for(const [id,p] of Object.entries(room.participants))if(p.hash===h)return {role:'student',id,team:p.team||null};return {role:'none'};}
 snapshot(room,identity){const g=room.game;const base={type:'snapshot',ok:true,code:room.code,role:identity.role,public:{...publicState(g),scores:standings(g)}};
  if(identity.role==='host')return {...base,full:g,requests:Object.fromEntries(Object.entries(room.participants).filter(([,p])=>!p.team).map(([id,p])=>[id,{preferred:p.preferred}])),seats:Object.fromEntries(Object.entries(room.participants).filter(([,p])=>p.team).map(([id,p])=>[id,p.team]))};
  if(identity.role==='student'){const team=identity.team;return {...base,team,private:team?{team:g.teams[team],offers:g.offers.filter(o=>o.from===team||o.to===team)}:null};}
  return {ok:false,error:'Unauthenticated'};
 }
 async announce(room){for(const ws of this.ctx.getWebSockets())try{const attach=ws.deserializeAttachment();const identity=attach?.role==='host'?{role:'host'}:attach?.role==='student'?{role:'student',id:attach.id,team:room.participants[attach.id]?.team||null}:{role:'none'};
    if(identity.role==='none'){ws.close(1008,'Session removed');continue}ws.send(JSON.stringify(this.snapshot(room,identity)));
   }catch(e){try{ws.close(1011,'Refresh to reconnect')}catch{}}
 }
 async fetch(req){const url=new URL(req.url);const op=url.pathname.split('/').pop();const room=await this.data();
  if(op==='create'){
   if(req.method!=='POST')return err('Method not allowed',405);
   if(room)return err('This room code is already in use',409);
   const body=await getBody(req);if(!CODE.test(body?.code||''))return err('Invalid room code');
   const token=makeToken(),game=createGame(crypto.getRandomValues(new Uint32Array(1))[0]);
   const created={code:body.code,teacherHash:await hash(token),participants:{},game,ids:0,receipts:{},createdAt:Date.now()};await this.save(created);
   return json({ok:true,code:body.code,token,snapshot:this.snapshot(created,{role:'host'})},201);
  }
  if(!room)return err('Room not found',404);
  if(op==='join'){
   if(req.method!=='POST')return err('Method not allowed',405);
   const body=await getBody(req);if(!IDS.includes(body?.preferred))return err('Choose a valid country');
   if(Object.keys(room.participants).length>=18)return err('Classroom room is full',429);
   const token=makeToken(),id='team-'+(++room.ids);room.participants[id]={hash:await hash(token),team:null,preferred:body.preferred,createdAt:Date.now()};await this.save(room);await this.announce(room);
   return json({ok:true,code:room.code,token,id,snapshot:this.snapshot(room,{role:'student',id,team:null})},201);
  }
  const who=await this.auth(room,getToken(req,url));if(who.role==='none')return err('Invalid room credentials',401);
  if(op==='snapshot')return json(this.snapshot(room,who));
  if(op==='ws'){
   if(req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return err('WebSocket required',426);
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server);server.serializeAttachment(who.role==='host'?{role:'host'}:{role:'student',id:who.id});server.send(JSON.stringify(this.snapshot(room,who)));
   return new Response(null,{status:101,webSocket:client});
  }
  if(req.method!=='POST')return err('Method not allowed',405);
  const body=await getBody(req);if(!body||typeof body!=='object')return err('Invalid request');
  if(op==='assign'){
   if(who.role!=='host')return err('Teacher access required',403);
   if(!room.participants[body.id]||!IDS.includes(body.team))return err('Invalid student or country');
   if(Object.entries(room.participants).some(([id,p])=>id!==body.id&&p.team===body.team))return err('That country has already been assigned',409);
   room.participants[body.id].team=body.team;await this.save(room);await this.announce(room);return json({ok:true});
  }
  if(op==='control'){
   if(who.role!=='host')return err('Teacher access required',403);
   let g=room.game;
   if(body.action==='start'){if(g.phase!=='lobby')return err('Game has already started');g=startGame(g)}
   else if(body.action==='next'){if(g.phase!=='playing'||g.finished)return err('Game is not active');g=endTurn(g)}
   else if(body.action==='end'){if(g.finished)return err('Game already ended');g=clone(g);g.finished=true;g.phase='ended';g.winner=standings(g)[0].id;log(g,'Teacher ended the campaign. Final strategy scores are recorded.','historical')}
   else return err('Unknown teacher control');
   room.game=g;await this.save(room);await this.announce(room);return json({ok:true,snapshot:this.snapshot(room,who)});
  }
  if(op==='command'){
   const key=body.requestId;if(!limited(key,90)||!/^[-\w]{10,89}$/.test(key))return err('Request ID missing');
   const actor=who.role==='host'?body.team:who.team;
   if(who.role==='host'&&!IDS.includes(actor))return err('Select an existing country');
   if(who.role==='student'&&!who.team)return err('Teacher has not assigned a country yet',403);
   const cacheKey=(who.role==='host'?'host':who.id)+':'+key;
   if(room.receipts[cacheKey])return json(room.receipts[cacheKey]);
   const result=resolveTeamCommand(room.game,actor,body.command);
   const receipt={ok:!!result.ok,reason:result.reason||'',result:result.result||null};
   room.receipts[cacheKey]=receipt;
   const keys=Object.keys(room.receipts);if(keys.length>600)for(const k of keys.slice(0,150))delete room.receipts[k];
   if(result.ok)room.game=result.state;
   await this.save(room);if(result.ok)await this.announce(room);
   return json(receipt,result.ok?200:409);
  }
  return err('Unknown endpoint',404);
 }
 webSocketMessage(ws,message){if(message==='ping')try{ws.send('pong')}catch{}}
 webSocketClose(ws){try{ws.close(1000,'Closed')}catch{}}
 webSocketError(ws){try{ws.close(1011,'Disconnected')}catch{}}
}

export default {
 async fetch(request,env){const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  const m=url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(create|join|assign|control|command|snapshot|ws)$/);
  if(url.pathname==='/api/room-code')return json({code:makeCode()});
  if(!m||!CODE.test(m[1]))return err('Invalid API path',404);
  const roomId=env.ROOMS.idFromName(m[1]);const stub=env.ROOMS.get(roomId);
  return stub.fetch(request);
 }
};
