import {offlineDemo} from './demo-mode';
type RuntimeWindow=Window & {__AIADCAST_API_ORIGIN__?:string;__AIADCAST_TEST_CONNECTION__?:boolean;AiadcastNative?:{postMessage:(message:string)=>void}};
export function configuredApiOrigin(){
 const value=(import.meta as ImportMeta & {env?:Record<string,string>}).env?.VITE_AIADCAST_API_ORIGIN||(typeof window==='undefined'?'':(window as RuntimeWindow).__AIADCAST_API_ORIGIN__)||'';
 if(!value)return '';
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(url.pathname!=='/'&&url.pathname!==''))throw Error('HTTPS_API_REQUIRED');
 return url.origin;
}
export function apiIdentity(){return (offlineDemo()?'local-demo://device':'')||configuredApiOrigin()||(typeof location==='undefined'?'':location.origin);}
export function nativeTestConnection(){return typeof window!=='undefined'&&(window as RuntimeWindow).__AIADCAST_TEST_CONNECTION__===true&&!!(window as RuntimeWindow).AiadcastNative?.postMessage;}
export function requestTestConnection(origin:string){
 if(!nativeTestConnection())throw Error('TEST_CONNECTION_UNAVAILABLE');
 (window as RuntimeWindow).AiadcastNative!.postMessage(JSON.stringify({type:'configure-test-server',origin}));
}
