import test from 'node:test';
import assert from 'node:assert/strict';
import {REGIONS} from '../data/regions.js';
import {FACTIONS} from '../data/factions.js';
import {createGame,startGame,activeTeam,preview,act,minor,endTurn,propose,respond,betray,publicState,score,standings,special} from '../engine.js';
test('72 real-geography-based valid unique regions, with readable polygon data',()=>{
 assert.equal(REGIONS.length,72);assert.equal(new Set(REGIONS.map(r=>r.id)).size,72);
 for(const r of REGIONS){assert.ok(r.path.startsWith('M'));assert.ok(r.neighbors.length>=1);assert.ok(r.defense>0);assert.ok(r.politics);assert.equal(r.approx,true)}
});
test('seven factions and independent African political starting positions',()=>{
 assert.equal(FACTIONS.length,7);let s=createGame(42);assert.equal(Object.keys(s.teams).length,7);assert.equal(Object.keys(s.regions).length,72);
 assert.equal(s.regions['ethiopia-1'].status,'independent');
});
test('preview adds to exactly 100 and wrong-turn actions rejected',()=>{
 const s=startGame(createGame(42));const p=preview(s,'britain','ghana','conquer');assert.equal(p.ok,true);assert.equal(p.success+p.partial+p.fail,100);
 assert.equal(preview(s,'france','ghana','conquer').ok,false);
});
test('turn resolution spends treasury, uses action, preserves determinism',()=>{
 let s=startGame(createGame(42));const o=preview(s,'britain','ghana','explore');const r=act(s,'britain','ghana','explore');assert.ok(r.ok);assert.equal(r.state.teams.britain.cash,s.teams.britain.cash-o.cost);assert.equal(r.state.acted,true);assert.equal(act(r.state,'britain','ghana','explore').ok,false);
 const r2=act(s,'britain','ghana','explore');assert.deepEqual(r.state,r2.state);
});
test('minor preparations are allowed once and must be affordable',()=>{
 let s=startGame(createGame());let out=minor(s,'britain','ghana','scout');assert.equal(out.ok,true);assert.equal(out.state.teams.britain.prepared,'ghana');assert.equal(minor(out.state,'britain','ghana','scout').ok,false);
});
test('campaign ends only once all territories have a settled outcome',()=>{
 let s=startGame(createGame(345)),turn=0;
 while(!s.finished&&turn<180){const team=activeTeam(s);let options=[];
  for(const region of REGIONS)for(const action of ['conquer','consolidate','claim']){
   let x=preview(s,team,region.id,action);if(x.ok){let t=s.regions[region.id],bonus=t.claimant===team?(action==='consolidate'?20:0):(t.status==='independent'?(action==='conquer'?13:10):0);
   options.push({id:region.id,action,rank:x.success+bonus-t.defense*.1});}
  }
  options.sort((a,b)=>b.rank-a.rank);
  if(options.length){let r=act(s,team,options[0].id,options[0].action);if(r.ok)s=r.state;}
  s=endTurn(s);turn++;
 }
 assert.equal(s.finished,true);
 assert.ok(s.year>=1914);
 assert.ok(turn>35&&turn<180);
 assert.equal(Object.values(s.regions).every(x=>x.status==='controlled'||x.status==='independent-secure'),true);
 assert.ok(Object.values(s.regions).filter(x=>x.status==='controlled').length>50);
 assert.equal(standings(s).length,7);
});
test('scoring categories capped at 100',()=>{
 let s=createGame();for(const f of FACTIONS){const p=score(s,f.id);assert.ok(p.total<=100);assert.equal(p.territory+p.economic+p.diplomacy+p.objectives,p.total)}
});
test('private diplomacy is hidden from public game state',()=>{
 let s=startGame(createGame());let out=propose(s,'france','portugal','trade',100);assert.equal(out.ok,true);s=out.state;
 assert.equal(s.offers.length,1);assert.equal(publicState(s).offers,undefined);assert.equal(publicState(s).rng,undefined);
 out=respond(s,s.offers[0].id,'portugal',true);assert.equal(out.ok,true);assert.equal(out.state.teams.france.cash,s.teams.france.cash-100);
 assert.equal(out.state.teams.portugal.cash,s.teams.portugal.cash+100);
});
test('breaking nonaggression treaty carries visible costs',()=>{
 let s=startGame(createGame()),a=propose(s,'britain','france','nonaggression',0);assert.ok(a.ok);s=respond(a.state,a.offer.id,'france',true).state;
 let b=betray(s,'britain','france');assert.ok(b.ok);assert.ok(b.state.teams.britain.cash<s.teams.britain.cash);assert.ok(b.state.teams.britain.reputation<s.teams.britain.reputation);
});
test('underdog cards are limited-use',()=>{
 let s=startGame(createGame());let a=special(s,'portugal');assert.equal(a.ok,true);assert.ok(a.state.teams.portugal.cash>s.teams.portugal.cash);assert.equal(special(a.state,'portugal').ok,false);
});
