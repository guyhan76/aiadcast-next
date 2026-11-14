(() => {
  if (window.__aiadcastNativeDownloads || !window.AiadcastNative) return;
  window.__aiadcastNativeDownloads = true;
  let owner = null, epoch = 0, activeRequest = null;
  window.addEventListener('aiadcast-export-context', event => {
    const next = event.detail?.owner;
    if (typeof next !== 'string' || !next || next.length > 512 || /[\x00-\x1f\x7f]/.test(next)) return;
    if (next !== owner) { owner = next; epoch++; activeRequest = null; }
    window.AiadcastNative.postMessage(JSON.stringify({type:'export-context',owner}));
  });
  window.addEventListener('aiadcast-native-export', event => {
    const {status,requestId} = event.detail || {};
    if (status === 'requested' && requestId) activeRequest = requestId;
    if (['saved','cancelled','error','share-opened'].includes(status) && (!requestId || requestId === activeRequest)) activeRequest = null;
  });
  // React may already have mounted when old WebView versions inject the bridge.
  window.dispatchEvent(new Event('aiadcast-export-context-needed'));
  const maximumBytes = 32 * 1024 * 1024;
  const emit = (status, message) => window.dispatchEvent(new CustomEvent('aiadcast-native-export', { detail: { status, message } }));
  const sendDownload = async (anchor) => {
    if (activeRequest) return;
    const producerSignal = anchor.aiadcastExportSignal;
    if (producerSignal?.aborted) return;
    const requestId = crypto.randomUUID(), startEpoch = epoch, startOwner = owner;
    activeRequest = requestId;
    const cancelled = () => { if (activeRequest === requestId) activeRequest = null; };
    producerSignal?.addEventListener('abort', cancelled, {once:true});
    try {
      if (!startOwner) throw new Error('Wait for your account and saved work to load.');
      const url = new URL(anchor.href, location.href);
      // Downloads originate from local object URLs; arbitrary network downloads are not proxied.
      if (url.protocol !== 'blob:' || url.origin !== location.origin) throw new Error('Only files made in this app can be exported.');
      const response = await fetch(url.href);
      const blob = await response.blob();
      if (!['image/png', 'application/json'].includes(blob.type) || !blob.size || blob.size > maximumBytes) throw new Error('Export supports PNG and project JSON files up to 32 MB.');
      const encoded = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('The export file could not be read.'));
        reader.readAsDataURL(blob);
      });
      if (producerSignal?.aborted || startEpoch !== epoch || startOwner !== owner) return;
      emit('requested', 'Choose where to save or share your file.');
      window.AiadcastNative.postMessage(JSON.stringify({ type: 'export', requestId, owner: startOwner, filename: anchor.download || 'aiadcast', mime: blob.type, base64: encoded }));
    } catch (error) {
      if (producerSignal?.aborted || startEpoch !== epoch) return;
      activeRequest = null;
      emit('error', error instanceof Error ? error.message : 'The export could not be prepared.');
    } finally {
      producerSignal?.removeEventListener('abort', cancelled);
    }
  };
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download')) { void sendDownload(this); return; }
    return originalClick.call(this);
  };
  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[download]') : null;
    if (!anchor) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void sendDownload(anchor);
  }, true);
})();
