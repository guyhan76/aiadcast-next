export type BetaSession={token:string;expires:number;user:{id:string;label:string}};
const key='aiadcast.beta-session';
export function betaSession():BetaSession|null {try{const s=JSON.parse(sessionStorage.getItem(key)??'null');return s&&/^[A-Za-z0-9_-]{43}$/.test(s.token)&&/^[A-Za-z0-9_-]{8,100}$/.test(s.user?.id)&&typeof s.user.label==='string'&&Number.isFinite(s.expires)?s:null;}catch{return null;}}
export function setBetaSession(s:BetaSession|null){if(s)sessionStorage.setItem(key,JSON.stringify(s));else sessionStorage.removeItem(key);window.dispatchEvent(new Event('aiadcast-session-change'));}
export function storageNamespace(){return betaSession()?.user.id??'guest';}
