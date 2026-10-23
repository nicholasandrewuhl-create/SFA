import {REGIONS} from './data/regions.js';
import {FACTIONS,ACTIONS,MINORS,EVENTS} from './data/factions.js';
export const IDS=FACTIONS.map(f=>f.id);
export const REG=Object.fromEntries(REGIONS.map(r=>[r.id,r]));
export const TEAM=Object.fromEntries(FACTIONS.map(f=>[f.id,f]));
const LIMIT=100;const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function clone(x){return structuredClone(x)}
export function roll(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296}
export function log(s,msg,type='news'){s.log.unshift({id:++s.seq,round:s.round,year:s.year,msg,type});s.log=s.log.slice(0,120)}
export function createGame(seed=1357911){
 const s={version:1,seed, rng:seed>>>0, round:1,year:1880,active:0,order:IDS.slice(),seq:0,
 phase:'lobby',finished:false,winner:null,acted:false,minored:false,events:[],log:[],offers:[],
 regions:{}, teams:{}, history:[], handledCommands:{}, options:{turnSeconds:45},lastAction:null};
 for(const r of REGIONS)s.regions[r.id]={status:'independent',owner:null,claimant:null,defense:r.defense,trust:50,prepared:0,scoutedBy:null};
 for(const f of FACTIONS)s.teams[f.id]={cash:f.cash,military:f.military,logistics:f.logistics,influence:f.influence,reputation:6,territories:0,used:false,prepared:null,boost:0,objectiveMet:0,points:0};
 const start=[['britain','south-africa-1','controlled'],['britain','sierra-leone','controlled'],['britain','gambia','claimed'],
 ['france','algeria-1','controlled'],['france','senegal','controlled'],['france','tunisia','claimed'],
 ['portugal','angola-1','claimed'],['portugal','mozambique-1','claimed'],
 ['spain','eq-guinea','claimed'],['spain','w-sahara','influence'],
 ['germany','togo','influence'],['germany','cameroon-1','influence'],
 ['italy','eritrea','influence'],['belgium','dem-rep-congo-1','influence']];
 for(const [team,id,status] of start){if(s.regions[id]){s.regions[id].status=status;s.regions[id].claimant=team;s.regions[id].owner=status==='controlled'?team:null}}
 log(s,'The African continent is home to diverse independent states and communities. European competition is intensifying.','historical');
 return s;
}
export function activeTeam(s){return s.order[s.active]}
export function isSettled(t){return t.status==='controlled'||t.status==='independent-secure'}
export function canReach(s,team,id){let n=REG[id];if(!n)return false;const own=REGIONS.filter(r=>r.id===id||n.neighbors.includes(r.id)).some(r=>s.regions[r.id]?.claimant===team||s.regions[r.id]?.owner===team);return own}
export function preview(s,team,id,action){
 const t=s.regions[id],r=REG[id],f=TEAM[team],p=s.teams[team],a=ACTIONS[action];
 if(!p||!t||!a)return {ok:false,reason:'Invalid region or action.'};
 if(s.finished)return {ok:false,reason:'The game has ended.'};
 if(s.phase!=='playing')return {ok:false,reason:'The game has not started.'};
 if(s.acted)return {ok:false,reason:'This turn’s major action has been used.'};
 if(activeTeam(s)!==team)return {ok:false,reason:'Another country is taking its turn.'};
 let cost=a.cost;const coastal=f.ability==='coastal'&&['Angola','Mozambique'].includes(r.sourceCountry);
 const congo=f.ability==='congo'&&['Congo','Dem. Rep. Congo'].includes(r.sourceCountry);
 if(coastal||congo)cost-=45;
 if(f.ability==='surge'&&!p.used&&(action==='explore'||action==='conquer')) cost-=65;
 if(p.cash<cost||p.military<a.military)return {ok:false,reason:'Insufficient treasury or military capacity.',cost};
 if(t.status==='independent-secure'&&action!=='negotiate'&&action!=='conquer')return {ok:false,reason:'This state’s independence has been sustained. Only negotiation or costly invasion can alter it.'};
 if(t.owner&&['explore','negotiate','claim'].includes(action))return {ok:false,reason:'This region is already under established European control.'};
 if(action==='claim'&&t.claimant===team)return {ok:false,reason:'You already have a claim. Secure control or choose another territory.'};
 if(action==='consolidate'&&t.claimant!==team)return {ok:false,reason:'You can only secure control of your own claim.'};
 if(action==='challenge'&&(!t.claimant||t.claimant===team))return {ok:false,reason:'Choose a rival European claim.'};
 if(action==='claim'&&t.owner&&t.owner!==team)return {ok:false,reason:'Established rival control requires a diplomatic or military challenge.'};
 if(['negotiate','explore'].includes(action)&&t.owner&&t.owner!==team)return {ok:false,reason:'This territory is already controlled by another European power.'};
 if(action==='conquer'&&t.owner===team)return {ok:false,reason:'This is already your controlled territory.'};
 if(action==='claim'&&t.owner===team)return {ok:false,reason:'Already controlled by your country.'};
 let base={explore:73,negotiate:64,claim:63,conquer:54,consolidate:78,challenge:48}[action];
 let modifiers=[];
 const add=(label,v)=>{base+=v;modifiers.push({label,value:v})};
 if(canReach(s,team,id))add('Nearby established foothold',13);
 else add('Remote access and long supply lines',f.ability==='naval'?-7:-16);
 add('Geographic difficulty',-r.difficulty*2);
 if(['conquer','claim','challenge'].includes(action))add('Local military preparedness',-Math.round(t.defense/8));
 if(action==='negotiate') {add('Diplomatic influence',Math.round((p.influence-50)/5));if(f.ability==='diplomat')add('French diplomatic advantage',12);add('Local political trust',Math.round((t.trust-50)/5))}
 if(action==='conquer'){add('Military readiness',Math.round((p.military-50)/5));if(r.sourceCountry==='Ethiopia')add('Ethiopian military organization',-25)}
 if(t.claimant&&t.claimant!==team)add('Existing rival claim',-12);
 if(p.prepared===id)add('Preparations and reconnaissance',p.boost||12);
 if(f.ability==='gambit'&&!p.used&&action==='conquer')add('Italian frontier gambit',18);
 if(congo&&s.year>=1885)add('Congo venture financing',7);
 if(action==='claim'&&s.year>=1885)add('European claim procedures after Berlin',6);
 if(r.sourceCountry==='Sudan'&&['britain','france'].includes(team)&&s.year>=1898&&action==='challenge')add('Upper Nile imperial rivalry',8);
 if(action==='consolidate'&&t.claimant===team)add('Previous European claim',22);
 const success=clamp(Math.round(base),8,89),partial=clamp(Math.round((100-success)*.48),5,35);
 return {ok:true,cost,military:a.military,success,partial,fail:100-success-partial,modifiers,action,id,team};
}
function acquire(s,team,id,level){let t=s.regions[id];if(!t)return false;
 t.status=level;t.claimant=team;t.owner=level==='controlled'?team:null;t.prepared=0;
 return true;}
