import { useEffect } from 'react';

/**
 * Listens for clipboard paste events on the document and calls onFile when
 * an image is found in the clipboard data.
 *
 * Does NOT intercept paste when the focused element is a text input, textarea,
 * or contenteditable (so normal text pasting continues to work).
 *
 * @param onFile  Callback invoked with the pasted image File object.
 * @param enabled Set to false to disable the listener (e.g. when modal is closed).
 */
export function useClipboardImagePaste(
  onFile: (file: File) => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: ClipboardEvent) => {
      // Don't intercept while typing in text fields
      const active = document.activeElement as HTMLElement | null;
      const tag = (active?.tagName ?? '').toUpperCase();
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        active?.isContentEditable ||
        active?.getAttribute('contenteditable') === 'true'
      ) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const raw = items[i].getAsFile();
          if (raw) {
            const ext = items[i].type.split('/')[1] || 'png';
            const named = new File([raw], `clipboard-${Date.now()}.${ext}`, {
              type: items[i].type,
            });
            onFile(named);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [enabled, onFile]);
}
