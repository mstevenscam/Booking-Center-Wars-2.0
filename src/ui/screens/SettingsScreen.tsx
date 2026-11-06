/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Development Phase V1 — Screen 6: Settings & Preferences
 */

import React, { useState } from 'react';
import { 
  Settings, 
  Volume2, 
  VolumeX, 
  Tv, 
  ShieldCheck, 
  RotateCcw, 
  Sparkles, 
  Eye, 
  Check, 
  Sliders
} from 'lucide-react';

interface SettingsScreenProps {
  onResetDemo: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onResetDemo }) => {
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [ambientAudio, setAmbientAudio] = useState(false);
  const [screenShake, setScreenShake] = useState(true);
  const [combatSpeed, setCombatSpeed] = useState<'normal' | 'fast' | 'instant'>('fast');
  const [handoffCurtain, setHandoffCurtain] = useState(true);
  const [foilShimmer, setFoilShimmer] = useState<'subtle' | 'vibrant' | 'off'>('vibrant');
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);

  const handleSave = () => {
    setShowSavedFeedback(true);
    setTimeout(() => setShowSavedFeedback(false), 2500);
  };

  return (
    <div className="relative w-full min-h-[calc(100vh-53px)] bg-radial from-slate-900 via-slate-950 to-[#070a0f] p-4 sm:p-8 flex justify-center">
      {/* Toast Save Alert */}
      {showSavedFeedback && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 bg-amber-500 text-slate-950 font-black text-xs rounded-full shadow-2xl border border-amber-300 animate-in fade-in duration-150">
          Preferences saved to client storage!
        </div>
      )}

      <div className="w-full max-w-3xl space-y-6">
        {/* Header */}
        <div className="pb-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-100">Booking Centre Settings</h1>
              <p className="text-xs text-slate-400">Configure visual aesthetics, tactical pacing, and pass-and-play curtain controls.</p>
            </div>
          </div>
        </div>

        {/* SECTION 1: Audio & Atmosphere */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span>Audio & Atmosphere</span>
          </h2>

          <div className="space-y-3 divide-y divide-slate-800/80">
            {/* SFX Toggle */}
            <div className="pt-2 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-200">Tactile Sound Effects</div>
                <div className="text-[11px] text-slate-400">Card deployments, Booking Queue conveyor ticks, and combat impact noises.</div>
              </div>
              <button
                onClick={() => setSfxEnabled(!sfxEnabled)}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${sfxEnabled ? 'bg-amber-500' : 'bg-slate-800'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${sfxEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Office Hum Toggle */}
            <div className="pt-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-200">Sub-Basement Ambient Hum</div>
                <div className="text-[11px] text-slate-400">Fluorescent light ballast buzz and distant rolling flight-case rumble.</div>
              </div>
              <button
                onClick={() => setAmbientAudio(!ambientAudio)}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${ambientAudio ? 'bg-amber-500' : 'bg-slate-800'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${ambientAudio ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 2: Visual & Tactical Pacing */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Tv className="w-4 h-4 text-cyan-400" />
            <span>Visual Pacing & Tactile Feedback</span>
          </h2>

          <div className="space-y-4 divide-y divide-slate-800/80">
            {/* Screen Shake */}
            <div className="pt-2 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-200">Impact Screen Shake</div>
                <div className="text-[11px] text-slate-400">Dynamic haptic vibration on lethal strikes and Catastrophe incidents.</div>
              </div>
              <button
                onClick={() => setScreenShake(!screenShake)}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${screenShake ? 'bg-cyan-500' : 'bg-slate-800'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${screenShake ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Combat Speed */}
            <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-200">Tactical Combat Resolution Speed</div>
                <div className="text-[11px] text-slate-400">Controls animation duration for damage exchanges and queue progression.</div>
              </div>
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                {(['normal', 'fast', 'instant'] as const).map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setCombatSpeed(speed)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${
                      combatSpeed === speed ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            </div>

            {/* Foil Shimmer */}
            <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-200">Card Holographic Foil Rendering</div>
                <div className="text-[11px] text-slate-400">Tactile metallic sheen intensity on Supervisor and Rare cards.</div>
              </div>
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                {(['subtle', 'vibrant', 'off'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setFoilShimmer(mode)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${
                      foilShimmer === mode ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: Pass-and-Play Controls */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Pass-and-Play / Tablet Mode</span>
          </h2>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-200">Turn Handoff Privacy Curtain</div>
              <div className="text-[11px] text-slate-400">
                Displays an opaque privacy screen between turns to hide private hand cards during local hotseat play.
              </div>
            </div>
            <button
              onClick={() => setHandoffCurtain(!handoffCurtain)}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${handoffCurtain ? 'bg-emerald-500' : 'bg-slate-800'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${handoffCurtain ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {/* SECTION 4: Match Reset & Diagnostics */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold text-slate-200">Reset Match Demonstration</h3>
            <p className="text-[11px] text-slate-400">Restores all battlefield slots, hands, Shift points, and Booking Queue to the initial demo state.</p>
          </div>
          <button
            onClick={() => {
              onResetDemo();
              handleSave();
            }}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold text-xs rounded-xl border border-slate-700/80 flex items-center gap-2 transition-colors shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restore Fresh Demo State</span>
          </button>
        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-500 pt-2">
          BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE · Version 1.0.0-V1-VISUAL<br />
          Engine: Phase 2C-A Approved Specification · Isolated Mock UI Client
        </div>
      </div>
    </div>
  );
};
