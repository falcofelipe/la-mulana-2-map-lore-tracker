/**
 * useBlobUrl Hook
 * ---------------
 * Safely resolves an IndexedDB binary Blob ID into a browser `blob:...` Object URL
 * and automatically revokes the URL when the component unmounts or the ID changes
 * to prevent memory leaks.
 */

import { useEffect, useState } from 'react';
import { db } from '../db/database';

export function useBlobUrl(blobId?: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blobId) {
      setUrl(null);
      return;
    }

    let isCancelled = false;
    let createdObjectUrl: string | null = null;

    db.blobs
      .get(blobId)
      .then((record) => {
        if (isCancelled || !record?.blob) {
          if (!isCancelled) setUrl(null);
          return;
        }
        createdObjectUrl = URL.createObjectURL(record.blob);
        setUrl(createdObjectUrl);
      })
      .catch(() => {
        if (!isCancelled) setUrl(null);
      });

    return () => {
      isCancelled = true;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [blobId]);

  return url;
}
