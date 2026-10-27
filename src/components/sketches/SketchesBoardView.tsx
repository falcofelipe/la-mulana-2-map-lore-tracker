/**
 * SketchesBoardView Component
 * ---------------------------
 * Dedicated freeform board for global puzzle diagrams, tablet symbol collections,
 * and cross-map notes (replacing the floating Yggdrasil root diagram on the Excel sheet).
 */

import React, { useState } from 'react';
import { PenTool, Upload, Trash2, Plus } from 'lucide-react';
import { MapPage, SketchNote } from '../../types/models';
import { BlobImagePreview } from '../common/BlobImagePreview';
import { SketchCanvasModal } from './SketchCanvasModal';

interface SketchesBoardViewProps {
  sketches: SketchNote[];
  maps: MapPage[];
  onCreateSketch: (
    title: string,
    description: string,
    mapId?: string,
    imageBlob?: Blob
  ) => Promise<SketchNote>;
  onUpdateSketch: (
    sketchId: string,
    updates: Partial<Pick<SketchNote, 'title' | 'description' | 'mapId'>>,
    newImageBlob?: Blob
  ) => Promise<void>;
  onDeleteSketch: (sketchId: string) => Promise<void>;
}

export const SketchesBoardView: React.FC<SketchesBoardViewProps> = ({
  sketches,
  maps,
  onCreateSketch,
  onUpdateSketch,
  onDeleteSketch,
}) => {
  const [isDrawingNew, setIsDrawingNew] = useState(false);
  const [redrawSketchId, setRedrawSketchId] = useState<string | null>(null);

  const handleUploadImageAsSketch = async (file: File) => {
    const baseName = file.name.replace(/\.[^.]+$/, '');
    await onCreateSketch(baseName || 'Uploaded Diagram', '', undefined, file);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 p-6 overflow-y-auto gap-6">
      {/* Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <PenTool size={18} className="text-amber-400" />
            <span>Tablet Sketches, Root Maps &amp; General Puzzle Notes</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Draw freehand diagrams (like the Yggdrasil tree-root map or mantra combinations) or upload reference images.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsDrawingNew(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow"
          >
            <Plus size={15} />
            <span>Draw New Sketch</span>
          </button>

          <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer">
            <Upload size={14} />
            <span>Upload Diagram Image</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadImageAsSketch(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* Sketches Grid */}
      {sketches.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl p-12 text-center">
          <PenTool size={36} className="text-slate-600 mb-3" />
          <h3 className="text-sm font-bold text-slate-300">
            No Global Sketches or Diagrams Yet
          </h3>
          <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
            Use the built-in Sketch Pad to draw Yggdrasil root connections, tablet symbols, or multi-room puzzle notes.
          </p>
          <button
            type="button"
            onClick={() => setIsDrawingNew(true)}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950"
          >
            Open Sketch Pad
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {sketches.map((sketch) => (
            <div
              key={sketch.id}
              className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-lg"
            >
              {/* Visual Preview or Draw Prompt */}
              <div className="aspect-video bg-slate-950 border-b border-slate-800 relative flex items-center justify-center">
                {sketch.imageBlobId ? (
                  <BlobImagePreview
                    blobId={sketch.imageBlobId}
                    alt={sketch.title}
                    className="w-full h-full"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setRedrawSketchId(sketch.id)}
                    className="flex flex-col items-center gap-2 text-slate-500 hover:text-amber-300 transition-colors"
                  >
                    <PenTool size={24} />
                    <span className="text-xs font-medium">
                      Click to draw diagram for "{sketch.title}"
                    </span>
                  </button>
                )}
              </div>

              {/* Editable Title, Map Link & Notes */}
              <div className="p-4 flex-1 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={sketch.title}
                    onChange={(e) =>
                      onUpdateSketch(sketch.id, { title: e.target.value })
                    }
                    placeholder="Sketch Title..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-bold text-slate-100 focus:outline-none focus:border-amber-400"
                  />

                  <select
                    value={sketch.mapId || ''}
                    onChange={(e) =>
                      onUpdateSketch(sketch.id, {
                        mapId: e.target.value || undefined,
                      })
                    }
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-amber-300 font-mono"
                  >
                    <option value="">Global</option>
                    {maps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codePrefix}
                      </option>
                    ))}
                  </select>
                </div>

                <textarea
                  rows={3}
                  value={sketch.description}
                  onChange={(e) =>
                    onUpdateSketch(sketch.id, { description: e.target.value })
                  }
                  placeholder="Write puzzle notes, root connections, or symbol meanings..."
                  className="w-full flex-1 bg-slate-950 border border-slate-800 rounded p-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-400"
                />

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setRedrawSketchId(sketch.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
                  >
                    <PenTool size={12} />
                    <span>{sketch.imageBlobId ? 'Redraw Canvas' : 'Draw Canvas'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteSketch(sketch.id)}
                    className="p-1.5 rounded bg-slate-950 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800"
                    title="Delete Sketch"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isDrawingNew && (
        <SketchCanvasModal
          showMetadataInputs
          onSave={async (blob, title, description) => {
            await onCreateSketch(
              title || 'New Sketch',
              description,
              undefined,
              blob
            );
          }}
          onClose={() => setIsDrawingNew(false)}
        />
      )}

      {redrawSketchId && (
        <SketchCanvasModal
          onSave={async (blob) => {
            await onUpdateSketch(redrawSketchId, {}, blob);
          }}
          onClose={() => setRedrawSketchId(null)}
        />
      )}
    </div>
  );
};
