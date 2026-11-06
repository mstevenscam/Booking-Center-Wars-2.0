/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Milestone 4 — Physical Card Archive, Google Drive Integration & Import Centre
 * 
 * Production-grade collectible card archive management:
 * - Real persistent IndexedDB storage for physical scans & Photoshop templates.
 * - Comprehensive filtering by Year, Classification, Source, and Linked variations.
 * - Tabbed views: "All Archive Scans", "Playable Card Variations", "Photoshop Templates (.psd)".
 * - Direct asset downloads, detailed inspection, and export/restore backup.
 * - Zero modification of original files.
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Archive, 
  Upload, 
  HardDrive, 
  Search, 
  Filter, 
  Layers, 
  FileCode, 
  Download, 
  Calendar, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  RefreshCw,
  FolderDown,
  FolderUp,
  Database,
  ExternalLink,
  BookOpen
} from 'lucide-react';
import { 
  HistoricalCardArchive, 
  PlayableCardDefinition, 
  ArchiveClassification, 
  ArchiveSourceProvider,
  ArchiveFilterOptions,
  StorageStatus
} from '../archive/types';
import { archiveStorage } from '../archive/storage';
import { formatFileSize } from '../archive/utils';
import { ImportModal } from '../archive/ImportModal';
import { ArchiveCardDetailModal } from '../archive/ArchiveCardDetailModal';
import { CreatePlayableCardModal } from '../archive/CreatePlayableCardModal';
import { GoogleDriveSetupModal } from '../archive/GoogleDriveSetupModal';
import { CardView } from '../components/CardView';
import { GameViewCard } from '../types';