function expand(s,team,id,limit=1,level='claimed'){let choices=REG[id].neighbors.filter(k=>s.regions[k]&&s.regions[k].status==='independent'&&!REG[k].independence).sort((a,b)=>s.regions[a].defense-s.regions[b].defense);
 let taken=0;
 for(const key of choices){if(taken>=limit)break;if(roll(s)>.86)continue;acquire(s,team,key,level==='controlled'&&s.regions[key].defense<66?'controlled':'claimed');taken++}
 return taken;}
export function act(s,team,id,action){const o=preview(s,team,id,action);if(!o.ok)return {ok:false,reason:o.reason};
 const n=clone(s);const t=n.regions[id],p=n.teams[team];p.cash-=o.cost;p.military=clamp(p.military-o.military,0,100);n.acted=true;
 const chance=roll(n)*100;let result=chance<o.success?'success':chance<o.success+o.partial?'partial':'failure';
 let text='';const r=REG[id],label=r.name,other=t.claimant;
 if(result==='success'){
  if(action==='explore'){acquire(n,team,id,'influence');p.logistics=clamp(p.logistics+4,0,100);text='An expedition establishes a viable route and limited influence in '+label+'.'}
  else if(action==='negotiate'){acquire(n,team,id,'claimed');t.trust=clamp(t.trust+8,0,100);p.influence=clamp(p.influence+4,0,100);text='A limited agreement strengthens European claims in '+label+'. African sovereignty is not automatically transferred.'}
  else if(action==='claim'){acquire(n,team,id,'claimed');let extra=expand(n,team,id,2);text='A European claim is established in '+label+(extra?` with ${extra} adjacent preliminary claim(s).`:'.')}
  else if(action==='conquer'){acquire(n,team,id,'controlled');let extra=expand(n,team,id,3,'controlled');text='A military expedition establishes substantial control in '+label+(extra?` and extends ${extra} additional claim(s).`:'.')}
  else if(action==='consolidate'){acquire(n,team,id,'controlled');let extra=expand(n,team,id,2,'controlled');text='An existing claim becomes established control in '+label+(extra?' with a connected claim.':'.')}
  else if(action==='challenge'){t.status='contested';t.claimant=team;t.owner=null;p.influence=clamp(p.influence+5,0,100);text=team+' successfully challenges '+other+'’s European claim in '+label+'. African political control remains unresolved.'}
 }else if(result==='partial'){
  if(action==='conquer'||action==='claim'||action==='challenge'){acquire(n,team,id,'contested');t.defense=clamp(t.defense+4,0,100);text='Partial gains leave '+label+' contested. Local resistance and uncertainty remain.'}
  else if(action==='consolidate'){t.status='claimed';t.defense=clamp(t.defense+4,0,100);text='Administrative access improves, but '+label+' is not securely controlled.'}
  else{acquire(n,team,id,'influence');text='Limited influence expands in '+label+', but negotiations and access remain uncertain.'}
 }else{
  t.defense=clamp(t.defense+(action==='conquer'?12:6),5,100);t.trust=clamp(t.trust-9,0,100);
  if(action==='conquer'){p.military=clamp(p.military-11,0,100);if(TEAM[team].ability==='gambit')p.cash=Math.max(0,p.cash-35)}
  text=`${TEAM[team].name}'s ${ACTIONS[action].label.toLowerCase()} fails in ${label}. African resistance or geographic challenges increase.`;
 }
 if(p.prepared===id){p.prepared=null;p.boost=0}
 if(!p.used && ((TEAM[team].ability==='gambit'&&action==='conquer')||(TEAM[team].ability==='surge'&&['explore','conquer'].includes(action))))p.used=true;
 n.lastAction={team,id,action,result,odds:o,text};log(n,text,result==='failure'?'resistance':'action');return {ok:true,state:n,result,text};
}
export function minor(s,team,id,kind){if(activeTeam(s)!==team||s.minored||s.phase!=='playing'||s.finished)return {ok:false,reason:'Minor action unavailable.'};
 if(!MINORS[kind])return {ok:false,reason:'Unknown minor action.'};
 const p=s.teams[team],cost=MINORS[kind].cost;if(p.cash<cost)return {ok:false,reason:'Insufficient treasury.'};
 const n=clone(s),q=n.teams[team];q.cash-=cost;n.minored=true;
 if(kind==='invest')q.cash+=90;
 else{if(!REG[id])return {ok:false,reason:'Choose a region first.'};q.prepared=id;q.boost=kind==='scout'?14:20}
 log(n,TEAM[team].name+' prepares its next move.','quiet');return {ok:true,state:n};
}
export function startGame(s){const n=clone(s);n.phase='playing';n.events=['intro'];return n}
function eventTick(s){for(const e of EVENTS){if(!s.events.includes(e.kind+'-'+e.year)&&s.year>=e.year){s.events.push(e.kind+'-'+e.year);log(s,e.title+': '+e.body,'historical');if(e.kind==='rivalry')for(const p of Object.values(s.teams))p.influence=clamp(p.influence-1,0,100);if(e.kind==='ethiopia')for(const [id,t] of Object.entries(s.regions))if(REG[id].sourceCountry==='Ethiopia')t.defense=clamp(t.defense+12,0,100);if(e.kind==='congo'&&e.year===1908){s.teams.belgium.influence=clamp(s.teams.belgium.influence-5,0,100)}}}}
function aiRound(s){
 let recovered=0,secured=0,momentum=0;
 for(const [id,t] of Object.entries(s.regions)){
  const r=REG[id];
  if(t.status==='independent'){
   if(roll(s)<.18)t.defense=clamp(t.defense+2,0,100);
   if(s.year>=1914&&(r.independence||t.defense>=94&&roll(s)<.22)){
    t.status='independent-secure';t.claimant=null;t.owner=null;secured++;
   }
  }else if(['claimed','contested','influence'].includes(t.status)){
   if(roll(s)<.035&&t.defense>77){t.status='independent';t.claimant=null;t.owner=null;t.defense=clamp(t.defense+8,0,100);recovered++}
  }
 }
 // The political contest changes between student turns: gradually established claims
 // may mature into control, while local communities can still resist successfully.
 for(const faction of IDS){
  const p=s.teams[faction];
  const pending=REGIONS.filter(r=>s.regions[r.id].claimant===faction&&s.regions[r.id].status!=='controlled').sort((a,b)=>s.regions[a.id].defense-s.regions[b.id].defense);
  for(const r of pending.slice(0,3)){
   const t=s.regions[r.id],chance=Math.max(.22,.9-t.defense/165);
   if(roll(s)<chance){t.status='controlled';t.owner=faction;momentum++}
   else if(roll(s)<.20)t.defense=clamp(t.defense+3,0,100);
  }
  const frontier=REGIONS.filter(r=>s.regions[r.id].claimant===faction||s.regions[r.id].owner===faction);
  const possible=new Set();
  for(const r of frontier)for(const neighbor of r.neighbors){
   if(s.regions[neighbor]?.status==='independent'&&!REG[neighbor].independence)possible.add(neighbor);
  }
  const ranked=[...possible].sort((a,b)=>s.regions[a].defense-s.regions[b].defense);
  for(const id of ranked.slice(0,2)){
   if(roll(s)<.57){acquire(s,faction,id,'claimed');momentum++}
  }
  const held=REGIONS.filter(r=>s.regions[r.id].owner===faction).length;
  p.cash=clamp(p.cash+155+held*7-(faction==='britain'?Math.max(0,held-4)*9:0),0,1300);
  p.military=clamp(p.military+11,0,100);p.logistics=clamp(p.logistics+3,0,100);
 }
 if(recovered)log(s,`${recovered} African region(s) repel weak or disputed European claims.`,'resistance');
 if(secured)log(s,`${secured} African region(s) sustain independence through the late Scramble.`,'resistance');
 if(momentum)log(s,`${momentum} claims or footholds develop between rounds as the territorial contest intensifies.`,'round');
}

