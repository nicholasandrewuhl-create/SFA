import {REGIONS} from './data/regions.js';
import {FACTIONS,ACTIONS,MINORS,EVENTS} from './data/factions.js';
export const IDS=FACTIONS.map(f=>f.id);
export const REG=Object.fromEntries(REGIONS.map(r=>[r.id,r]));
export const TEAM=Object.fromEntries(FACTIONS.map(f=>[f.id,f]));
export const CHAOS_MODES=['classic','spicy','mayhem'];
export const modeOf=s=>CHAOS_MODES.includes(s.chaosMode)?s.chaosMode:'spicy';
export const tensionOf=s=>Number.isFinite(s.tension)?s.tension:20;
export function changeTension(s,base,reason=''){
 if(modeOf(s)==='classic')return;
 const delta=Math.round(base*(modeOf(s)==='mayhem'?1.45:1));
 const before=tensionOf(s);s.tension=clamp(before+delta,0,100);
 const milestones=s.tensionMilestones||(s.tensionMilestones=[]);
 for(const [threshold,label] of [[35,'European rivalries intensify'],[65,'A major diplomatic crisis erupts'],[85,'Imperial competition reaches a breaking point']]){
  if(s.tension>=threshold&&!milestones.includes(threshold)){milestones.push(threshold);log(s,label+'. Competing claims become harder to negotiate and easier to challenge.','crisis')}
 }
 if(reason&&Math.abs(s.tension-before)>=10)log(s,reason+' European tension changes to '+s.tension+'/100.','crisis');
}

