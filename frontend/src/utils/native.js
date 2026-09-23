// Bridges for the few browser features that don't exist inside the iOS app's
// WKWebView. On the web every helper falls straight through to the browser API,
// so callers never branch on platform themselves.
import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

// Implemented in ios/App/App/AppViewController.swift — WKWebView ignores window.print().
const NativePrint = registerPlugin('Print');

/** Print the current page (the app's @media print styles still apply). */
export function printPage() {
  if (!isNative) {
    window.print();
    return;
  }
  NativePrint.print({ name: document.title }).catch(err => {
    console.error('Print failed', err);
    alert('Could not open the print dialog.');
  });
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/**
 * Save a file for the user. The web gets a normal download; the iOS app writes
 * it to the cache and opens the share sheet (Save to Files, AirDrop, WhatsApp…),
 * since WKWebView silently ignores <a download>.
 * `data` is a Blob or a data: URL.
 */
export async function saveFile(filename, data) {
  if (!isNative) {
    const url = typeof data === 'string' ? data : URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (typeof data !== 'string') URL.revokeObjectURL(url);
    return;
  }

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const base64 = typeof data === 'string' ? data.split(',')[1] : await blobToBase64(data);
  const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
  try {
    await Share.share({ title: filename, files: [uri] });
  } catch (err) {
    // Dismissing the share sheet rejects; that's the user's choice, not a failure.
    if (!/cancel/i.test(err?.message || '')) throw err;
  }
}
