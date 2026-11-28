export function referenceJpeg(visual:HTMLImageElement|HTMLVideoElement,maxEdge:number){
  const video=visual instanceof HTMLVideoElement;
  const width=video?visual.videoWidth:visual.naturalWidth, height=video?visual.videoHeight:visual.naturalHeight;
  if(!width||!height)throw Error('VIDEO_REFERENCE_FORMAT');
  const scale=Math.min(1,maxEdge/Math.max(width,height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('VIDEO_REFERENCE_FORMAT');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(visual,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.82);
}