const LIMIT=100;const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function clone(x){return structuredClone(x)}
export function roll(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296}
export function log(s,msg,type='news'){s.log.unshift({id:++s.seq,round:s.round,year:s.year,msg,type});s.log=s.log.slice(0,120)}
export function createGame(seed=1357911,mode='spicy'){
 if(!CHAOS_MODES.includes(mode))mode='spicy';
 const s={version:1,seed, rng:seed>>>0, round:1,year:1880,active:0,order:IDS.slice(),seq:0,
 phase:'lobby',finished:false,winner:null,acted:false,minored:false,events:[],log:[],offers:[],
 chaosMode:mode,tension:20,tensionMilestones:[],paused:false,directorEvent:null,directorUses:{round:1,count:0},scoreBaseline:null,sanctions:{},
 regions:{}, teams:{}, history:[], handledCommands:{}, options:{turnSeconds:45},lastAction:null};
 for(const r of REGIONS)s.regions[r.id]={status:'independent',owner:null,claimant:null,defense:r.defense,trust:50,prepared:0,scoutedBy:null};
 for(const f of FACTIONS)s.teams[f.id]={cash:f.cash,military:f.military,logistics:f.logistics,influence:f.influence,reputation:6,territories:0,used:false,comebackUsed:false,prepared:null,boost:0,objectiveMet:0,points:0};
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
// Agreements are operational rules, not merely entries in the activity feed.
// In legacy saved games, accepted offers without validUntil receive a two-round term.
export function treatyExpiry(o){return Number.isFinite(o.validUntil)?o.validUntil:(o.round||1)+2}
export function activeTreaties(s,team=null,kind=null){
 return (s.offers||[]).filter(o=>o.status==='accepted'&&treatyExpiry(o)>=s.round&&
  (team===null||o.from===team||o.to===team)&&(kind===null||o.kind===kind));
}
export function protectedByPact(s,team,id){
 const t=s.regions[id];if(!t)return null;
 const other=t.claimant||t.owner;
 if(!other||other===team)return null;
 return activeTreaties(s,team,'nonaggression').find(o=>o.from===other||o.to===other)||null;
}
export function accessPartner(s,team,id){
 if((s.sanctions?.[team]||0)>=s.round)return null; // Teacher-imposed trade embargo closes treaty routes temporarily.
 const target=REG[id];if(!target)return null;
 return activeTreaties(s,team,'access').find(o=>{
  // The proposer purchases access to the recipient's routes. It is not sovereignty.
  if(o.from!==team)return false;
  const partner=o.to;
  return [id,...target.neighbors].some(k=>s.regions[k]?.claimant===partner||s.regions[k]?.owner===partner);
 })||null;
}
export function preview(s,team,id,action){
 const t=s.regions[id],r=REG[id],f=TEAM[team],p=s.teams[team],a=ACTIONS[action];
 if(!p||!t||!a)return {ok:false,reason:'Invalid region or action.'};
 if(s.finished)return {ok:false,reason:'The game has ended.'};
 if(s.paused)return {ok:false,reason:'The teacher has paused the game for a classroom event.'};
 if(s.phase!=='playing')return {ok:false,reason:'The game has not started.'};
 if(s.acted)return {ok:false,reason:'This turn’s major action has been used.'};
 if(activeTeam(s)!==team)return {ok:false,reason:'Another country is taking its turn.'};
 let cost=a.cost;
 if(modeOf(s)!=='classic'&&tensionOf(s)>=70&&action==='conquer')cost+=30;
 const coastal=f.ability==='coastal'&&['Angola','Mozambique'].includes(r.sourceCountry);
 const congo=f.ability==='congo'&&['Congo','Dem. Rep. Congo'].includes(r.sourceCountry);
 const route=accessPartner(s,team,id);
 if(route)cost=Math.max(0,cost-30);
 if(coastal||congo)cost-=45;
 if(f.ability==='surge'&&!p.used&&(action==='explore'||action==='conquer')) cost-=65;
 if(p.cash<cost||p.military<a.military)return {ok:false,reason:'Insufficient treasury or military capacity.',cost};
 if(t.status==='independent-secure'&&action!=='negotiate'&&action!=='conquer')return {ok:false,reason:'This state’s independence has been sustained. Only negotiation or costly invasion can alter it.'};
 if(t.owner&&['explore','negotiate','claim'].includes(action))return {ok:false,reason:'This region is already under established European control.'};
 if(action==='claim'&&t.claimant===team)return {ok:false,reason:'You already have a claim. Secure control or choose another territory.'};
 if(['conquer','challenge','claim'].includes(action)&&protectedByPact(s,team,id))return {ok:false,reason:`Nonaggression treaty protects this European claim. Break the treaty from Diplomacy before challenging ${TEAM[t.claimant||t.owner].name}.`};
 if(action==='consolidate'&&t.claimant!==team)return {ok:false,reason:'You can only secure control of your own claim.'};
 if(action==='challenge'&&(!t.claimant||t.claimant===team||t.status==='controlled'))return {ok:false,reason:'Choose an unresolved rival claim. Fully controlled territories cannot be stolen with a diplomatic challenge.'};
 if(action==='claim'&&t.owner&&t.owner!==team)return {ok:false,reason:'Established rival control requires a diplomatic or military challenge.'};
 if(['negotiate','explore'].includes(action)&&t.owner&&t.owner!==team)return {ok:false,reason:'This territory is already controlled by another European power.'};
 if(action==='conquer'&&t.owner===team)return {ok:false,reason:'This is already your controlled territory.'};
 if(action==='claim'&&t.owner===team)return {ok:false,reason:'Already controlled by your country.'};
 let base={explore:73,negotiate:64,claim:63,conquer:54,consolidate:78,challenge:48}[action];
 let modifiers=[];
 const add=(label,v)=>{base+=v;modifiers.push({label,value:v})};
 if(route)add('Active supply-access treaty',18);
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
 if(modeOf(s)!=='classic'){
  if(action==='challenge')add('European rivalry and disputed claims',Math.floor(tensionOf(s)/9));
  if(action==='negotiate')add('Diplomatic tensions',-Math.floor(tensionOf(s)/14));
 }
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
 if(modeOf(n)!=='classic'){
  if(action==='challenge')changeTension(n,result==='success'?13:7,'Territorial competition.');
  if(action==='conquer')changeTension(n,result==='failure'?9:5,'Military confrontation.');
  if(action==='negotiate'&&result==='success')changeTension(n,-4,'Diplomatic compromise.');
 }
 if(p.prepared===id){p.prepared=null;p.boost=0}
 if(!p.used && ((TEAM[team].ability==='gambit'&&action==='conquer')||(TEAM[team].ability==='surge'&&['explore','conquer'].includes(action))))p.used=true;
 n.lastAction={team,id,action,result,odds:o,text};log(n,text,result==='failure'?'resistance':'action');return {ok:true,state:n,result,text};
}
export function minor(s,team,id,kind){if(s.paused)return {ok:false,reason:'The teacher has paused this game.'};if(activeTeam(s)!==team||s.minored||s.phase!=='playing'||s.finished)return {ok:false,reason:'Minor action unavailable.'};
 if(!MINORS[kind])return {ok:false,reason:'Unknown minor action.'};
 const p=s.teams[team],cost=MINORS[kind].cost;if(p.cash<cost)return {ok:false,reason:'Insufficient treasury.'};
 const n=clone(s),q=n.teams[team];q.cash-=cost;n.minored=true;
 if(kind==='invest')q.cash+=90;
 else{if(!REG[id])return {ok:false,reason:'Choose a region first.'};q.prepared=id;q.boost=kind==='scout'?14:20}
 log(n,TEAM[team].name+' prepares its next move.','quiet');return {ok:true,state:n};
}
export function startGame(s){const n=clone(s);n.phase='playing';n.events=['intro'];n.scoreBaseline=Object.fromEntries(IDS.map(id=>[id,score(n,id).total]));return n}
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
   const counterChance=modeOf(s)==='classic'?.035:(modeOf(s)==='mayhem'?.045:.025)+tensionOf(s)/1100;
   if(roll(s)<counterChance&&t.defense>72){t.status='independent';t.claimant=null;t.owner=null;t.defense=clamp(t.defense+8,0,100);recovered++}
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
 if(recovered){log(s,`${recovered} African region(s) organize counteroffensives and repel weak European claims.`,'resistance');changeTension(s,3,'Renewed conflict.');}
 if(modeOf(s)!=='classic')changeTension(s,-3,'An interval of diplomatic adjustment.');
 if(secured)log(s,`${secured} African region(s) sustain independence through the late Scramble.`,'resistance');
 if(momentum)log(s,`${momentum} claims or footholds develop between rounds as the territorial contest intensifies.`,'round');
}

