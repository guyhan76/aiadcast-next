(() => {
  if (window.__aiadcastNativeDownloads || !window.AiadcastNative) return;
  window.__aiadcastNativeDownloads = true;
  const maximumBytes = 32 * 1024 * 1024;
  const emit = (status, message) => window.dispatchEvent(new CustomEvent('aiadcast-native-export', { detail: { status, message } }));
  const sendDownload = async (anchor) => {
    try {
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
      emit('requested', 'Choose where to save or share your file.');
      window.AiadcastNative.postMessage(JSON.stringify({ type: 'export', filename: anchor.download || 'aiadcast', mime: blob.type, base64: encoded }));
    } catch (error) {
      emit('error', error instanceof Error ? error.message : 'The export could not be prepared.');
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
