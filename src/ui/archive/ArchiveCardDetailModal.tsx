/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Historical Archive Card Detail Modal (Milestone 5 — Physical Front/Back Inspection)
 * 
 * Features:
 * - Full-resolution view of original physical card scans (both Front and Back sides).
 * - Side-by-side desktop viewport with high-contrast mobile toggle tabs [ Front Scan ] [ Back Scan ].
 * - Independent download actions for unaltered original Front and Back binaries.
 * - Missing side notification banner when a card has only front or back.
 * - Side Unknown classifier for ambiguous records.
 * - Atomic unlinking action: safely splits a 2-sided card back into two independent archive records.
 * - Metadata inspector: SHA-256 checksums, file sizes, creation year, source provenance for each side.
 * - Linked playable digital card variations manager.
 * - Curator archival notes and year editor.
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Trash2, 
  Plus, 
  Edit3, 
  HardDrive, 
  Calendar, 
  FileCode, 
  ShieldCheck, 
  Sparkles, 
  Layers,
  Save,
  Check,
  ExternalLink,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ArrowLeftRight
} from 'lucide-react';
import { HistoricalCardArchive, PlayableCardDefinition, CardAssetSide } from './types';
import { archiveStorage } from './storage';
import { formatFileSize } from './utils';
import { getCardArchiveSideStatus } from './cardAccessors';

interface ArchiveCardDetailModalProps {
  record: HistoricalCardArchive | null;
  onClose: () => void;
  onRecordUpdated: () => void;
  onRecordDeleted: () => void;
  onCreatePlayableVariation: (archiveId: string) => void;
}

