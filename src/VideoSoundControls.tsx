import {useRef} from 'react';
import {Mic, Music2, X} from 'lucide-react';
import {useUiLanguage} from './ui-language';
import type {VideoSound} from './video-sound';

type Props={sound:VideoSound; hasClips:boolean; disabled:boolean; change:(sound:VideoSound)=>void};
export function VideoSoundControls({sound,hasClips,disabled,change}:Props){
  const {t}=useUiLanguage(),musicInput=useRef<HTMLInputElement>(null),voiceInput=useRef<HTMLInputElement>(null);
  function setFile(kind:'voice'|'music',file?:File){
    if(!file)return;
    change(kind==='voice'?{...sound,voice:file}:{...sound,music:'file',musicFile:file});
  }
  const accept='audio/*,.m4a,.mp3,.wav,.aac,.ogg,.flac';
  return <details className="vd-details vd-sound"><summary>{t('음악·목소리','Music & voice')}</summary>
    <fieldset disabled={disabled}><legend>{t('배경음악','Background music')}</legend>
      <div className="vd-sound-options">
        <button type="button" aria-pressed={sound.music==='off'} onClick={()=>change({...sound,music:'off',musicFile:undefined})}>{t('없음','None')}</button>
        <button type="button" aria-pressed={sound.music==='built-in'} onClick={()=>change({...sound,music:'built-in',musicFile:undefined})}>{t('기본 음악','Built-in music')}</button>
        <button type="button" aria-pressed={sound.music==='file'} onClick={()=>musicInput.current?.click()}>{t('내 음악','My music')}</button>
      </div>
      <input type="file" className="vd-file" ref={musicInput} accept={accept} aria-label={t('음악 파일','Music file')} onChange={e=>{setFile('music',e.target.files?.[0]);e.target.value='';}}/>
      {sound.music==='file'&&sound.musicFile&&<small className="vd-audio-name"><Music2 size={15}/>{sound.musicFile.name}</small>}
    </fieldset>
    <fieldset disabled={disabled}><legend>{t('목소리','Voice-over')}</legend>
      <input type="file" ref={voiceInput} className="vd-file" accept={accept} aria-label={t('내레이션 파일','Narration file')} onChange={e=>{setFile('voice',e.target.files?.[0]);e.target.value='';}}/>
      <div className="vd-voice"><button type="button" onClick={()=>voiceInput.current?.click()}><Mic size={16}/>{sound.voice?sound.voice.name:t('녹음 파일 추가','Add a voice recording')}</button>
        {sound.voice&&<button type="button" aria-label={t('목소리 삭제','Remove voice-over')} onClick={()=>change({...sound,voice:undefined})}><X size={16}/></button>}</div>
      {sound.voice && <small>{t('녹음이 재생되는 동안 배경음을 낮춰요.','Background sound dips during narration.')}</small>}
    </fieldset>
    {hasClips&&<label className="vd-original"><input type="checkbox" disabled={disabled} checked={sound.original} onChange={e=>change({...sound,original:e.target.checked})}/>{t('촬영 영상 원래 소리','Use original clip sound')}</label>}
  </details>;
}
