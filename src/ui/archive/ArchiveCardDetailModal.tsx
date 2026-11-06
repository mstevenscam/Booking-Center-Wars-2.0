/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Historical Archive Card Detail Modal
 * 
 * Features:
 * - Full-resolution view of original physical card scan or Photoshop template (.psd).
 * - Metadata inspector: SHA-256 checksum, file size, creation year, source provider.
 * - Download original unaltered asset directly.
 * - Linked playable digital card variations manager.
 * - Editable archival notes and year corrections.
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
  ExternalLink
} from 'lucide-react';
import { HistoricalCardArchive, PlayableCardDefinition } from './types';
import { archiveStorage } from './storage';
import { formatFileSize } from './utils';
import { CardView } from '../components/CardView';

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
  const [binaryBlob, setBinaryBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [linkedPlayableCards, setLinkedPlayableCards] = useState<PlayableCardDefinition[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!record) return;

    setNotes(record.userNotes || '');
    setYear(record.originalCreationYear);
    setIsEditing(false);

    let activeUrl: string | null = null;

    // Load binary blob and linked playable variations
    const loadData = async () => {
      const blob = await archiveStorage.getArchiveBinary(record.archiveId);
      setBinaryBlob(blob);

      if (blob && record.classification === 'CARD_ARTWORK') {
        activeUrl = URL.createObjectURL(blob);
        setImageUrl(activeUrl);
      } else {
        setImageUrl(null);
      }

      const playable = await archiveStorage.getPlayableCardsForArchive(record.archiveId);
      setLinkedPlayableCards(playable);
    };

    loadData();

    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [record]);

  if (!record) return null;

  const isPsd = record.classification === 'PHOTOSHOP_TEMPLATE';

  // Download exact unaltered binary
  const handleDownloadOriginal = () => {
    if (!binaryBlob) return;
    const url = URL.createObjectURL(binaryBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = record.originalFileName;
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

  // Delete playable card variation (NEVER deletes original archive record)
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

      <div className="relative z-10 w-full max-w-4xl bg-slate-900 border-2 border-slate-700/80 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[92vh]">
        {/* Left: Original Asset Viewport */}
        <div className="bg-slate-950 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-800 md:w-1/2 shrink-0">
          <div className="relative w-full max-w-xs h-[380px] sm:h-[440px] rounded-2xl border-2 border-slate-800 overflow-hidden flex items-center justify-center bg-slate-900 shadow-xl group">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={record.originalFileName}
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
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs">
                  Master layered PSD asset. Stored in pure unaltered binary format for archival preservation.
                </p>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">No visual preview available</div>
            )}
          </div>

          {/* Download Original Asset Button */}
          <button
            onClick={handleDownloadOriginal}
            className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-2 transition-colors shadow-md"
            title="Download unaltered binary file"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Download Original File ({formatFileSize(record.originalFileSize)})</span>
          </button>
        </div>

        {/* Right: Archival Details & Linked Playable Cards */}
        <div className="p-6 flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-4">
            {/* Top Bar */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {record.classification.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {record.sourceProvider === 'GOOGLE_DRIVE' ? 'Google Drive' : 'Local Computer'}
                  </span>
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
                <code className="text-[10.5px] font-mono text-slate-300 select-all">{record.archiveId}</code>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Creation Year</span>
                {isEditing ? (
                  <input
                    type="number"
                    value={year ?? ''}
                    onChange={(e) => setYear(parseInt(e.target.value, 10) || null)}
                    className="w-20 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-slate-200 mt-0.5"
                    min="2000"
                    max="2030"
                  />
                ) : (
                  <span className="font-mono text-amber-300 font-bold">{record.originalCreationYear || 'Unknown'}</span>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">File Size & Format</span>
                <span className="font-mono text-slate-300">{formatFileSize(record.originalFileSize)} · {record.originalFileType}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">SHA-256 Checksum</span>
                <span className="font-mono text-[9.5px] text-slate-400 truncate block" title={record.originalFileChecksum}>
                  {record.originalFileChecksum}
                </span>
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
                  placeholder="Enter historical context, who originally drew or designed the card..."
                  className="w-full h-16 p-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 resize-none focus:outline-hidden"
                />
              ) : (
                <p className="text-slate-300 italic text-[11px] leading-relaxed">
                  {record.userNotes || 'No curator notes recorded for this item.'}
                </p>
              )}
            </div>

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