export function endTurn(s){if(s.phase!=='playing'||s.finished)return s;const n=clone(s);
 n.acted=false;n.minored=false;n.active++;
 if(n.active>=n.order.length){n.active=0;n.scoreBaseline=Object.fromEntries(IDS.map(id=>[id,score(n,id).total]));n.round++;n.year=Math.min(1914,1880+(n.round-1)*6);resolveTreatyRound(n);aiRound(n);eventTick(n);log(n,'Round '+n.round+' begins. European powers assess new opportunities.','round');}
 // Never end merely because the year reaches 1914. Conclude when the map is resolved.
 if(Object.values(n.regions).every(isSettled)){
  n.finished=true;n.phase='ended';n.winner=standings(n)[0].id;
  log(n,'The Scramble is over. Every region has a settled political outcome.','victory');
 }

 return n;
}
/** Live scoring: no early hard cap from simply stockpiling claims or cash.
 * Holdings, deals and reputation can be gained AND lost.  Four categories
 * remain /30 /25 /20 /25, and totals are always out of 100.
 * Static denominators keep the value of a territory intelligible; the
 * diminishing return on empire size protects smaller strategic powers.
 */
export function score(s,id){
 const p=s.teams[id],f=TEAM[id];
 const controlled=REGIONS.filter(r=>s.regions[r.id].owner===id);
 const claimOnly=REGIONS.filter(r=>s.regions[r.id].claimant===id&&s.regions[r.id].owner!==id);
 const regionValue=controlled.reduce((a,r)=>a+2+r.resource*.22+r.trade*.16,0)+claimOnly.reduce((a,r)=>a+(s.regions[r.id].status==='contested'?.22:.5),0);
 const territory=Math.min(30,Math.round(30*regionValue/(regionValue+17)));
 const tradeScore=Math.min(10,controlled.reduce((sum,r)=>sum+r.trade*.47,0));
 const activeTrade=(s.sanctions?.[id]||0)>=s.round?0:activeTreaties(s,id,'trade').length;
 const economic=Math.min(25,Math.round(Math.min(8,p.cash/1300*8)+tradeScore+p.logistics*.045+Math.min(3,controlled.length*.35)+Math.min(2,activeTrade))); 
 const deals=(s.offers||[]).filter(o=>(o.status==='fulfilled'||(o.status==='accepted'&&treatyExpiry(o)>=s.round))&&(o.from===id||o.to===id));
 const reputation=Math.min(7,Math.max(0,p.reputation)*1.15);
 const diplomacy=Math.min(20,Math.round(p.influence*.075+reputation+Math.min(5,deals.length*1.5)));
 const targets=REGIONS.filter(r=>f.targets.includes(r.sourceCountry));
 const targetHeld=controlled.filter(r=>f.targets.includes(r.sourceCountry)).length;
 const targetClaimed=claimOnly.filter(r=>f.targets.includes(r.sourceCountry)).length;
 const objectiveGoal=Math.max(4,Math.min(10,Math.round(targets.length*.62)));
 const objectives=Math.min(25,Math.round(25*(targetHeld+targetClaimed*.18)/objectiveGoal));
 const total=territory+economic+diplomacy+objectives;
 const baseline=s.scoreBaseline?.[id];
 return {id,territory,economic,diplomacy,objectives,total,
  delta:typeof baseline==='number'?total-baseline:null,held:controlled.length,claims:claimOnly.length};
}
export function standings(s){return IDS.map(id=>({...score(s,id),name:TEAM[id].name})).sort((a,b)=>b.total-a.total||b.held-a.held)}

