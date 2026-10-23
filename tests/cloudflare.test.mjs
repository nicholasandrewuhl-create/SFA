import test from 'node:test';
import assert from 'node:assert/strict';
import {GameRoom,makeCode} from '../worker/index.js';
class FakeStorage {constructor(){this.db=new Map()}async get(k){return this.db.get(k)}async put(k,v){this.db.set(k,structuredClone(v))}}
const ctx={storage:new FakeStorage(),getWebSockets:()=>[]};
const gameRoom=new GameRoom(ctx,{});
const path=(code,op)=>`https://example.com/api/rooms/${code}/${op}`;
async function call(code,op,data,token){const req=new Request(path(code,op),{method:data===undefined?'GET':'POST',headers:{...(token?{Authorization:`Bearer ${token}`}:{})},body:data===undefined?undefined:JSON.stringify(data)});const response=await gameRoom.fetch(req);return {status:response.status,body:await response.json()};}
const code=makeCode();
let teacher,student,student2;
test('Cloudflare room codes use safe 6-character alphabet',()=>assert.match(code,/^[A-HJ-NP-Z2-9]{6}$/));
test('Teacher creates private room and receives host token',async()=>{const r=await call(code,'create',{code});assert.equal(r.status,201);teacher=r.body.token;assert.equal(teacher.length,64);assert.equal(r.body.snapshot.full.phase,'lobby')});
test('Duplicate room and unauthenticated access are rejected',async()=>{assert.equal((await call(code,'create',{code})).status,409);assert.equal((await call(code,'snapshot')).status,401)});
test('Seven-country classroom supports private seat approvals',async()=>{
 const a=await call(code,'join',{preferred:'britain'});const b=await call(code,'join',{preferred:'france'});student=a.body.token;student2=b.body.token;
 assert.equal(a.body.snapshot.team,null);
 const before=await call(code,'snapshot',undefined,teacher);
 assert.equal(Object.keys(before.body.requests).length,2);
 const id=Object.keys(before.body.requests)[0];const id2=Object.keys(before.body.requests)[1];
 assert.equal((await call(code,'assign',{id,team:'britain'},student)).status,403);
 assert.equal((await call(code,'assign',{id,team:'britain'},teacher)).status,200);
 assert.equal((await call(code,'assign',{id:id2,team:'britain'},teacher)).status,409);
 assert.equal((await call(code,'assign',{id:id2,team:'france'},teacher)).status,200);
 assert.equal((await call(code,'snapshot',undefined,student)).body.team,'britain');
});
test('Student public snapshot hides state RNG and rival diplomacy',async()=>{
 const s=(await call(code,'snapshot',undefined,student)).body;
 assert.equal(s.full,undefined);
 assert.equal(s.public.seed,undefined);
 assert.equal(s.public.rng,undefined);
 assert.equal(s.public.offers,undefined);
 assert.equal(s.private.team?.cash>0,true);
 assert.equal(s.private.offers.length,0);
});
test('Only teacher can start and advance turns',async()=>{
 assert.equal((await call(code,'control',{action:'start'},student)).status,403);
 assert.equal((await call(code,'control',{action:'start'},teacher)).status,200);
 assert.equal((await call(code,'control',{action:'next'},teacher)).status,200);
});
test('Student command is limited to assigned team and receipt is idempotent',async()=>{
 // Round currently on France after teacher advances once.
 const command={type:'special'},requestId='knowncommand0123456789';
 const denied=await call(code,'command',{command:{type:'action',id:'ghana',action:'explore'},requestId:'differentrequest00001'},student);
 assert.equal(denied.status,409);
 const res=await call(code,'command',{command,requestId},student2);
 assert.equal(res.status,200);
 const duplicated=await call(code,'command',{command,requestId},student2);
 assert.deepEqual(duplicated.body,res.body);
 const score=(await call(code,'snapshot',undefined,student2)).body.private.team;
 assert.equal(score.used,true);
});
test('Teacher receives complete history while rival student cannot read other private team data',async()=>{
 const t=(await call(code,'snapshot',undefined,teacher)).body;
 const b=(await call(code,'snapshot',undefined,student)).body;
 assert.equal(t.full?.teams?.france?.used,true);
 assert.equal(b.public.teams.france?.used,undefined);
 assert.equal(b.private.team.used,false);
});
