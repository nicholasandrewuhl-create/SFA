/** Same-origin Cloudflare worker client: no Firebase credentials needed. */
let roomCode=null,token=null,ws=null,closed=false,callback=null,refreshTimer=null,tries=0;
const key=(room,role)=>`scramble-cloudflare:${room}:${role}`;
async function api(room,op,data,auth=token,method='POST'){
 const r=await fetch(`/api/rooms/${room}/${op}`,{method,headers:{...(auth?{Authorization:`Bearer ${auth}`}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},body:method==='POST'?JSON.stringify(data||{}):undefined,cache:'no-store'});
 let out;try{out=await r.json()}catch{throw Error('Service unavailable. Check the game website connection.')}
 if(!r.ok||out.ok===false)throw Error(out.reason||out.error||`Request failed (${r.status})`);
 return out;
}
export async function createRoom(code,chaosMode='spicy',playStyle='turn'){const out=await api(code,'create',{code,chaosMode,playStyle},null);localStorage.setItem(key(code,'host'),out.token);return out}
export async function resumeRoom(code){const t=localStorage.getItem(key(code,'host'))||sessionStorage.getItem(key(code,'host'));if(!t)throw Error('Teacher session not found. Use the original browser tab/profile or create a new room.');token=t;roomCode=code;return api(code,'snapshot',null,t,'GET')}
export async function requestSeat(code,preferred){const stored=localStorage.getItem(key(code,'student'));if(stored){token=stored;roomCode=code;try{return await api(code,'snapshot',null,stored,'GET')}catch{localStorage.removeItem(key(code,'student'))}}
 const out=await api(code,'join',{preferred},null);token=out.token;roomCode=code;localStorage.setItem(key(code,'student'),token);return out.snapshot}
export function hostSession(code,newToken){token=newToken;roomCode=code;localStorage.setItem(key(code,'host'),token)}
export async function assignSeat(code,id,team){return api(code,'assign',{id,team})}
export async function control(action,details={}){return api(roomCode,'control',{action,...details})}
export async function sendCommand(command,team){const id=crypto.randomUUID().replaceAll('-','');return api(roomCode,'command',{requestId:id,command,team})}
export function subscribe(cb){callback=cb;closed=false;tries=0;openStream();return ()=>{closed=true;callback=null;clearTimeout(refreshTimer);ws?.close();}}
function openStream(){if(closed||!roomCode||!token)return;
 const origin=location.origin.replace(/^http/,'ws');ws=new WebSocket(`${origin}/api/rooms/${roomCode}/ws?token=${encodeURIComponent(token)}`);
 ws.onopen=()=>{tries=0;clearTimeout(refreshTimer)};
 ws.onmessage=e=>{try{const msg=JSON.parse(e.data);if(msg.type==='snapshot')callback?.(msg)}catch{}};
 ws.onclose=()=>{if(closed)return;const delay=Math.min(15000,1200*Math.pow(1.5,++tries));refreshTimer=setTimeout(async()=>{try{const snapshot=await api(roomCode,'snapshot',null,token,'GET');callback?.(snapshot)}catch{}openStream()},delay)};
 ws.onerror=()=>ws?.close();
}
export function uid(){return token?.slice(0,8)||''}