export function endTurn(s){if(s.phase!=='playing'||s.finished)return s;const n=clone(s);
 n.acted=false;n.minored=false;n.active++;
 if(n.active>=n.order.length){n.active=0;n.round++;n.year=Math.min(1914,1880+(n.round-1)*6);aiRound(n);eventTick(n);log(n,'Round '+n.round+' begins. European powers assess new opportunities.','round');}
 // Never end merely because the year reaches 1914. Conclude when the map is resolved.
 if(Object.values(n.regions).every(isSettled)){
  n.finished=true;n.phase='ended';n.winner=standings(n)[0].id;
  log(n,'The Scramble is over. Every region has a settled political outcome.','victory');
 }

 return n;
}
export function score(s,id){let p=s.teams[id],f=TEAM[id];const owned=REGIONS.filter(r=>s.regions[r.id].owner===id);
 const claimed=REGIONS.filter(r=>s.regions[r.id].claimant===id);
 const territory=Math.min(30,Math.round(owned.reduce((a,r)=>a+2.8+r.resource*.25,0)+claimed.length*.5));
 const economic=Math.min(25,Math.round(p.cash/75+owned.reduce((a,r)=>a+r.trade*.5,0)));
 const diplomacy=Math.min(20,Math.round(Math.max(0,p.influence-30)/6+p.reputation*1.8+claimed.length*.2));
 const objectives=Math.min(25,Math.round(owned.filter(r=>f.targets.includes(r.sourceCountry)).length*7+claimed.filter(r=>f.targets.includes(r.sourceCountry)).length*2));
 return {id,territory,economic,diplomacy,objectives,total:territory+economic+diplomacy+objectives,held:owned.length,claims:claimed.length};}