// Teacher-only interruptions. Each effect is publicly recorded and automatically
// pauses the room until the host resumes. This never changes who holds a region.
export const DIRECTOR_EVENTS={
 resistance:{label:'African resistance surge',target:'region',summary:'Strengthen local defenses in one unresolved region and contest a weak European claim.'},
 supply:{label:'Supply-route breakdown',target:'team',summary:'One European country loses 110 treasury and 8 logistics. A calculated setback, not territory deletion.'},
 embargo:{label:'Diplomatic trade embargo',target:'team',summary:'Suspend one European country’s trade-treaty payouts and treaty supply-route access through the next round.'},
 funding:{label:'Emergency expedition funding',target:'team',summary:'A trailing country gains 160 treasury and 5 logistics for a comeback.'},
 summit:{label:'Emergency diplomatic summit',target:'none',summary:'All countries gain 4 influence; European tension drops by 18.'},
 dispute:{label:'Territorial border dispute',target:'region',summary:'A pending European claim becomes contested and European tension increases.'}
};
export function pauseGame(s,paused){
 if(s.phase!=='playing'||s.finished)return {ok:false,reason:'Only an active game can be paused or resumed.'};
 const n=clone(s);n.paused=Boolean(paused);
 if(!paused)n.directorEvent=null;
 log(n,paused?'The teacher pauses the game for a classroom discussion.':'The classroom game resumes.','director');
 return {ok:true,state:n};
}
export function directorEvent(s,kind,target){
 if(s.phase!=='playing'||s.finished)return {ok:false,reason:'Start the game before triggering an event.'};
 if(s.paused)return {ok:false,reason:'Resume the game before triggering another interruption.'};
 const event=DIRECTOR_EVENTS[kind];if(!event)return {ok:false,reason:'Unknown teacher event.'};
 const uses=s.directorUses?.round===s.round?s.directorUses.count:0;
 if(uses>=2)return {ok:false,reason:'Maximum two teacher interruptions per round.'};
 if(event.target==='team'&&!IDS.includes(target))return {ok:false,reason:'Choose a European country.'};
 if(event.target==='region'&&!REG[target])return {ok:false,reason:'Choose an African region.'};
 const n=clone(s);let detail='';
 if(kind==='resistance'){
  const t=n.regions[target];if(t.status==='controlled'||t.status==='independent-secure')return {ok:false,reason:'Choose an unresolved territory.'};
  t.defense=clamp(t.defense+20,0,100);t.prepared=clamp((t.prepared||0)+12,0,100);t.trust=clamp(t.trust-10,0,100);
  if(t.claimant){t.status='contested';t.owner=null;}
  detail=`African leaders in ${REG[target].name} organize stronger resistance. Defense rises by 20; pending European claims are contested.`;
  changeTension(n,6,'Local resistance.');
 }else if(kind==='supply'){
  const p=n.teams[target];p.cash=Math.max(0,p.cash-110);p.logistics=clamp(p.logistics-8,0,100);
  detail=`${TEAM[target].name} encounters a supply-route breakdown: −110 treasury and −8 logistics.`;
  changeTension(n,7,'European supply crisis.');
 }else if(kind==='embargo'){
  n.sanctions=n.sanctions||{};n.sanctions[target]=n.round+1;
  detail=`A diplomatic trade embargo targets ${TEAM[target].name}. Its trade-agreement payouts and supply-access treaty bonuses are suspended through round ${n.round+1}. Existing agreements are not cancelled.`;
  changeTension(n,12,'Economic diplomatic pressure.');
 }else if(kind==='funding'){
  const ranks=standings(n);const lowest=ranks.slice(-3).map(x=>x.id);
  if(!lowest.includes(target))return {ok:false,reason:'Only a country in the bottom three may receive emergency funding.'};
  const p=n.teams[target];p.cash=clamp(p.cash+160,0,1300);p.logistics=clamp(p.logistics+5,0,100);
  detail=`${TEAM[target].name} secures emergency expedition financing: +160 treasury and +5 logistics.`;
 }else if(kind==='summit'){
  for(const p of Object.values(n.teams))p.influence=clamp(p.influence+4,0,100);
  changeTension(n,-18,'European conference.');detail='European governments meet to negotiate competing claims. All gain +4 influence; rivalry tension drops.';
 }else if(kind==='dispute'){
  const t=n.regions[target];if(!t.claimant||t.status==='controlled'||t.status==='independent-secure')return {ok:false,reason:'Choose an active European claim that is not already controlled.'};
  t.status='contested';t.owner=null;t.defense=clamp(t.defense+8,0,100);
  changeTension(n,16,'Contested claim.');detail=`A diplomatic dispute erupts over ${REG[target].name}. The claim becomes contested and local opposition strengthens.`;
 }
 n.paused=true;
 n.directorUses={round:n.round,count:uses+1};
 n.directorEvent={kind,headline:event.label,detail,round:n.round,year:n.year,seq:n.seq+1};
 log(n,`TEACHER EVENT — ${event.label}: ${detail}`,'director');
 return {ok:true,state:n,event:n.directorEvent};
}
export function comebackStatus(s,team){
 const p=s.teams?.[team];if(!p||s.phase!=='playing'||s.finished)return {ok:false,reason:'The campaign is not active.'};
 if(modeOf(s)==='classic')return {ok:false,reason:'Underdog Gambit is available in Spicy and Mayhem modes.'};
 if(activeTeam(s)!==team)return {ok:false,reason:'Wait until your country’s turn.'};
 if(p.comebackUsed)return {ok:false,reason:'You have already used your one-time gambit.'};
 const own=score(s,team).total,leader=standings(s)[0].total;
 if(leader-own<15)return {ok:false,reason:'The leading power must be at least 15 points ahead.',gap:leader-own};
 if(p.cash<100)return {ok:false,reason:'You need at least 100 treasury to make the gamble.',gap:leader-own};
 return {ok:true,stake:100,success:modeOf(s)==='mayhem'?55:60,partial:20,fail:modeOf(s)==='mayhem'?25:20,gap:leader-own};
}
export function comebackGambit(s,team,id){
 const o=comebackStatus(s,team);if(!o.ok)return {ok:false,reason:o.reason};
 if(!REG[id])return {ok:false,reason:'Choose a valid region to prepare.'};
 const n=clone(s),p=n.teams[team];p.comebackUsed=true;p.cash-=100;
 const dice=roll(n)*100;let outcome='failure',message='';
 if(dice<o.success){outcome='success';p.cash=clamp(p.cash+245,0,1300);p.influence=clamp(p.influence+7,0,100);p.prepared=id;p.boost=22;message=`${TEAM[team].name} secures emergency backing and prepares a dramatic comeback.`;}
 else if(dice<o.success+o.partial){outcome='partial';p.cash=clamp(p.cash+125,0,1300);p.prepared=id;p.boost=12;message=`${TEAM[team].name} obtains limited funding for a risky comeback.`;}
 else{p.influence=clamp(p.influence-6,0,100);message=`${TEAM[team].name}'s high-risk funding gamble fails, costing treasury and diplomatic influence.`;}
 changeTension(n,outcome==='failure'?8:5,'An underdog gambit.');log(n,message,outcome==='failure'?'crisis':'diplomacy');
 return {ok:true,state:n,result:outcome,message};
}
/** Diplomatic proposal: sender pays proposed treasury to the recipient on acceptance.
 * Access benefits the sender. Trade yields mutual recurring income.  Withdrawals
 * remove only a European CLAIM; an African state does not transfer sovereignty.
 */