export const CardArchiveScreen: React.FC = () => {
  const [records, setRecords] = useState<HistoricalCardArchive[]>([]);
  const [playableCards, setPlayableCards] = useState<PlayableCardDefinition[]>([]);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [storageUsage, setStorageUsage] = useState({ totalBytes: 0, recordCount: 0, binaryCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({
    isPersistent: true,
    storageEngine: 'INDEXED_DB',
    error: null,
  });

  // Tab & Filter states
  const [activeTab, setActiveTab] = useState<'ALL_SCANS' | 'PLAYABLE_CARDS' | 'PSD_TEMPLATES'>('ALL_SCANS');
  const [filters, setFilters] = useState<ArchiveFilterOptions>({
    searchQuery: '',
    year: 'ALL',
    classification: 'ALL',
    sourceProvider: 'ALL',
    hasPlayableVariation: 'ALL',
    sortBy: 'YEAR_DESC',
  });

  // Modals state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [driveSetupOpen, setDriveSetupOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<HistoricalCardArchive | null>(null);
  const [createPlayableRecord, setCreatePlayableRecord] = useState<HistoricalCardArchive | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const backupInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load all archive records and playable definitions from IndexedDB
  const refreshArchive = async () => {
    setIsLoading(true);
    try {
      await archiveStorage.init();
      setStorageStatus(archiveStorage.getStorageStatus());
      const allRecords = await archiveStorage.getAllArchiveRecords();
      const allPlayable = await archiveStorage.getAllPlayableCards();
      const usage = await archiveStorage.getStorageUsage();

      setRecords(allRecords);
      setPlayableCards(allPlayable);
      setStorageUsage(usage);

      // Load thumbnails into object URLs
      const newThumbs = new Map<string, string>();
      for (const rec of allRecords) {
        if (rec.classification === 'CARD_ARTWORK') {
          const thumbBlob = await archiveStorage.getArchiveThumbnail(rec.archiveId);
          if (thumbBlob) {
            newThumbs.set(rec.archiveId, URL.createObjectURL(thumbBlob));
          } else {
            // Fallback to binary directly
            const binBlob = await archiveStorage.getArchiveBinary(rec.archiveId);
            if (binBlob && binBlob.type.startsWith('image/')) {
              newThumbs.set(rec.archiveId, URL.createObjectURL(binBlob));
            }
          }
        }
      }
      setThumbnails(newThumbs);
    } catch (err) {
      console.error('Failed to load archive from IndexedDB:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshArchive();
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      thumbnails.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [thumbnails]);

  // Seed fictional sample cards strictly for development/interface testing
  const handleSeedSampleArchives = async () => {
    if (!storageStatus.isPersistent) {
      alert(`Persistent storage unavailable:\n${storageStatus.error || 'IndexedDB is blocked in this session.'}`);
      return;
    }

    setIsLoading(true);
    showToast('Loading 5 fictional demo cards for interface testing...');

    const samples: { name: string; type: string; year: number; classif: ArchiveClassification; notes: string }[] = [
      {
        name: '2018_Sarah_Cable_Physical_Scan.png',
        type: 'image/png',
        year: 2018,
        classif: 'CARD_ARTWORK',
        notes: '[DEMO DATA] Fictional test scan for UI development.',
      },
      {
        name: '2021_Broadcast_Rig_Pencil_Mockup.jpg',
        type: 'image/jpeg',
        year: 2021,
        classif: 'CARD_ARTWORK',
        notes: '[DEMO DATA] Fictional concept sketch for UI development.',
      },
      {
        name: '2022_Dave_Maestro_Master_Template.psd',
        type: 'image/vnd.adobe.photoshop',
        year: 2022,
        classif: 'PHOTOSHOP_TEMPLATE',
        notes: '[DEMO DATA] Fictional Photoshop template for UI development.',
      },
      {
        name: '2022_Gaffer_Tape_First_Printing.jpg',
        type: 'image/jpeg',
        year: 2022,
        classif: 'CARD_ARTWORK',
        notes: '[DEMO DATA] Fictional photograph for UI development.',
      },
      {
        name: '2023_Bulb_Disaster_Original_Scan.webp',
        type: 'image/webp',
        year: 2023,
        classif: 'CARD_ARTWORK',
        notes: '[DEMO DATA] Fictional halogen scan for UI development.',
      },
    ];

    for (const sample of samples) {
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420">
        <rect width="300" height="420" fill="#0f172a" />
        <rect x="15" y="15" width="270" height="390" fill="#1e293b" stroke="#f59e0b" stroke-width="2" rx="16" />
        <text x="150" y="70" font-family="sans-serif" font-size="14" font-weight="bold" fill="#f59e0b" text-anchor="middle">BOOKING WARS</text>
        <text x="150" y="95" font-family="sans-serif" font-size="10" fill="#f87171" font-weight="bold" text-anchor="middle">[DEMO SAMPLE DATA]</text>
        <rect x="35" y="120" width="230" height="180" fill="#0284c7" opacity="0.3" rx="8" />
        <text x="150" y="215" font-family="monospace" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">${sample.year} DEMO</text>
        <text x="150" y="340" font-family="sans-serif" font-size="11" fill="#e2e8f0" text-anchor="middle">${sample.name.slice(0, 26)}</text>
        <text x="150" y="365" font-family="sans-serif" font-size="9" fill="#94a3b8" text-anchor="middle">Fictional Development Sample</text>
      </svg>`;

      const blob = new Blob([svgContent], { type: sample.type });
      const checksum = `seed-${sample.year}-${sample.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const archiveId = `arc-${sample.year}-${sample.name.toLowerCase().slice(0, 16)}-${checksum.slice(0, 16)}`;

      await archiveStorage.saveArchiveRecord({
        archiveId,
        originalFileName: sample.name,
        originalFileType: sample.type,
        originalFileSize: blob.size || 14820,
        originalFileChecksum: checksum,
        originalCreationYear: sample.year,
        sourceProvider: 'LOCAL_UPLOAD',
        sourceFolderPath: 'Demo Development Data',
        sourceDriveFileId: null,
        importedAt: new Date().toISOString(),
        classification: sample.classif,
        userNotes: sample.notes,
        isDemoData: true,
        derivedThumbnailId: null,
      }, blob, null);
    }

    await refreshArchive();
  };

  // Export full archive backup JSON bundle
  const handleExportBackup = async () => {
    try {
      showToast('Exporting archive backup...');
      const bundle = await archiveStorage.exportArchiveBundle();
      const json = JSON.stringify(bundle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `booking-wars-archive-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Archive backup exported successfully!');
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    }
  };

  // Restore archive backup JSON bundle
  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast('Restoring archive backup...');
      const text = await file.text();
      const bundle = JSON.parse(text);
      if (!bundle.records || !Array.isArray(bundle.records)) {
        throw new Error('Invalid archive backup format.');
      }

      const result = await archiveStorage.importArchiveBundle(bundle);
      await refreshArchive();
      showToast(`Restored ${result.importedCount} items (${result.skippedDuplicates} duplicate records skipped).`);
    } catch (err: any) {
      alert(`Restore failed: ${err.message}`);
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  // Available unique years in records
  const availableYears = Array.from(
    new Set(records.map(r => r.originalCreationYear).filter((y): y is number => Boolean(y)))
  ).sort((a, b) => b - a);

  // Filtered Archive Records
  const filteredRecords = records.filter((rec) => {
    // Tab filter
    if (activeTab === 'PSD_TEMPLATES' && rec.classification !== 'PHOTOSHOP_TEMPLATE') return false;
    if (activeTab === 'ALL_SCANS' && rec.classification === 'PHOTOSHOP_TEMPLATE') return false;

    // Search query
    if (filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase();
      const match = 
        rec.originalFileName.toLowerCase().includes(q) ||
        (rec.userNotes && rec.userNotes.toLowerCase().includes(q)) ||
        rec.archiveId.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Year filter
    if (filters.year !== 'ALL' && rec.originalCreationYear !== filters.year) return false;

    // Classification filter
    if (filters.classification !== 'ALL' && rec.classification !== filters.classification) return false;

    // Source filter
    if (filters.sourceProvider !== 'ALL' && rec.sourceProvider !== filters.sourceProvider) return false;

    // Has playable variations filter
    if (filters.hasPlayableVariation !== 'ALL') {
      const hasVariation = playableCards.some(p => p.archiveId === rec.archiveId);
      if (filters.hasPlayableVariation && !hasVariation) return false;
      if (!filters.hasPlayableVariation && hasVariation) return false;
    }

    return true;
  }).sort((a, b) => {
    switch (filters.sortBy) {
      case 'NAME': return a.originalFileName.localeCompare(b.originalFileName);
      case 'YEAR_ASC': return (a.originalCreationYear || 0) - (b.originalCreationYear || 0);
      case 'YEAR_DESC': return (b.originalCreationYear || 0) - (a.originalCreationYear || 0);
      case 'SIZE_DESC': return b.originalFileSize - a.originalFileSize;
      case 'IMPORT_DATE_DESC':
      default:
        return new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime();
    }
  });

  // Filtered Playable Cards (Tab 2)
  const filteredPlayableCards = playableCards.filter((card) => {
    if (filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase();
      return card.displayName.toLowerCase().includes(q) || card.variationName.toLowerCase().includes(q);
    }
    return true;
  });

  // Statistics derived directly from real stored records
  const totalScans = records.filter(r => r.classification === 'CARD_ARTWORK').length;
  const totalPsds = records.filter(r => r.classification === 'PHOTOSHOP_TEMPLATE').length;
  const totalPlayable = playableCards.length;

  return (
    <div className="relative w-full min-h-[calc(100vh-53px)] bg-radial from-slate-900 via-slate-950 to-[#070a0f] p-4 sm:p-8 select-none">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs rounded-full shadow-2xl border border-amber-300 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                <Archive className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-100 flex items-center gap-2">
                  <span>Physical Card Archive & Import Centre</span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Permanent preservation of physical card scans (2018–2023) and Photoshop templates with stable IDs.
                </p>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setImportModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-500/20"
            >
              <Upload className="w-4 h-4" />
              <span>Import Cards</span>
            </button>

            <button
              onClick={() => setDriveSetupOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-sky-400 hover:text-sky-300 font-bold text-xs border border-sky-500/40 flex items-center gap-1.5 transition-colors"
            >
              <HardDrive className="w-4 h-4" />
              <span>Google Drive</span>
            </button>

            {/* Backup Export / Restore */}
            <button
              onClick={handleExportBackup}
              title="Download JSON backup archive"
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            >
              <FolderDown className="w-4 h-4" />
            </button>

            <button
              onClick={() => backupInputRef.current?.click()}
              title="Restore from JSON backup archive"
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            >
              <FolderUp className="w-4 h-4" />
            </button>
            <input
              ref={backupInputRef}
              type="file"
              accept=".json"
              onChange={handleRestoreBackup}
              className="hidden"
            />
          </div>
        </div>

        {/* Persistent Storage Health Banner */}
        {!storageStatus.isPersistent && (
          <div className="bg-rose-950/80 border border-rose-500/40 rounded-2xl p-4 flex items-center gap-3 text-rose-200 text-xs shadow-lg">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <div className="font-bold">Persistent Browser Storage (IndexedDB) Unavailable</div>
              <div className="text-[11px] text-rose-300 mt-0.5">
                {storageStatus.error || 'IndexedDB is blocked or disabled in this browser session (e.g. private window or permissions).'} Card scans cannot be saved permanently until browser storage permissions are permitted.
              </div>
            </div>
          </div>
        )}

        {/* Live Storage & Collection Telemetry Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Historical Scans</div>
              <div className="text-xl font-black text-slate-100 font-mono">{totalScans}</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">PSD Templates</div>
              <div className="text-xl font-black text-sky-400 font-mono">{totalPsds}</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Playable Variations</div>
              <div className="text-xl font-black text-emerald-400 font-mono">{totalPlayable}</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">IndexedDB Footprint</div>
              <div className="text-xl font-black text-purple-400 font-mono">{formatFileSize(storageUsage.totalBytes)}</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('ALL_SCANS')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              activeTab === 'ALL_SCANS'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>Historical Card Scans ({totalScans})</span>
          </button>

          <button
            onClick={() => setActiveTab('PLAYABLE_CARDS')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              activeTab === 'PLAYABLE_CARDS'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Digital Playable Variations ({totalPlayable})</span>
          </button>

          <button
            onClick={() => setActiveTab('PSD_TEMPLATES')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              activeTab === 'PSD_TEMPLATES'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Photoshop Templates ({totalPsds})</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 text-xs">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search archive by filename, notes, or stable ID..."
              value={filters.searchQuery}
              onChange={(e) => setFilters(f => ({ ...f, searchQuery: e.target.value }))}
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-amber-400 text-xs"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Year */}
            <select
              value={filters.year}
              onChange={(e) => setFilters(f => ({ ...f, year: e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10) }))}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-xs"
            >
              <option value="ALL">All Years</option>
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            {/* Source */}
            <select
              value={filters.sourceProvider}
              onChange={(e) => setFilters(f => ({ ...f, sourceProvider: e.target.value as any }))}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-xs"
            >
              <option value="ALL">All Sources</option>
              <option value="LOCAL_UPLOAD">Local Upload</option>
              <option value="GOOGLE_DRIVE">Google Drive</option>
            </select>

            {/* Sort */}
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters(f => ({ ...f, sortBy: e.target.value as any }))}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-xs"
            >
              <option value="YEAR_DESC">Year (Newest First)</option>
              <option value="YEAR_ASC">Year (Oldest First)</option>
              <option value="NAME">Filename (A-Z)</option>
              <option value="IMPORT_DATE_DESC">Recently Imported</option>
              <option value="SIZE_DESC">Largest File Size</option>
            </select>
          </div>
        </div>

        {/* Empty Archive State */}
        {records.length === 0 && !isLoading && (
          <div className="p-12 text-center rounded-3xl bg-slate-950/40 border border-dashed border-slate-800 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
              <Archive className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-200">Your Physical Card Archive is Empty</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                Import your original scanned physical cards from your local computer (individual files or year-organized folders) or Google Drive.
                Original files and Photoshop templates are cryptographically verified and stored unaltered in your local IndexedDB database.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setImportModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors shadow-lg flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                <span>Import Physical Cards</span>
              </button>
              <button
                onClick={() => setDriveSetupOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 text-sky-400 border border-sky-500/30 font-bold text-xs transition-colors flex items-center gap-1.5"
              >
                <HardDrive className="w-4 h-4" />
                <span>Google Drive Guide</span>
              </button>
            </div>

            {/* Clearly separated, explicit demo data tool */}
            <div className="pt-4 border-t border-slate-900 mt-4">
              <span className="text-[10px] text-slate-500 block mb-2 font-mono uppercase tracking-wider">Development & UI Preview Only</span>
              <button
                onClick={handleSeedSampleArchives}
                className="px-3.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-amber-300 border border-slate-800 text-[11px] font-mono transition-colors inline-flex items-center gap-1.5"
              >
                <span>🧪 Load 5 Fictional Demo Cards (For UI Evaluation Only)</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 1 & TAB 3: PHYSICAL SCANS & PSD TEMPLATES GRID */}
        {(activeTab === 'ALL_SCANS' || activeTab === 'PSD_TEMPLATES') && records.length > 0 && (
          <div>
            {filteredRecords.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs italic bg-slate-950/40 rounded-2xl border border-slate-800">
                No items match your filter criteria.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredRecords.map((rec) => {
                  const thumbUrl = thumbnails.get(rec.archiveId);
                  const isPsd = rec.classification === 'PHOTOSHOP_TEMPLATE';
                  const variationsCount = playableCards.filter(p => p.archiveId === rec.archiveId).length;

                  return (
                    <div
                      key={rec.archiveId}
                      onClick={() => setSelectedRecord(rec)}
                      className="group relative rounded-2xl bg-slate-950/80 border-2 border-slate-800 hover:border-amber-400 hover:shadow-2xl transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between"
                    >
                      {/* Top Badges Bar */}
                      <div className="p-2 flex items-center justify-between text-[8px] font-bold z-10">
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.2 rounded bg-slate-900/90 text-amber-300 border border-slate-800 font-mono">
                            {rec.originalCreationYear || 'UNDATED'}
                          </span>
                          {rec.isDemoData && (
                            <span className="px-1 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-500/40 text-[7px] uppercase font-black">
                              DEMO
                            </span>
                          )}
                        </div>
                        {variationsCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono">
                            {variationsCount} {variationsCount === 1 ? 'Variation' : 'Variations'}
                          </span>
                        )}
                      </div>

                      {/* Card Scan Viewport */}
                      <div className="relative w-full h-44 sm:h-52 bg-slate-900 overflow-hidden flex items-center justify-center p-2">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={rec.originalFileName}
                            className="w-full h-full object-contain filter group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : isPsd ? (
                          <div className="flex flex-col items-center justify-center text-sky-400 space-y-1">
                            <FileCode className="w-10 h-10" />
                            <span className="text-[9px] font-black uppercase tracking-wider">PSD TEMPLATE</span>
                          </div>
                        ) : (
                          <Archive className="w-8 h-8 text-slate-600" />
                        )}
                      </div>

                      {/* Bottom Info Bar */}
                      <div className="p-2.5 bg-slate-950 border-t border-slate-800">
                        <div className="text-[11px] font-bold text-slate-100 truncate" title={rec.originalFileName}>
                          {rec.originalFileName}
                        </div>
                        <div className="text-[9px] text-slate-500 flex items-center justify-between mt-1 font-mono">
                          <span>{formatFileSize(rec.originalFileSize)}</span>
                          <span className="text-amber-400 uppercase">{rec.sourceProvider === 'GOOGLE_DRIVE' ? 'Drive' : 'Upload'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DIGITAL PLAYABLE VARIATIONS */}
        {activeTab === 'PLAYABLE_CARDS' && (
          <div>
            {filteredPlayableCards.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs italic bg-slate-950/40 rounded-2xl border border-slate-800 space-y-3">
                <p>No playable digital cards have been spawned from historical scans yet.</p>
                <p className="text-[11px] text-slate-400">
                  Select any historical scan in the "Historical Card Scans" tab and click "Create Playable Variation".
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredPlayableCards.map((playCard) => {
                  const sourceScan = records.find(r => r.archiveId === playCard.archiveId);
                  const thumbUrl = playCard.archiveId ? thumbnails.get(playCard.archiveId) : undefined;

                  const cardViewData: GameViewCard = {
                    id: playCard.playableCardId,
                    templateId: playCard.playableCardId,
                    name: playCard.displayName,
                    cardType: playCard.cardType,
                    rarity: playCard.rarity,
                    department: playCard.department,
                    shiftCost: playCard.shiftCost,
                    efficiency: playCard.efficiency,
                    stamina: playCard.stamina,
                    maxStamina: playCard.maxStamina,
                    influence: playCard.influence,
                    keywords: playCard.keywords,
                    abilityName: playCard.abilityName || undefined,
                    abilityDesc: playCard.abilityDesc || undefined,
                    flavor: playCard.flavor,
                    avatarGradient: 'from-amber-600 to-amber-900',
                    iconName: 'Wrench',
                    imageUrl: thumbUrl,
                  };

                  return (
                    <div key={playCard.playableCardId} className="flex flex-col items-center group">
                      <CardView
                        card={cardViewData}
                        size="standard"
                        onClick={() => sourceScan && setSelectedRecord(sourceScan)}
                      />
                      <div className="text-[10px] text-slate-400 text-center mt-1.5">
                        <span className="font-bold text-amber-300">{playCard.variationName}</span>
                        {sourceScan && (
                          <div className="text-[8.5px] text-slate-500 truncate max-w-[140px]" title={sourceScan.originalFileName}>
                            From: {sourceScan.originalFileName}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <ImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportComplete={refreshArchive}
        onCreatePlayableFromId={(archiveId) => {
          const rec = records.find(r => r.archiveId === archiveId);
          if (rec) setCreatePlayableRecord(rec);
        }}
      />

      <ArchiveCardDetailModal
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
        onRecordUpdated={refreshArchive}
        onRecordDeleted={refreshArchive}
        onCreatePlayableVariation={(archiveId) => {
          setSelectedRecord(null);
          const rec = records.find(r => r.archiveId === archiveId);
          if (rec) setCreatePlayableRecord(rec);
        }}
      />

      <CreatePlayableCardModal
        archiveRecord={createPlayableRecord}
        isOpen={Boolean(createPlayableRecord)}
        onClose={() => setCreatePlayableRecord(null)}
        onCardCreated={() => {
          refreshArchive();
          showToast('Playable card variation created and linked to archive!');
        }}
      />

      <GoogleDriveSetupModal
        isOpen={driveSetupOpen}
        onClose={() => setDriveSetupOpen(false)}
      />
    </div>
  );
};