export function standings(s){return IDS.map(id=>({...score(s,id),...{name:TEAM[id].name}})).sort((a,b)=>b.total-a.total||b.held-a.held)}
export function propose(s,from,to,kind,amount=0,regionId=null){
 if(from===to||!TEAM[from]||!TEAM[to])return {ok:false,reason:'Invalid recipient.'};
 if(!['trade','access','nonaggression','withdraw'].includes(kind))return {ok:false,reason:'Invalid treaty type.'};
 if(s.teams[from].cash<amount||amount<0||amount>450)return {ok:false,reason:'Insufficient treasury or invalid amount.'};
 if(kind==='withdraw'&&(!REG[regionId]||s.regions[regionId].claimant!==to))return {ok:false,reason:'Recipient has no claim there.'};
 if(s.offers.some(o=>o.from===from&&o.round===s.round))return {ok:false,reason:'One diplomatic proposal per round.'};
 const n=clone(s),offer={id:'offer-'+(++n.seq),from,to,kind,amount,regionId,status:'pending',round:n.round,expires:n.round+1};n.offers.push(offer);return {ok:true,state:n,offer};
}
export function respond(s,offerId,recipient,accept){let offer=s.offers.find(o=>o.id===offerId);if(!offer||offer.status!=='pending'||offer.to!==recipient)return {ok:false,reason:'Offer is unavailable.'};
 const n=clone(s),o=n.offers.find(o=>o.id===offerId);o.status=accept?'accepted':'rejected';
 if(accept){if(n.teams[o.from].cash<o.amount)return {ok:false,reason:'Sender no longer has enough treasury.'};
 n.teams[o.from].cash-=o.amount;n.teams[o.to].cash+=o.amount;
 if(o.kind==='withdraw'){n.regions[o.regionId].status='independent';n.regions[o.regionId].claimant=null;n.regions[o.regionId].owner=null}
 else if(o.kind==='access')n.teams[o.from].logistics=clamp(n.teams[o.from].logistics+10,0,100);
 else if(o.kind==='trade'){n.teams[o.from].influence=clamp(n.teams[o.from].influence+5,0,100);n.teams[o.to].influence=clamp(n.teams[o.to].influence+5,0,100)}
 else if(o.kind==='nonaggression'){o.validUntil=n.round+2}
 }
 log(n,`${TEAM[o.to].name} ${accept?'accepts':'rejects'} a ${o.kind} proposal from ${TEAM[o.from].name}.`,accept?'diplomacy':'quiet');
 return {ok:true,state:n};
}
export function betray(s,team,other){let o=s.offers.find(o=>o.status==='accepted'&&o.kind==='nonaggression'&&o.validUntil>=s.round&&((o.from===team&&o.to===other)||(o.to===team&&o.from===other)));
 if(!o)return {ok:false,reason:'No active treaty to violate.'};
 const n=clone(s),v=n.offers.find(x=>x.id===o.id);v.status='broken';n.teams[team].cash=Math.max(0,n.teams[team].cash-150);n.teams[team].reputation=Math.max(0,n.teams[team].reputation-2);n.teams[team].influence=Math.max(0,n.teams[team].influence-10);
 log(n,`${TEAM[team].name} BREAKS its treaty with ${TEAM[other].name}! Treasury and reputation suffer.`,'betrayal');return {ok:true,state:n};
}
export function publicState(s){const n=clone(s);delete n.rng;delete n.seed;delete n.offers;delete n.history;delete n.handledCommands;delete n.options;
 for(const id of IDS){n.teams[id]={strength:Math.round(s.teams[id].cash/200),reputation:s.teams[id].reputation};}
 return n;}