export const ArchiveCardDetailModal: React.FC<ArchiveCardDetailModalProps> = ({
  record,
  onClose,
  onRecordUpdated,
  onRecordDeleted,
  onCreatePlayableVariation
}) => {
  const [frontBlob, setFrontBlob] = useState<Blob | null>(null);
  const [backBlob, setBackBlob] = useState<Blob | null>(null);
  const [frontImageUrl, setFrontImageUrl] = useState<string | null>(null);
  const [backImageUrl, setBackImageUrl] = useState<string | null>(null);
  const [activeSide, setActiveSide] = useState<'FRONT' | 'BACK'>('FRONT');
  const [linkedPlayableCards, setLinkedPlayableCards] = useState<PlayableCardDefinition[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  useEffect(() => {
    if (!record) return;

    setNotes(record.userNotes || '');
    setYear(record.originalCreationYear);
    setIsEditing(false);

    const hasFront = Boolean(record.frontAsset || (!record.frontAsset && !record.backAsset));
    setActiveSide(hasFront ? 'FRONT' : 'BACK');

    let frontUrl: string | null = null;
    let backUrl: string | null = null;

    const loadData = async () => {
      // 1. Load Front Binary
      const fBlob = await archiveStorage.getArchiveBinaryForSide(record.archiveId, 'FRONT');
      setFrontBlob(fBlob);
      if (fBlob && record.classification === 'CARD_ARTWORK') {
        frontUrl = URL.createObjectURL(fBlob);
        setFrontImageUrl(frontUrl);
      } else {
        setFrontImageUrl(null);
      }

      // 2. Load Back Binary
      const bBlob = await archiveStorage.getArchiveBinaryForSide(record.archiveId, 'BACK');
      setBackBlob(bBlob);
      if (bBlob && record.classification === 'CARD_ARTWORK') {
        backUrl = URL.createObjectURL(bBlob);
        setBackImageUrl(backUrl);
      } else {
        setBackImageUrl(null);
      }

      // 3. Load Linked Playable Cards
      const playable = await archiveStorage.getPlayableCardsForArchive(record.archiveId);
      setLinkedPlayableCards(playable);
    };

    loadData();

    return () => {
      if (frontUrl) URL.revokeObjectURL(frontUrl);
      if (backUrl) URL.revokeObjectURL(backUrl);
    };
  }, [record]);

  if (!record) return null;

  const isPsd = record.classification === 'PHOTOSHOP_TEMPLATE';
  const sideStatus = getCardArchiveSideStatus(record);
  const hasBothSides = Boolean(record.frontAsset && record.backAsset);
  const hasFront = Boolean(record.frontAsset || (!record.frontAsset && !record.backAsset));
  const hasBack = Boolean(record.backAsset);

  // Download unaltered Front binary
  const handleDownloadFront = () => {
    if (!frontBlob) return;
    const url = URL.createObjectURL(frontBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = record.frontAsset?.fileName || record.originalFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download unaltered Back binary
  const handleDownloadBack = () => {
    if (!backBlob) return;
    const url = URL.createObjectURL(backBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = record.backAsset?.fileName || `${record.archiveId}_back.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Save metadata updates (notes, year)
  const handleSaveMetadata = async () => {
    await archiveStorage.updateArchiveRecord({
      ...record,
      userNotes: notes.trim() || null,
      originalCreationYear: year,
    });
    setIsEditing(false);
    onRecordUpdated();
  };

  // Atomic unlinking of Front & Back sides
  const handleUnlinkSides = async () => {
    if (!confirm(
      `Unlink "${record.originalFileName}"?\n\nThis will split this card back into its two original independent archive records. Any playable cards that originally belonged to the secondary scan will be cleanly restored.`
    )) {
      return;
    }

    setIsUnlinking(true);
    try {
      await archiveStorage.unlinkArchiveRecord(record.archiveId);
      onRecordUpdated();
      onClose();
    } catch (err: any) {
      alert(`Failed to unlink card: ${err.message}`);
      setIsUnlinking(false);
    }
  };

  // Delete playable card variation
  const handleDeletePlayableVariation = async (playableCardId: string) => {
    if (confirm('Delete this playable card variation? The original physical card scan in the archive will be completely preserved.')) {
      await archiveStorage.deletePlayableCard(playableCardId);
      const updated = await archiveStorage.getPlayableCardsForArchive(record.archiveId);
      setLinkedPlayableCards(updated);
      onRecordUpdated();
    }
  };

  // Delete archive record
  const handleDeleteArchiveRecord = async () => {
    if (confirm(`Permanently remove "${record.originalFileName}" from your local archive?`)) {
      await archiveStorage.deleteArchiveRecord(record.archiveId);
      onRecordDeleted();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-5xl bg-slate-900 border-2 border-slate-700/80 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[92vh]">
        {/* Left: Original Asset Viewport (Side-by-side or toggled) */}
        <div className="bg-slate-950 p-5 sm:p-6 flex flex-col items-center justify-between border-b md:border-b-0 md:border-r border-slate-800 md:w-1/2 shrink-0 overflow-y-auto">
          {/* Side Selector Tabs (Mobile & Quick-Toggle) */}
          <div className="w-full flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveSide('FRONT')}
                disabled={!hasFront}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeSide === 'FRONT'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 disabled:opacity-40'
                }`}
              >
                <span>Front Scan</span>
                {hasFront && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveSide('BACK')}
                disabled={!hasBack}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeSide === 'BACK'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 disabled:opacity-40'
                }`}
              >
                <span>Back Scan</span>
                {hasBack && <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />}
              </button>
            </div>

            {/* Desktop Side-by-Side indicator */}
            {hasBothSides && (
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Two-Sided Physical Card
              </span>
            )}
          </div>

          {/* Card Viewport Container */}
          <div className="w-full flex-1 flex items-center justify-center min-h-[320px] sm:min-h-[380px]">
            {/* Viewport for Active Side */}
            <div className="relative w-full max-w-xs h-[360px] sm:h-[400px] rounded-2xl border-2 border-slate-800 overflow-hidden flex items-center justify-center bg-slate-900 shadow-xl group">
              {activeSide === 'FRONT' ? (
                frontImageUrl ? (
                  <img
                    src={frontImageUrl}
                    alt={record.frontAsset?.fileName || record.originalFileName}
                    className="w-full h-full object-contain p-2"
                  />
                ) : isPsd ? (
                  <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="p-4 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-lg">
                      <FileCode className="w-12 h-12" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-slate-100">Original Photoshop Template</div>
                      <div className="text-xs text-slate-400 font-mono mt-1">{record.originalFileName}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">No visual preview for front scan</div>
                )
              ) : (
                backImageUrl ? (
                  <img
                    src={backImageUrl}
                    alt={record.backAsset?.fileName || 'Back scan'}
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <div className="text-center p-6 text-slate-500 space-y-2">
                    <AlertTriangle className="w-8 h-8 mx-auto text-amber-500/60" />
                    <div className="text-xs font-bold text-slate-300">Back Scan Not Yet Imported</div>
                    <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs">
                      This physical card only has a front scan recorded in the archive.
                    </p>
                  </div>
                )
              )}

              {/* Corner Watermark Label */}
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[9px] font-mono text-slate-300 border border-white/10 uppercase">
                {activeSide === 'FRONT' ? 'Front Side' : 'Back Side'}
              </div>
            </div>
          </div>

          {/* Missing Back Banner */}
          {!hasBack && (
            <div className="w-full mt-3 p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Back scan not yet imported — use "Link Scans" to pair with a back scan.</span>
            </div>
          )}

          {/* Missing Front Banner */}
          {!hasFront && (
            <div className="w-full mt-3 p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Front scan not yet imported.</span>
            </div>
          )}

          {/* Download Original Asset Buttons */}
          <div className="w-full mt-4 flex flex-wrap items-center justify-center gap-2">
            {frontBlob && (
              <button
                onClick={handleDownloadFront}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-sky-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-colors shadow-md"
                title="Download unaltered front binary file"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Download Front ({formatFileSize(record.frontAsset?.fileSize || record.originalFileSize)})</span>
              </button>
            )}

            {backBlob && (
              <button
                onClick={handleDownloadBack}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-purple-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-colors shadow-md"
                title="Download unaltered back binary file"
              >
                <Download className="w-3.5 h-3.5 text-purple-400" />
                <span>Download Back ({formatFileSize(record.backAsset?.fileSize || 0)})</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Archival Details & Linked Playable Cards */}
        <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-4">
            {/* Top Bar */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {record.classification.replace('_', ' ')}
                  </span>
                  {sideStatus === 'PAIRED' && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      2 SIDES
                    </span>
                  )}
                  {sideStatus === 'FRONT_ONLY' && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      FRONT ONLY
                    </span>
                  )}
                  {sideStatus === 'BACK_ONLY' && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      BACK ONLY
                    </span>
                  )}
                  {sideStatus === 'SIDE_UNKNOWN' && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      SIDE UNKNOWN
                    </span>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-100 mt-1 truncate" title={record.originalFileName}>
                  {record.originalFileName}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Archive ID</span>
                <code className="text-[10px] font-mono text-slate-300 select-all truncate block">{record.archiveId}</code>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Creation Year</span>
                {isEditing ? (
                  <input
                    type="number"
                    value={year ?? ''}
                    onChange={(e) => setYear(parseInt(e.target.value, 10) || null)}
                    className="w-20 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-slate-200 mt-0.5"
                    min="1950"
                    max="2050"
                  />
                ) : (
                  <span className="font-mono text-amber-300 font-bold">{record.originalCreationYear || 'Unknown'}</span>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Front Scan SHA-256</span>
                <span className="font-mono text-[9.5px] text-slate-400 truncate block" title={record.frontAsset?.fileChecksum || record.originalFileChecksum}>
                  {(record.frontAsset?.fileChecksum || record.originalFileChecksum).slice(0, 16)}...
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Back Scan SHA-256</span>
                {record.backAsset ? (
                  <span className="font-mono text-[9.5px] text-purple-300 truncate block" title={record.backAsset.fileChecksum}>
                    {record.backAsset.fileChecksum.slice(0, 16)}...
                  </span>
                ) : (
                  <span className="text-slate-500 italic text-[10px]">None attached</span>
                )}
              </div>
            </div>

            {/* Notes Section */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase font-bold text-slate-500">Curator Archival Notes</span>
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-[10px] text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                ) : (
                  <button
                    onClick={handleSaveMetadata}
                    className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1 font-bold"
                  >
                    <Save className="w-3 h-3" /> Save Changes
                  </button>
                )}
              </div>

              {isEditing ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter historical context, artist notes, or physical card condition..."
                  className="w-full h-16 p-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 resize-none focus:outline-hidden"
                />
              ) : (
                <p className="text-slate-300 italic text-[11px] leading-relaxed">
                  {record.userNotes || 'No curator notes recorded for this item.'}
                </p>
              )}
            </div>

            {/* Unlink Sides Action (Available if card is paired) */}
            {hasBothSides && (
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-amber-400" />
                    <span>Split Front & Back Sides</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Separates this card back into two independent single-sided archive records.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleUnlinkSides}
                  disabled={isUnlinking}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-amber-950 text-amber-300 border border-amber-500/40 text-[10px] font-bold transition-colors shrink-0 disabled:opacity-50"
                >
                  {isUnlinking ? 'Unlinking...' : 'Unlink Sides'}
                </button>
              </div>
            )}

            {/* Linked Playable Digital Variations Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>Linked Playable Digital Cards ({linkedPlayableCards.length})</span>
                </div>
                <button
                  onClick={() => onCreatePlayableVariation(record.archiveId)}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black flex items-center gap-1 transition-colors shadow-sm"
                >
                  <Plus className="w-3 h-3" /> Create Playable Variation
                </button>
              </div>

              {linkedPlayableCards.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center text-xs text-slate-500 italic">
                  No digital playable cards have been created from this physical scan yet.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {linkedPlayableCards.map((playCard) => (
                    <div
                      key={playCard.playableCardId}
                      className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-100 flex items-center gap-1.5">
                          <span>{playCard.displayName}</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-slate-900 text-amber-300 border border-slate-800 font-mono">
                            {playCard.variationName}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {playCard.department} · {playCard.cardType} · {playCard.shiftCost} Shift · {playCard.efficiency}/{playCard.stamina}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeletePlayableVariation(playCard.playableCardId)}
                        title="Delete digital card variation (preserves physical scan)"
                        className="p-1.5 rounded hover:bg-rose-900/60 text-slate-500 hover:text-rose-300 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between text-xs">
            <button
              onClick={handleDeleteArchiveRecord}
              className="text-rose-400 hover:text-rose-300 flex items-center gap-1 hover:underline text-[11px]"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove From Archive
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
