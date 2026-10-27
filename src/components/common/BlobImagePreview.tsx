/**
 * BlobImagePreview Component
 * --------------------------
 * Displays an image stored in IndexedDB (`blobs` table) with an optional
 * full-screen lightbox preview on click and an optional delete button.
 */

import React, { useState } from 'react';
import { Trash2, X, ZoomIn } from 'lucide-react';
import { useBlobUrl } from '../../hooks/useBlobUrl';

interface BlobImagePreviewProps {
  blobId: string;
  alt?: string;
  className?: string;
  onRemove?: () => void;
}

export const BlobImagePreview: React.FC<BlobImagePreviewProps> = ({
  blobId,
  alt = 'Attached image',
  className = 'w-20 h-14',
  onRemove,
}) => {
  const url = useBlobUrl(blobId);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  if (!url) {
    return (
      <div
        className={`${className} rounded bg-slate-900 border border-slate-800 animate-pulse`}
      />
    );
  }

  return (
    <>
      <div
        className={`group relative ${className} rounded overflow-hidden border border-slate-700 bg-slate-950 cursor-pointer shrink-0`}
        onClick={() => setIsLightboxOpen(true)}
      >
        <img
          src={url}
          alt={alt}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
        />
        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <ZoomIn size={14} className="text-white drop-shadow" />
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-0.5 right-0.5 p-0.5 rounded bg-slate-950/90 text-rose-400 hover:bg-rose-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove attachment"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="absolute -top-10 right-0 flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs"
            >
              <X size={14} />
              <span>Close (Esc)</span>
            </button>
            <img
              src={url}
              alt={alt}
              className="max-w-full max-h-[85vh] object-contain rounded-lg border border-slate-700 shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
};
