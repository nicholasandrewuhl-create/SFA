/** Host-authoritative classroom command resolver. The teacher browser is the only
 * state writer. Firebase rules must stop student writes to state/private branches.
 * Pure module so seven simulated clients can exercise exactly the same path. */
import {act,minor,propose,respond,betray,special,comebackGambit,IDS,REG,clone} from './engine.js';
import {ACTIONS,MINORS} from './data/factions.js';
export const COMMAND_TYPES=['action','minor','offer','respond','betray','special','gambit'];
const fail=reason=>({ok:false,reason});
export function resolveTeamCommand(state,team,cmd){
 if(!IDS.includes(team))return fail('You have not been assigned a country.');
 if(!cmd || !COMMAND_TYPES.includes(cmd.type))return fail('Unknown command.');
 if(state.finished || state.phase==='ended')return fail('This campaign has ended.');
 switch(cmd.type){
  case 'action':
   if(typeof cmd.id!=='string'||!REG[cmd.id]||!Object.hasOwn(ACTIONS,cmd.action))return fail('Unknown region or expansion action.');
   return act(state,team,cmd.id,cmd.action);
  case 'minor':
   if(typeof cmd.id!=='string'||!REG[cmd.id]||!Object.hasOwn(MINORS,cmd.kind))return fail('Unknown preparation action.');
   return minor(state,team,cmd.id,cmd.kind);
  case 'offer':
   if(!IDS.includes(cmd.to)||typeof cmd.amount!=='number'||!Number.isInteger(cmd.amount)||cmd.amount<0||cmd.amount>450)return fail('Invalid offer amount or recipient.');
   if(cmd.regionId!=null&&(!REG[cmd.regionId]||typeof cmd.regionId!=='string'))return fail('Invalid treaty region.');
   return propose(state,team,cmd.to,cmd.kind,cmd.amount,cmd.regionId||null);
  case 'respond':
   if(typeof cmd.offerId!=='string'||cmd.offerId.length>60||typeof cmd.accept!=='boolean')return fail('Invalid response.');
   return respond(state,cmd.offerId,team,cmd.accept);
  case 'betray':
   if(!IDS.includes(cmd.other))return fail('Unknown treaty partner.');
   return betray(state,team,cmd.other,typeof cmd.offerId==='string'?cmd.offerId:null);
  case 'special':return special(state,team);
  case 'gambit':if(typeof cmd.id!=='string'||!REG[cmd.id])return fail('Choose a valid region first.');return comebackGambit(state,team,cmd.id);
 }
 return fail('Unknown command.');
}
export function commandReceipt(state,uid,key,result){
 const n=clone(result?.ok?result.state:state);
 const id=uid+':'+key;
 n.handledCommands=n.handledCommands||{};
 if(!n.handledCommands[id])n.handledCommands[id]={ok:!!result?.ok,reason:result?.reason||'',round:state.round};
 // Limit saved ledger, enough for entire classroom campaign.
 const entries=Object.entries(n.handledCommands);
 if(entries.length>1200)n.handledCommands=Object.fromEntries(entries.slice(-1000));
 return n;
}
