import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RecommendationGuide} from '../../src/RecommendationGuide';
import {UiLanguageProvider,LanguageSwitcher} from '../../src/ui-language';
import {setBetaSession} from '../../src/beta-session';
function Fixture(){const [id,setId]=useState('generation-one');return <UiLanguageProvider><LanguageSwitcher/><button onClick={()=>setId('generation-two')}>Switch saved image</button><button onClick={()=>setBetaSession(null)}>Logout fixture</button><a href="data:text/plain,unchanged-image" download="ad.txt">Original export fixture</a><RecommendationGuide binding={{generationId:id,artifactHash:'a'.repeat(64)}} enabled={new URLSearchParams(location.search).get('enabled')==='1'}/></UiLanguageProvider>;}
createRoot(document.getElementById('fixture')!).render(<Fixture/>);
