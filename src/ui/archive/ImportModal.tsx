/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * 5-Step Physical Card Import Modal
 * 
 * Implements:
 * - STEP 1: Choose Source (Google Drive or Local Computer Upload)
 * - STEP 2: Select Files (Multi-file select, folder paths, drag-and-drop)
 * - STEP 3: Review Batch (Thumbnails, SHA-256 checksums, duplicate detection, classifications)
 * - STEP 4: Import Execution (Unaltered binary storage in IndexedDB, real progress)
 * - STEP 5: Complete & Catalogue (Summary, link to playable card creation)
 */

import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  HardDrive, 
  FileCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  Sparkles, 
  ArrowRight, 
  ArrowLeft,
  RefreshCw,
  Folder,
  Layers,
  FileText,
  FileCode,
  ShieldCheck,
  Check
} from 'lucide-react';
import { ImportBatchItem, ArchiveClassification, ArchiveSourceProvider } from './types';
import { calculateFileChecksum, classifyFile, extractYearFromFilename, generateStableArchiveId, generateThumbnail, formatFileSize } from './utils';
import { archiveStorage } from './storage';
import { googleDriveService } from './googleDriveService';
import { aiMetadataService } from './aiMetadataService';
import { GoogleDriveSetupModal } from './GoogleDriveSetupModal';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  onCreatePlayableFromId?: (archiveId: string) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  onCreatePlayableFromId
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [sourceProvider, setSourceProvider] = useState<ArchiveSourceProvider>('LOCAL_UPLOAD');
  const [batchItems, setBatchItems] = useState<ImportBatchItem[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [completedItems, setCompletedItems] = useState<{ id: string; name: string; archiveId: string }[]>([]);
  const [driveSetupOpen, setDriveSetupOpen] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [aiAnalyzingId, setAiAnalyzingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const driveStatus = googleDriveService.getConfigStatus();

  if (!isOpen) return null;

  // Reset modal state
  const handleReset = () => {
    setStep(1);
    setBatchItems([]);
    setIsProcessingFiles(false);
    setIsImporting(false);
    setImportProgress(0);
    setCompletedItems([]);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Process selected native Files (from drag-drop or file picker)
  const processFiles = async (files: FileList | File[], folderPath?: string, provider: ArchiveSourceProvider = 'LOCAL_UPLOAD') => {
    setIsProcessingFiles(true);
    const newItems: ImportBatchItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const checksum = await calculateFileChecksum(file);
      const classification = classifyFile(file.name, file.type);
      const creationYear = extractYearFromFilename(file.name, folderPath);
      const dupCheck = await archiveStorage.checkDuplicate(checksum, null);

      // Create object URL for preview (only for images, revoked upon cleanup)
      let previewUrl: string | null = null;
      if (classification === 'CARD_ARTWORK') {
        previewUrl = URL.createObjectURL(file);
      }

      newItems.push({
        id: `batch-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        checksum,
        creationYear,
        sourceFolderPath: folderPath || null,
        sourceDriveFileId: null,
        sourceProvider: provider,
        classification,
        previewUrl,
        isDuplicate: dupCheck.isDuplicate,
        duplicateReason: dupCheck.reason,
        matchedArchiveId: dupCheck.matchedRecord?.archiveId,
        status: 'PENDING',
      });
    }

    setBatchItems(prev => [...prev, ...newItems]);
    setIsProcessingFiles(false);
    setStep(3); // Advance to Review Batch
  };

  // Drag and Drop handlers
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSourceProvider('LOCAL_UPLOAD');
      await processFiles(e.dataTransfer.files, undefined, 'LOCAL_UPLOAD');
    }
  };

  // Google Drive connect & pick
  const handleConnectGoogleDrive = async () => {
    if (!driveStatus.isConfigured) {
      setDriveSetupOpen(true);
      return;
    }

    setDriveConnecting(true);
    try {
      const pickedFiles = await googleDriveService.openPicker();
      if (pickedFiles.length === 0) {
        setDriveConnecting(false);
        return;
      }

      setIsProcessingFiles(true);
      const newItems: ImportBatchItem[] = [];

      for (let i = 0; i < pickedFiles.length; i++) {
        const driveItem = pickedFiles[i];
        // Download binary via alt=media
        const blob = await googleDriveService.downloadFileBinary(driveItem.id);
        const checksum = await calculateFileChecksum(blob);
        const classification = classifyFile(driveItem.name, driveItem.mimeType);
        const creationYear = extractYearFromFilename(driveItem.name, driveItem.folderPath);
        const dupCheck = await archiveStorage.checkDuplicate(checksum, driveItem.id);

        let previewUrl: string | null = null;
        if (classification === 'CARD_ARTWORK') {
          previewUrl = URL.createObjectURL(blob);
        }

        newItems.push({
          id: `drive-${Date.now()}-${i}`,
          file: blob,
          name: driveItem.name,
          type: driveItem.mimeType,
          size: driveItem.size || blob.size,
          checksum,
          creationYear,
          sourceFolderPath: driveItem.folderPath || 'Google Drive',
          sourceDriveFileId: driveItem.id,
          sourceProvider: 'GOOGLE_DRIVE',
          classification,
          previewUrl,
          isDuplicate: dupCheck.isDuplicate,
          duplicateReason: dupCheck.reason,
          matchedArchiveId: dupCheck.matchedRecord?.archiveId,
          status: 'PENDING',
        });
      }

      setSourceProvider('GOOGLE_DRIVE');
      setBatchItems(prev => [...prev, ...newItems]);
      setIsProcessingFiles(false);
      setStep(3);
    } catch (err: any) {
      alert(`Google Drive connection error: ${err.message}`);
    } finally {
      setDriveConnecting(false);
    }
  };

  // Remove item from batch
  const handleRemoveItem = (id: string) => {
    setBatchItems(prev => {
      const target = prev.find(item => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter(item => item.id !== id);
    });
  };

  // Update classification for an item
  const handleUpdateClassification = (id: string, classification: ArchiveClassification) => {
    setBatchItems(prev => prev.map(item => item.id === id ? { ...item, classification } : item));
  };

  // Update year for an item
  const handleUpdateYear = (id: string, yearStr: string) => {
    const year = parseInt(yearStr, 10);
    setBatchItems(prev => prev.map(item => item.id === id ? { 
      ...item, 
      creationYear: !isNaN(year) && year >= 2000 && year <= 2030 ? year : null 
    } : item));
  };

  // Optional AI scan helper
  const handleRunAiAnalysis = async (item: ImportBatchItem) => {
    if (item.classification !== 'CARD_ARTWORK') return;
    setAiAnalyzingId(item.id);

    try {
      const suggestion = await aiMetadataService.analyzeCardScan(item.file, item.name);
      if (suggestion) {
        setBatchItems(prev => prev.map(i => {
          if (i.id === item.id) {
            return {
              ...i,
              creationYear: suggestion.detectedYear ?? i.creationYear,
            };
          }
          return i;
        }));
      }
    } finally {
      setAiAnalyzingId(null);
    }
  };

  // Execute Batch Import into IndexedDB
  const handleExecuteImport = async () => {
    setIsImporting(true);
    setStep(4);
    setImportProgress(0);

    const successful: { id: string; name: string; archiveId: string }[] = [];
    const validItems = batchItems.filter(item => !item.isDuplicate);

    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      try {
        // Generate stable archive ID
        const archiveId = generateStableArchiveId(item.checksum, item.name, item.creationYear);
        
        // Generate derived thumbnail (null for PSD)
        const thumbBlob = item.classification === 'CARD_ARTWORK' 
          ? await generateThumbnail(item.file) 
          : null;

        // Save original file bytes & record permanently
        await archiveStorage.saveArchiveRecord({
          archiveId,
          originalFileName: item.name,
          originalFileType: item.type,
          originalFileSize: item.size,
          originalFileChecksum: item.checksum,
          originalCreationYear: item.creationYear,
          sourceProvider: item.sourceProvider,
          sourceFolderPath: item.sourceFolderPath,
          sourceDriveFileId: item.sourceDriveFileId,
          importedAt: new Date().toISOString(),
          classification: item.classification,
          userNotes: null,
          derivedThumbnailId: thumbBlob ? `thumb-${archiveId}` : null,
        }, item.file, thumbBlob);

        successful.push({ id: item.id, name: item.name, archiveId });
      } catch (err: any) {
        console.error(`Failed to import ${item.name}:`, err);
      }

      setImportProgress(Math.round(((i + 1) / validItems.length) * 100));
    }

    setCompletedItems(successful);
    setIsImporting(false);
    setStep(5);
    onImportComplete();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
        <div className="absolute inset-0" onClick={handleClose} />

        <div className="relative z-10 w-full max-w-4xl bg-slate-900 border-2 border-slate-700/80 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header & Step Indicator */}
          <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  STEP {step} OF 5
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {step === 1 && 'Select Import Source'}
                  {step === 2 && 'Choose Files'}
                  {step === 3 && 'Review Batch Metadata'}
                  {step === 4 && 'Saving to Archive...'}
                  {step === 5 && 'Import Complete'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-100 mt-1">
                {step === 1 && 'Card Archive & Import Centre'}
                {step === 3 && `Review Batch (${batchItems.length} files selected)`}
                {step === 4 && 'Archiving Original Scans...'}
                {step === 5 && 'Physical Scans Successfully Archived!'}
              </h2>
            </div>
            <button
              onClick={handleClose}
              disabled={isImporting}
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* STEP 1: CHOOSE SOURCE */}
          {step === 1 && (
            <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
              <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                Import physical card scans (JPG, PNG, WEBP, TIFF) and original Photoshop templates (PSD). 
                Files are cryptographically verified with SHA-256 and stored in their unaltered original state.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Method A: Local Computer */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="p-6 rounded-2xl bg-slate-950/70 border-2 border-slate-800 hover:border-amber-400 hover:bg-slate-950 transition-all cursor-pointer group flex flex-col justify-between min-h-[220px]"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 group-hover:scale-110 transition-transform">
                      <Upload className="w-7 h-7" />
                    </div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                      Drag & Drop
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-black text-slate-100 group-hover:text-amber-300 transition-colors">
                      Import From Computer
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Select individual or batch files from your local storage. Drag files anywhere here to begin.
                    </p>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                      <span>Supports: JPG · PNG · WEBP · TIFF · PSD</span>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.psd"
                    onChange={(e) => e.target.files && processFiles(e.target.files, undefined, 'LOCAL_UPLOAD')}
                    className="hidden"
                  />
                </div>

                {/* Method B: Google Drive */}
                <div 
                  onClick={handleConnectGoogleDrive}
                  className="p-6 rounded-2xl bg-slate-950/70 border-2 border-slate-800 hover:border-sky-400 hover:bg-slate-950 transition-all cursor-pointer group flex flex-col justify-between min-h-[220px]"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30 group-hover:scale-110 transition-transform">
                      <HardDrive className="w-7 h-7" />
                    </div>
                    <div className="flex items-center gap-1">
                      {driveStatus.isConfigured ? (
                        <span className="text-[10px] uppercase font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Ready
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDriveSetupOpen(true);
                          }}
                          className="text-[10px] uppercase font-bold text-amber-400 hover:text-amber-300 px-2 py-0.5 rounded bg-amber-950/50 border border-amber-500/40 hover:underline"
                        >
                          Setup Guide
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-black text-slate-100 group-hover:text-sky-300 transition-colors flex items-center gap-2">
                      <span>Connect Google Drive</span>
                      {driveConnecting && <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Connect your Google Drive card repository. Browse year folders (2018–2023) or select scans with Google Picker.
                    </p>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                      <span>Least-Privilege Scopes · File-Level Access</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Safety notice */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3 text-xs text-slate-400">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <p>
                  <strong>Data Safety Contract:</strong> Files are stored locally in your browser’s IndexedDB. Original scans and Photoshop templates are never modified, re-compressed, or altered.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW BATCH */}
          {step === 3 && (
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                <span>Review filenames, creation years, and classifications before committing to the archive.</span>
                <span className="font-mono text-amber-400 font-bold">{batchItems.length} total items</span>
              </div>

              {/* Items Table */}
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {batchItems.map((item) => {
                  const isImage = item.classification === 'CARD_ARTWORK';
                  const isPsd = item.classification === 'PHOTOSHOP_TEMPLATE';

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        item.isDuplicate 
                          ? 'bg-amber-950/20 border-amber-500/40 text-amber-200' 
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Left: Thumbnail & File Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Thumbnail / Asset Preview */}
                        <div className="w-12 h-16 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                          {item.previewUrl ? (
                            <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                          ) : isPsd ? (
                            <div className="flex flex-col items-center justify-center text-sky-400">
                              <FileCode className="w-5 h-5" />
                              <span className="text-[7.5px] font-black uppercase mt-0.5">PSD</span>
                            </div>
                          ) : (
                            <FileText className="w-5 h-5 text-slate-500" />
                          )}
                        </div>

                        {/* Name & Metadata */}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-100 truncate" title={item.name}>
                            {item.name}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                            <span>{formatFileSize(item.size)}</span>
                            <span>·</span>
                            <span>SHA: {item.checksum.slice(0, 8)}...</span>
                            {item.sourceFolderPath && (
                              <>
                                <span>·</span>
                                <span className="truncate max-w-[140px]" title={item.sourceFolderPath}>{item.sourceFolderPath}</span>
                              </>
                            )}
                          </div>

                          {/* Duplicate Warning */}
                          {item.isDuplicate && (
                            <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>{item.duplicateReason}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Year, Classification & Remove */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Year input */}
                        <div className="flex flex-col">
                          <label className="text-[8px] font-mono uppercase text-slate-500">Year</label>
                          <input
                            type="number"
                            placeholder="YYYY"
                            value={item.creationYear ?? ''}
                            onChange={(e) => handleUpdateYear(item.id, e.target.value)}
                            className="w-16 px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-center font-mono text-slate-200"
                            min="2000"
                            max="2030"
                          />
                        </div>

                        {/* Classification Dropdown */}
                        <div className="flex flex-col">
                          <label className="text-[8px] font-mono uppercase text-slate-500">Classification</label>
                          <select
                            value={item.classification}
                            onChange={(e) => handleUpdateClassification(item.id, e.target.value as ArchiveClassification)}
                            className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-[11px] text-slate-200"
                          >
                            <option value="CARD_ARTWORK">Card Artwork (Scan)</option>
                            <option value="PHOTOSHOP_TEMPLATE">PSD Template</option>
                            <option value="OTHER_ASSET">Other Asset</option>
                          </select>
                        </div>

                        {/* Optional AI Metadata Extraction button */}
                        {isImage && (
                          <button
                            type="button"
                            onClick={() => handleRunAiAnalysis(item)}
                            disabled={aiAnalyzingId === item.id}
                            title="Analyze scan with AI to suggest title and year"
                            className="mt-3 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition-colors"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${aiAnalyzingId === item.id ? 'animate-spin' : ''}`} />
                          </button>
                        )}

                        {/* Remove Action */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          title="Remove from batch"
                          className="mt-3 p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: IMPORT PROGRESS */}
          {step === 4 && (
            <div className="p-10 flex flex-col items-center justify-center space-y-6 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center animate-spin">
                <RefreshCw className="w-8 h-8 text-amber-400" />
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-100">Archiving Physical Cards...</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Writing unaltered original scans and generating secure derived thumbnails in IndexedDB.
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-md bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-amber-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <span className="text-xs font-mono text-amber-400 font-bold">{importProgress}% Complete</span>
            </div>
          )}

          {/* STEP 5: IMPORT COMPLETE */}
          {step === 5 && (
            <div className="p-8 flex flex-col items-center justify-center space-y-6 text-center overflow-y-auto">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-2xl font-black text-slate-100">Physical Cards Saved to Archive</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {completedItems.length} card assets are now safely preserved in your persistent local archive with stable IDs.
                </p>
              </div>

              {/* List of imported items */}
              <div className="w-full max-w-md bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2 max-h-48 overflow-y-auto text-left">
                {completedItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="font-bold text-slate-200 truncate flex-1">{item.name}</span>
                    {onCreatePlayableFromId && (
                      <button
                        onClick={() => {
                          handleClose();
                          onCreatePlayableFromId(item.archiveId);
                        }}
                        className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-300 text-[10px] font-bold border border-amber-500/40 transition-colors shrink-0"
                      >
                        Create Playable Card
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors shadow-lg"
                >
                  View Archive Collection
                </button>
              </div>
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
            {step === 3 && (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700"
                  >
                    Add More Files
                  </button>

                  <button
                    onClick={handleExecuteImport}
                    disabled={batchItems.length === 0}
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span>Import {batchItems.filter(i => !i.isDuplicate).length} Cards</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {step === 1 && (
              <button
                onClick={handleClose}
                className="ml-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Google Drive Setup Guide Modal */}
      <GoogleDriveSetupModal
        isOpen={driveSetupOpen}
        onClose={() => setDriveSetupOpen(false)}
      />
    </>
  );
};
