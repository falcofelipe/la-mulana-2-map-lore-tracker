/**
 * Clipboard Image Helpers
 * -----------------------
 * Enables 1-click clipboard image pasting (via `navigator.clipboard.read()`)
 * and `Ctrl+V` `ClipboardEvent` extraction for comment attachments and tablet
 * screenshot OCR scanning, matching the map screen clipboard workflow.
 */

import React from 'react';

/**
 * Reads an image `Blob` directly from the system clipboard on button click.
 * Returns `null` if the clipboard does not currently contain an image.
 */
export async function readImageBlobFromClipboard(): Promise<Blob | null> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.read !== 'function'
  ) {
    throw new Error(
      'Direct clipboard access is unavailable in this browser context. Click the comment and press Ctrl+V instead.'
    );
  }

  const clipboardItems = await navigator.clipboard.read();
  for (const item of clipboardItems) {
    const imageType = item.types.find((t) => t.startsWith('image/'));
    if (imageType) {
      return await item.getType(imageType);
    }
  }

  return null;
}

/**
 * Extracts the first image `Blob` from a React or DOM `paste` (`Ctrl+V`) event.
 */
export function extractImageBlobFromPasteEvent(
  e: React.ClipboardEvent | ClipboardEvent
): Blob | null {
  const items = e.clipboardData?.items;
  if (!items) return null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }

  return null;
}
