/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Atomic Card Scan Linking Modal (Milestone 5)
 * 
 * Allows users to manually pair two existing historical archive records
 * as the FRONT and BACK of one physical historical card.
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Link2, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Layers, 
  ShieldCheck,
  FileText
} from 'lucide-react';
import { HistoricalCardArchive } from './types';
import { archiveStorage } from './storage';
import { formatFileSize } from './utils';
import { getCardArchiveSideStatus } from './cardAccessors';

interface LinkScansModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLinkComplete: () => void;
  records: HistoricalCardArchive[];
}

/**
 * Evaluates whether an archive record is eligible as a FRONT candidate for manual linking.
 * 
 * Rules:
 * - Must be classified as CARD_ARTWORK (photoshop templates and other assets are excluded).
 * - Must be single-sided (not already paired with a back scan).
 * - Must be explicitly classified FRONT (side !== 'UNKNOWN' and side !== 'BACK').
 */
export function isEligibleFrontScanRecord(r: HistoricalCardArchive): boolean {
  if (r.classification !== 'CARD_ARTWORK') return false;
  // Exclude two-sided / already paired records
  if (r.frontAsset && r.backAsset) return false;
  // Must have a front asset and no back asset
  if (!r.frontAsset || r.backAsset) return false;
  // Must be explicitly classified FRONT
  return r.frontAsset.side === 'FRONT';
}

/**
 * Evaluates whether an archive record is eligible as a BACK candidate for manual linking.
 * 
 * Rules:
 * - Must be classified as CARD_ARTWORK (photoshop templates and other assets are excluded).
 * - Must be single-sided (not already paired with a front scan).
 * - Must be explicitly classified BACK (side !== 'UNKNOWN' and side !== 'FRONT').
 * - A FRONT record can NEVER appear as a BACK candidate.
 */
export function isEligibleBackScanRecord(r: HistoricalCardArchive): boolean {
  if (r.classification !== 'CARD_ARTWORK') return false;
  // Exclude two-sided / already paired records
  if (r.frontAsset && r.backAsset) return false;
  // If r.frontAsset exists with side FRONT, it is NEVER a back candidate!
  if (r.frontAsset && r.frontAsset.side === 'FRONT') return false;
  // Must be explicitly classified BACK
  if (r.backAsset) {
    return r.backAsset.side === 'BACK' && !r.frontAsset;
  }
  if (r.frontAsset) {
    return r.frontAsset.side === 'BACK' && !r.backAsset;
  }
  return false;
}

