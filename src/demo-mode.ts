const key='aiadcast.offline-demo.v1';
export function offlineDemo(){try{return localStorage.getItem(key)==='enabled';}catch{return false;}}
// A mode change is followed by a reload so accounts, drafts and requests cannot mix.
export function setOfflineDemo(enabled:boolean){if(enabled)localStorage.setItem(key,'enabled');else localStorage.removeItem(key);sessionStorage.removeItem('aiadcast.beta-session');}