export function propose(s,from,to,kind,amount=0,regionId=null){
 if(s.phase!=='playing'||s.finished||s.paused)return {ok:false,reason:'Diplomacy is available only during active play.'};
 if(from===to||!TEAM[from]||!TEAM[to])return {ok:false,reason:'Invalid recipient.'};
 if(!['trade','access','nonaggression','withdraw'].includes(kind))return {ok:false,reason:'Invalid treaty type.'};
 if(!Number.isInteger(amount)||s.teams[from].cash<amount||amount<0||amount>450)return {ok:false,reason:'Insufficient treasury or invalid amount.'};
 if(kind==='withdraw'&&(!REG[regionId]||s.regions[regionId].claimant!==to||s.regions[regionId].owner))return {ok:false,reason:'Recipient has no unresolved claim there.'};
 if(s.offers.some(o=>o.from===from&&o.round===s.round))return {ok:false,reason:'One diplomatic proposal per round.'};
 if(kind==='trade'&&activeTreaties(s,from,'trade').length>=2)return {ok:false,reason:'Maximum two active trade agreements per country.'};
 const n=clone(s),offer={id:'offer-'+(++n.seq),from,to,kind,amount,regionId:kind==='withdraw'?regionId:null,status:'pending',round:n.round,expires:n.round+1};n.offers.push(offer);
 log(n,`${TEAM[from].name} sends a private diplomatic proposal.`,'quiet');
 return {ok:true,state:n,offer};
}
export function respond(s,offerId,recipient,accept){
 if(s.phase!=='playing'||s.finished||s.paused)return {ok:false,reason:'The game is not accepting diplomatic responses.'};
 let offer=s.offers.find(o=>o.id===offerId);if(!offer||offer.status!=='pending'||offer.to!==recipient)return {ok:false,reason:'Offer is unavailable.'};
 if(offer.expires<s.round)return {ok:false,reason:'The offer has expired.'};
 if(accept&&s.teams[offer.from].cash<offer.amount)return {ok:false,reason:'Sender no longer has enough treasury.'};
 if(accept&&offer.kind==='withdraw'&&(!s.regions[offer.regionId]||s.regions[offer.regionId].claimant!==recipient||s.regions[offer.regionId].owner))return {ok:false,reason:'The requested European claim is no longer eligible.'};
 const n=clone(s),o=n.offers.find(o=>o.id===offerId);o.status=accept?'accepted':'rejected';
 if(accept){
  n.teams[o.from].cash-=o.amount;n.teams[o.to].cash=clamp(n.teams[o.to].cash+o.amount,0,1300);
  // A three-round term (current round plus two upcoming economic ticks).
  o.validUntil=n.round+(o.kind==='withdraw'?0:2);
  if(o.kind==='withdraw'){
   n.regions[o.regionId].status='independent';n.regions[o.regionId].claimant=null;n.regions[o.regionId].owner=null;
   n.teams[o.from].influence=clamp(n.teams[o.from].influence+7,0,100);
   n.teams[o.to].influence=clamp(n.teams[o.to].influence+3,0,100);
   o.status='fulfilled';
   log(n,`${TEAM[o.to].name} withdraws its European claim in ${REG[o.regionId].name} after accepting ${TEAM[o.from].name}'s offer. African political control remains independent.`,'diplomacy');
  }else if(o.kind==='access'){
   // The stronger effect is in preview/canReach: +18 chance and −30 cost on partner routes.
   n.teams[o.from].logistics=clamp(n.teams[o.from].logistics+6,0,100);
   log(n,`${TEAM[o.to].name} grants ${TEAM[o.from].name} access to its supply network through round ${o.validUntil}. Routes near the partner's footholds become cheaper and more successful.`,'diplomacy');
  }else if(o.kind==='trade'){
   n.teams[o.from].influence=clamp(n.teams[o.from].influence+3,0,100);
   n.teams[o.to].influence=clamp(n.teams[o.to].influence+3,0,100);
   log(n,`${TEAM[o.from].name} and ${TEAM[o.to].name} open a trade agreement: both receive +40 treasury at the next two round transitions.`,'diplomacy');
  }else if(o.kind==='nonaggression'){
   log(n,`${TEAM[o.from].name} and ${TEAM[o.to].name} agree not to attack each other's European claims through round ${o.validUntil}. The treaty must be broken before a hostile action.`,'diplomacy');
  }
  changeTension(n,-5,'European diplomatic agreement.');
 }else log(n,`${TEAM[o.to].name} rejects ${TEAM[o.from].name}'s ${o.kind} proposal.`,'quiet');
 return {ok:true,state:n};
}
export function betray(s,team,other,offerId=null){
 if(s.phase!=='playing'||s.finished||s.paused)return {ok:false,reason:'Treaties cannot be broken while the game is paused or ended.'};
 const eligible=activeTreaties(s,team).filter(o=>o.from===other||o.to===other);
 const pact=offerId?eligible.find(o=>o.id===offerId):eligible.find(o=>o.kind==='nonaggression')||eligible[0];
 if(!pact)return {ok:false,reason:'No active treaty with that country to violate.'};
 const n=clone(s),o=n.offers.find(x=>x.id===pact.id);o.status='broken';o.brokenBy=team;o.brokenRound=n.round;
 n.teams[team].cash=Math.max(0,n.teams[team].cash-150);
 n.teams[team].reputation=Math.max(0,n.teams[team].reputation-2);
 n.teams[team].influence=Math.max(0,n.teams[team].influence-10);
 // The betrayed country receives a limited retaliation advantage, not territory.
 n.teams[other].influence=clamp(n.teams[other].influence+5,0,100);
 changeTension(n,20,'Broken treaty.');
 log(n,`${TEAM[team].name} BREAKS its ${pact.kind} treaty with ${TEAM[other].name}! The violator loses 150 treasury, 2 reputation and 10 influence; the betrayed power gains 5 influence.`,'betrayal');
 return {ok:true,state:n};
}
// Run at each new round so active treaties measurably shape the economy and expire.
export function resolveTreatyRound(s){
 for(const o of s.offers||[]){
  if(o.status==='pending'&&o.expires<s.round){o.status='expired';continue;}
  if(o.status!=='accepted')continue;
  if(treatyExpiry(o)<s.round){o.status='expired';log(s,`${TEAM[o.from].name}'s ${o.kind} agreement with ${TEAM[o.to].name} expires.`,'diplomacy');continue;}
  if(o.kind==='trade'&&s.round>o.round){
   const recipients=[o.from,o.to].filter(id=>(s.sanctions?.[id]||0)<s.round);
   for(const id of recipients)s.teams[id].cash=clamp(s.teams[id].cash+40,0,1300);
   log(s,`Trade agreement payout: ${recipients.map(id=>TEAM[id].name).join(' and ')||'no countries'} receive ${recipients.length?'+40 treasury':'a suspended payment'}${recipients.length!==2?' (a diplomatic embargo blocks one or more partners)':''}.`,'diplomacy');
  }
 }
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