export const LinkScansModal: React.FC<LinkScansModalProps> = ({
  isOpen,
  onClose,
  onLinkComplete,
  records,
}) => {
  const [primaryId, setPrimaryId] = useState<string>('');
  const [secondaryId, setSecondaryId] = useState<string>('');
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [primaryThumb, setPrimaryThumb] = useState<string | null>(null);
  const [secondaryThumb, setSecondaryThumb] = useState<string | null>(null);

  // Eligible single-sided records for FRONT scan: CARD_ARTWORK only, not paired, explicitly FRONT
  const eligibleFrontRecords = records.filter(isEligibleFrontScanRecord);

  // Eligible single-sided records for BACK scan: CARD_ARTWORK only, not paired, explicitly BACK
  const eligibleBackRecords = records.filter(isEligibleBackScanRecord);

  // Load preview thumbnails when selection changes
  useEffect(() => {
    let pUrl: string | null = null;
    let sUrl: string | null = null;

    const loadThumbs = async () => {
      if (primaryId) {
        const blob = await archiveStorage.getArchiveThumbnailForSide(primaryId, 'FRONT') ||
                     await archiveStorage.getArchiveBinaryForSide(primaryId, 'FRONT');
        if (blob && blob.type.startsWith('image/')) {
          pUrl = URL.createObjectURL(blob);
          setPrimaryThumb(pUrl);
        } else {
          setPrimaryThumb(null);
        }
      } else {
        setPrimaryThumb(null);
      }

      if (secondaryId) {
        const blob = await archiveStorage.getArchiveThumbnailForSide(secondaryId, 'BACK') ||
                     await archiveStorage.getArchiveThumbnailForSide(secondaryId, 'FRONT') ||
                     await archiveStorage.getArchiveBinaryForSide(secondaryId, 'BACK') ||
                     await archiveStorage.getArchiveBinaryForSide(secondaryId, 'FRONT');
        if (blob && blob.type.startsWith('image/')) {
          sUrl = URL.createObjectURL(blob);
          setSecondaryThumb(sUrl);
        } else {
          setSecondaryThumb(null);
        }
      } else {
        setSecondaryThumb(null);
      }
    };

    loadThumbs();

    return () => {
      if (pUrl) URL.revokeObjectURL(pUrl);
      if (sUrl) URL.revokeObjectURL(sUrl);
    };
  }, [primaryId, secondaryId]);

  if (!isOpen) return null;

  const selectedPrimary = records.find(r => r.archiveId === primaryId);
  const selectedSecondary = records.find(r => r.archiveId === secondaryId);

  const handleExecuteLink = async () => {
    if (!primaryId || !secondaryId) {
      setError('Please select both a front scan and a back scan.');
      return;
    }
    if (primaryId === secondaryId) {
      setError('A card cannot be linked to itself.');
      return;
    }

    const frontCandidate = records.find(r => r.archiveId === primaryId);
    if (!frontCandidate || !isEligibleFrontScanRecord(frontCandidate)) {
      setError('The selected front scan is ineligible or not classified as FRONT.');
      return;
    }

    const backCandidate = records.find(r => r.archiveId === secondaryId);
    if (!backCandidate || !isEligibleBackScanRecord(backCandidate)) {
      setError('The selected back scan is ineligible or not classified as BACK.');
      return;
    }

    setIsLinking(true);
    setError(null);

    try {
      await archiveStorage.linkExistingArchiveRecords(primaryId, secondaryId, 'FRONT', 'BACK');
      setIsLinking(false);
      onLinkComplete();
      onClose();
    } catch (err: any) {
      setIsLinking(false);
      setError(err?.message || 'Linking failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-3xl bg-slate-900 border-2 border-slate-700/80 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-100">Link Existing Front & Back Scans</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Combine two independent single-sided scans into one physical card. Fully reversible at any time.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLinking}
            className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Selectors Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Primary (Front) Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                <span>1. Select Front Scan (Primary)</span>
              </label>

              <select
                value={primaryId}
                onChange={(e) => setPrimaryId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-amber-400"
              >
                <option value="">-- Choose Front Scan --</option>
                {eligibleFrontRecords
                  .filter(r => r.archiveId !== secondaryId)
                  .map(r => (
                    <option key={r.archiveId} value={r.archiveId}>
                      {r.originalFileName} ({r.originalCreationYear || 'Undated'})
                    </option>
                  ))}
              </select>

              {/* Preview Box */}
              <div className="h-44 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden p-2">
                {primaryThumb ? (
                  <img src={primaryThumb} alt="Front preview" className="w-full h-full object-contain" />
                ) : selectedPrimary ? (
                  <div className="text-center p-3 text-slate-500">
                    <FileText className="w-8 h-8 mx-auto mb-1 text-slate-600" />
                    <span className="text-xs font-bold text-slate-400 block truncate">{selectedPrimary.originalFileName}</span>
                    <span className="text-[10px] font-mono">{formatFileSize(selectedPrimary.originalFileSize)}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-600 italic">No Front scan selected</span>
                )}
              </div>
            </div>

            {/* Secondary (Back) Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                <span>2. Select Back Scan (Secondary)</span>
              </label>

              <select
                value={secondaryId}
                onChange={(e) => setSecondaryId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-purple-400"
              >
                <option value="">-- Choose Back Scan --</option>
                {eligibleBackRecords
                  .filter(r => r.archiveId !== primaryId)
                  .map(r => (
                    <option key={r.archiveId} value={r.archiveId}>
                      {r.originalFileName} ({r.originalCreationYear || 'Undated'})
                    </option>
                  ))}
              </select>

              {/* Preview Box */}
              <div className="h-44 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden p-2">
                {secondaryThumb ? (
                  <img src={secondaryThumb} alt="Back preview" className="w-full h-full object-contain" />
                ) : selectedSecondary ? (
                  <div className="text-center p-3 text-slate-500">
                    <FileText className="w-8 h-8 mx-auto mb-1 text-slate-600" />
                    <span className="text-xs font-bold text-slate-400 block truncate">{selectedSecondary.originalFileName}</span>
                    <span className="text-[10px] font-mono">{formatFileSize(selectedSecondary.originalFileSize)}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-600 italic">No Back scan selected</span>
                )}
              </div>
            </div>
          </div>

          {/* Atomic Safety Notice */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3 text-xs text-slate-400">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <p>
              <strong>Atomic Data Integrity:</strong> The back scan's original binary is re-keyed to a unique asset UUID and safely preserved. Any playable variations pointing to the secondary scan will automatically be re-linked to the combined physical card.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isLinking}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleExecuteLink}
            disabled={!primaryId || !secondaryId || isLinking}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow-lg flex items-center gap-1.5 disabled:opacity-50"
          >
            {isLinking ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Linking Scans...</span>
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                <span>Link as One Physical Card</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
