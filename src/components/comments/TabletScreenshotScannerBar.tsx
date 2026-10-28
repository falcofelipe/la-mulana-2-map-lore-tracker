/**
 * TabletScreenshotScannerBar Component
 * ------------------------------------
 * Provides a compact UI bar inside New / Edit Comment forms to:
 * 1. Paste a La-Mulana 2 tablet screenshot directly from the clipboard
 *    (via 1-click button OR pressing Ctrl+V anywhere inside the form).
 * 2. Automatically run client-side OCR + colored word tagging (`{g:...}`, `{r:...}`)
 *    + upper-right Child/Race header extraction + cyan tablet drawing detection.
 * 3. Let the user toggle whether to keep the screenshot as an attachment when
 *    saving the comment (auto-checked when a tablet drawing is detected).
 */

import React, { useEffect, useState } from 'react';
import {
  ScanText,
  Sparkles,
  Image as ImageIcon,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import {
  CustomFieldDefinition,
  TabletScannerConfig,
} from '../../types/models';
import { DEFAULT_TABLET_SCANNER_CONFIG } from '../../config/defaultDefinitions';
import { readImageBlobFromClipboard } from '../../utils/clipboardImage';
import {
  scanTabletScreenshot,
  TabletScanResult,
} from '../../utils/tabletScanner';

export interface ScannedAttachmentState {
  blob: Blob;
  keepAttachment: boolean;
  scanResult: TabletScanResult;
}

interface TabletScreenshotScannerBarProps {
  scannerConfig?: TabletScannerConfig;
  customCommentFields: CustomFieldDefinition[];
  pendingScan: ScannedAttachmentState | null;
  onChangePendingScan: (next: ScannedAttachmentState | null) => void;
  onApplyParsedData: (data: {
    transcript: string;
    headerText?: string;
    routedSpeakerOrTitle?: string;
    routedCustomField?: { fieldId: string; value: string };
    appendedHeaderNote?: string;
  }) => void;
  onAddCustomFieldOption?: (fieldId: string, newOption: string) => Promise<void>;
  /** Optional external file/blob trigger (e.g. from form-level Ctrl+V paste) */
  externalPasteFile?: { blob: Blob; timestamp: number } | null;
  compact?: boolean;
}

export const TabletScreenshotScannerBar: React.FC<
  TabletScreenshotScannerBarProps
> = ({
  scannerConfig = DEFAULT_TABLET_SCANNER_CONFIG,
  customCommentFields,
  pendingScan,
  onChangePendingScan,
  onApplyParsedData,
  onAddCustomFieldOption,
  externalPasteFile,
  compact = false,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingScan?.blob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingScan.blob);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pendingScan?.blob]);

  const processScreenshotBlob = async (blob: Blob) => {
    setIsScanning(true);
    setScanError(null);

    try {
      const effectiveConfig: TabletScannerConfig = {
        ...DEFAULT_TABLET_SCANNER_CONFIG,
        ...scannerConfig,
      };

      const result = await scanTabletScreenshot(blob, {
        autoHighlightColoredText: effectiveConfig.autoHighlightColoredText,
        extractHeader: effectiveConfig.headerTargetMode !== 'ignore',
      });

      const keepAttachment = effectiveConfig.autoKeepAttachmentOnDrawing
        ? result.hasDrawing
        : false;

      onChangePendingScan({
        blob,
        keepAttachment,
        scanResult: result,
      });

      // Route upper-right header text based on global configuration
      let routedSpeakerOrTitle: string | undefined;
      let routedCustomField: { fieldId: string; value: string } | undefined;
      let appendedHeaderNote: string | undefined;

      if (result.headerText) {
        if (
          effectiveConfig.headerTargetMode === 'custom_field' &&
          effectiveConfig.targetCustomFieldId
        ) {
          const targetField = customCommentFields.find(
            (f) => f.id === effectiveConfig.targetCustomFieldId
          );
          if (targetField) {
            routedCustomField = {
              fieldId: targetField.id,
              value: result.headerText,
            };
            if (
              targetField.type === 'select' &&
              onAddCustomFieldOption &&
              !(targetField.options || []).some(
                (o) => o.toLowerCase() === result.headerText!.toLowerCase()
              )
            ) {
              await onAddCustomFieldOption(targetField.id, result.headerText);
            }
          } else {
            routedSpeakerOrTitle = result.headerText;
          }
        } else if (effectiveConfig.headerTargetMode === 'speaker_or_title') {
          routedSpeakerOrTitle = result.headerText;
        } else if (effectiveConfig.headerTargetMode === 'append_content') {
          appendedHeaderNote = `[${result.headerText}]`;
        }
      }

      onApplyParsedData({
        transcript: result.transcript,
        headerText: result.headerText,
        routedSpeakerOrTitle,
        routedCustomField,
        appendedHeaderNote,
      });
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Failed to scan screenshot text'
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handlePasteFromClipboardClick = async () => {
    if (isScanning) return;
    setScanError(null);
    try {
      const blob = await readImageBlobFromClipboard();
      if (!blob) {
        setScanError(
          'No screenshot image found in clipboard. Copy a game screenshot first, then click here or press Ctrl+V!'
        );
        return;
      }
      await processScreenshotBlob(blob);
    } catch (err) {
      setScanError(
        err instanceof Error
          ? err.message
          : 'Could not read image from clipboard. Try pressing Ctrl+V inside the form.'
      );
    }
  };

  useEffect(() => {
    if (externalPasteFile?.blob) {
      processScreenshotBlob(externalPasteFile.blob);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPasteFile?.timestamp]);

  const targetFieldName =
    scannerConfig?.headerTargetMode === 'custom_field' &&
    scannerConfig?.targetCustomFieldId
      ? customCommentFields.find(
          (f) => f.id === scannerConfig.targetCustomFieldId
        )?.name
      : undefined;

  return (
    <div className="bg-slate-950/90 border border-cyan-500/30 rounded-lg p-2.5 flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isScanning}
            onClick={handlePasteFromClipboardClick}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold transition-colors border ${
              isScanning
                ? 'bg-slate-900 text-cyan-300 border-cyan-500/40 cursor-wait'
                : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border-cyan-500/40 shadow-sm cursor-pointer'
            }`}
            title="Paste screenshot directly from your clipboard (or press Ctrl+V inside this form) to auto-read text, highlight colored words, and detect drawings"
          >
            {isScanning ? (
              <>
                <Loader2 size={13} className="animate-spin text-cyan-400" />
                <span>Scanning Tablet OCR...</span>
              </>
            ) : (
              <>
                <ScanText size={13} className="text-cyan-400" />
                <span>Paste &amp; Scan Tablet Screenshot (or Ctrl+V)</span>
              </>
            )}
          </button>

          {!compact && !pendingScan && !isScanning && (
            <span className="text-[11px] text-slate-400">
              Reads clipboard image, highlights{' '}
              <span className="text-emerald-300 font-semibold">{'{g:green}'}</span>{' '}
              /{' '}
              <span className="text-rose-300 font-semibold">{'{r:red}'}</span>{' '}
              keywords &amp; detects drawings
            </span>
          )}
        </div>

        {/* Manual Color Tag Legend / Quick Hint */}
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <Sparkles size={11} className="text-amber-400 shrink-0" />
          <span>
            Tags:{' '}
            <code className="text-emerald-300 bg-emerald-500/10 px-1 rounded">
              {'{g:word}'}
            </code>{' '}
            <code className="text-rose-300 bg-rose-500/10 px-1 rounded">
              {'{r:word}'}
            </code>{' '}
            <code className="text-cyan-300 bg-cyan-500/10 px-1 rounded">
              {'{c:word}'}
            </code>
          </span>
        </div>
      </div>

      {scanError && (
        <div className="text-[11px] text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded px-2.5 py-1">
          {scanError}
        </div>
      )}

      {/* Scanned Screenshot Preview + "Keep as Attachment" Checkbox */}
      {pendingScan && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/90">
          <div className="flex items-center gap-2.5 min-w-0">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Scanned tablet preview"
                className="w-16 h-9 object-cover rounded border border-slate-700 shrink-0 bg-slate-900"
              />
            )}
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {pendingScan.scanResult.hasDrawing ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 text-[10px] font-semibold">
                    <ImageIcon size={10} className="text-cyan-300" />
                    <span>Drawing Detected (Auto-checked attachment)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 text-[10px]">
                    <span>No drawing detected (Text-only tablet)</span>
                  </span>
                )}

                {pendingScan.scanResult.headerText && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/40 text-[10px] font-semibold">
                    <span>Header: &ldquo;{pendingScan.scanResult.headerText}&rdquo;</span>
                    {targetFieldName && (
                      <span className="text-purple-300/80">
                        → {targetFieldName}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 cursor-pointer text-[11px] font-medium text-slate-200">
              <input
                type="checkbox"
                checked={pendingScan.keepAttachment}
                onChange={(e) =>
                  onChangePendingScan({
                    ...pendingScan,
                    keepAttachment: e.target.checked,
                  })
                }
                className="accent-cyan-400"
              />
              <span>Keep picture as attachment</span>
              {pendingScan.keepAttachment && (
                <Check size={12} className="text-emerald-400" />
              )}
            </label>

            <button
              type="button"
              onClick={() => onChangePendingScan(null)}
              className="p-1 rounded bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800"
              title="Discard scanned screenshot preview (keeps parsed text)"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
