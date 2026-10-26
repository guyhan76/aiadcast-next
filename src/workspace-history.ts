import {useLayoutEffect,useRef,useState} from 'react';
import type {WorkspaceDraft} from './workspace-draft';
// Session-local, owner-scoped history. URLs contain no project data or generation intent.
export function useWorkspaceHistory(scope:string,snapshot:WorkspaceDraft,restore:(draft:WorkspaceDraft)=>void){
 const entries=useRef<{hash:string;draft:WorkspaceDraft}[]>([]),cursor=useRef(0),latest=useRef({snapshot,restore});latest.current={snapshot,restore};
 const [position,setPosition]=useState({index:0,length:1});
 const tag=useRef(crypto.randomUUID());
 useLayoutEffect(()=>{
  entries.current=[{hash:location.hash,draft:latest.current.snapshot}];cursor.current=0;
  history.replaceState({...history.state,aiadcastHistory:{scope,tag:tag.current,index:0}},'');
  const changed=()=>{
   const marker=history.state?.aiadcastHistory;
   if(marker?.scope===scope&&marker.tag===tag.current&&Number.isInteger(marker.index)&&entries.current[marker.index]?.hash===location.hash){
    cursor.current=marker.index;latest.current.restore(entries.current[cursor.current].draft);
   }else{
    entries.current=entries.current.slice(0,cursor.current+1);cursor.current++;entries.current.push({hash:location.hash,draft:latest.current.snapshot});
    history.replaceState({...history.state,aiadcastHistory:{scope,tag:tag.current,index:cursor.current}},'');
   }
setPosition({index:cursor.current,length:entries.current.length});
  };
  window.addEventListener('hashchange',changed);return()=>{window.removeEventListener('hashchange',changed);entries.current=[];};
 },[scope]);
 useLayoutEffect(()=>{if(entries.current[cursor.current]?.hash===location.hash)entries.current[cursor.current].draft=snapshot;},[snapshot]);
 const checkpoint=()=>{if(entries.current[cursor.current])entries.current[cursor.current].draft=latest.current.snapshot;};
 const move=(delta:number)=>{const target=cursor.current+delta;if(target<0||target>=entries.current.length)return;checkpoint();history.go(delta);};
 return {canBack:position.index>0,canForward:position.index<position.length-1,back:()=>move(-1),forward:()=>move(1),checkpoint};
}