export function special(s,team){
 if(!TEAM[team])return {ok:false,reason:'Unknown country.'};
 if(s.phase!=='playing'||s.finished||s.teams[team].used)return {ok:false,reason:'Special ability unavailable or already used.'};
 const n=clone(s),p=n.teams[team];let message='';
 if(team==='germany'||team==='italy')return {ok:false,reason:'Your special ability activates automatically on an eligible expedition.'};
 if(team==='britain'){p.logistics=clamp(p.logistics+20,0,100);message='Britain activates a powerful naval supply effort.'}
 if(team==='france'){p.influence=clamp(p.influence+18,0,100);message='France launches a special diplomatic initiative.'}
 if(team==='belgium'){p.cash=Math.min(1300,p.cash+175);p.reputation=Math.max(0,p.reputation-1);message='Leopold II obtains additional Congo venture backing. Diplomatic scrutiny increases.'}
 if(team==='portugal'){p.cash=Math.min(1300,p.cash+180);p.logistics=clamp(p.logistics+7,0,100);message='Portugal secures emergency maritime financing and supply access.'}
 if(team==='spain'){let offer=n.offers.find(o=>o.status==='pending'&&o.from!=='spain'&&o.to!=='spain');if(offer){offer.status='countered';message='Spain disrupts a pending European diplomatic proposal!'}else{p.influence=clamp(p.influence+20,0,100);message='Spain plays its diplomatic spoiler card, gathering influence in European negotiations.'}}
 p.used=true;log(n,message,'diplomacy');return {ok:true,state:n,message};
}
