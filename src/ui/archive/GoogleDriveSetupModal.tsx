/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Google Drive Connection & Setup Guide Modal
 */

import React from 'react';
import { X, ExternalLink, CheckCircle2, AlertCircle, Key, ShieldCheck, Database, HardDrive } from 'lucide-react';
import { googleDriveService } from './googleDriveService';

interface GoogleDriveSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTestSimulatedDrive?: () => void;
}

export const GoogleDriveSetupModal: React.FC<GoogleDriveSetupModalProps> = ({
  isOpen,
  onClose,
  onTestSimulatedDrive
}) => {
  if (!isOpen) return null;

  const configStatus = googleDriveService.getConfigStatus();
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://...';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl bg-slate-900 border-2 border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
                <span>Google Drive Integration Setup</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Connect your Google Drive card scan repository with least-privilege file permissions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {/* Status Box */}
          <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
            configStatus.isConfigured 
              ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300' 
              : 'bg-amber-950/20 border-amber-500/40 text-amber-300'
          }`}>
            {configStatus.isConfigured ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-bold text-sm">
                {configStatus.isConfigured 
                  ? 'Google Drive Client Configured' 
                  : 'Google Drive Credentials Awaiting Configuration'}
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {configStatus.isConfigured
                  ? `Client ID configured (${configStatus.clientId}). You can connect and browse your physical card archives.`
                  : 'To enable direct browsing of your Google Drive account, your Google Cloud project credentials must be added to your environment variables.'}
              </p>
            </div>
          </div>

          {/* Setup Checklist */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              <span>Google Cloud Configuration Checklist</span>
            </h3>

            <ol className="space-y-2.5 list-decimal list-inside pl-1 text-slate-300 leading-relaxed">
              <li className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <strong className="text-white">Enable APIs:</strong> In the{' '}
                <a 
                  href="https://console.cloud.google.com/apis/library" 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-amber-400 underline inline-flex items-center gap-1 hover:text-amber-300"
                >
                  Google Cloud Console <ExternalLink className="w-3 h-3" />
                </a>, enable <strong>Google Drive API</strong> and <strong>Google Picker API</strong>.
              </li>

              <li className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <strong className="text-white">OAuth Consent Screen:</strong> Set User Type to <em>External</em> or <em>Internal</em> and add test user emails.
              </li>

              <li className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <strong className="text-white">Create OAuth 2.0 Web Client ID:</strong> Under <em>Credentials &gt; Create Credentials</em>, select <em>Web Application</em>.
                <div className="mt-1.5 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-amber-300 flex items-center justify-between">
                  <span>Authorized JavaScript Origin: <code>{currentOrigin}</code></span>
                </div>
              </li>

              <li className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <strong className="text-white">Add Environment Variables:</strong> Set in your project's <code>.env.local</code>:
                <pre className="mt-1.5 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-cyan-300 overflow-x-auto">
{`VITE_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
VITE_GOOGLE_API_KEY="your-google-api-key"`}
                </pre>
              </li>
            </ol>
          </div>

          {/* Privacy & Least-Privilege Notice */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-[11px] text-slate-400">
              <strong>Least-Privilege Security:</strong> Booking Wars requests read-only file access restricted to files you explicitly pick via Google Picker. Your original Drive files are never modified or deleted.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          {onTestSimulatedDrive && (
            <button
              onClick={() => {
                onClose();
                onTestSimulatedDrive();
              }}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold transition-colors"
            >
              Test with Sample Drive Archives
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-auto px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
