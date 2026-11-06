/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Development Phase V1 — Screen 3: Main Menu
 */

import React from 'react';
import { 
  Play, 
  Layers, 
  BookOpen, 
  Settings, 
  Terminal, 
  Award, 
  Sparkles, 
  AlertCircle, 
  Clock, 
  Shield, 
  ChevronRight,
  Flame,
  Radio
} from 'lucide-react';
import { VisualScreenType } from '../types';

interface MainMenuScreenProps {
  onNavigate: (screen: VisualScreenType) => void;
  playerMorale: number;
  opponentMorale: number;
  turnNumber: number;
}

export const MainMenuScreen: React.FC<MainMenuScreenProps> = ({
  onNavigate,
  playerMorale,
  opponentMorale,
  turnNumber
}) => {
  return (
    <div className="relative w-full min-h-[calc(100vh-53px)] bg-radial from-slate-900 via-slate-950 to-[#070a0f] flex flex-col items-center justify-between p-4 sm:p-8">
      {/* Subtle background ambient lighting */}
      <div className="absolute top-10 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Hero Title Section */}
      <div className="relative z-10 text-center max-w-3xl mt-4 sm:mt-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-widest mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>OFFICIAL DIGITAL TRADING CARD GAME</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white drop-shadow-lg">
          BOOKING <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500">WARS</span>
        </h1>
        <p className="text-sm sm:text-base font-bold text-slate-400 uppercase tracking-widest mt-1">
          The Battle for the Booking Centre
        </p>
        <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto mt-3 leading-relaxed">
          Lead your department through cutthroat shifts, fight for studio gear allocation, manage the physical Booking Queue, and preserve Supervisor Morale in the ultimate academic workplace CCG.
        </p>
      </div>

      {/* Main Navigation Hub Grid */}
      <div className="relative z-10 w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-4 my-8">
        {/* Play / Resume Match Card (Primary Call to Action) */}
        <div
          onClick={() => onNavigate('BATTLEFIELD')}
          className="col-span-1 md:col-span-2 group relative p-6 rounded-2xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border-2 border-amber-500/50 hover:border-amber-400 shadow-2xl cursor-pointer transition-all duration-300 card-tactile-depth hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider">
              ACTIVE ENGAGEMENT
            </span>
            <div className="flex items-center gap-1.5 text-xs text-amber-300 font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>Shift Turn {turnNumber}</span>
            </div>
          </div>

          <div className="mt-4">
            <h2 className="text-2xl font-black text-slate-100 group-hover:text-amber-300 transition-colors flex items-center gap-2">
              <span>Resume Battlefield Shift</span>
              <ChevronRight className="w-6 h-6 transform group-hover:translate-x-1 transition-transform" />
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Dave (Lead Tech) vs. Maya (Equipment Warden) · 5-Slot Tactical Grid
            </p>
          </div>

          {/* Quick status bar */}
          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300">Your Morale: <strong className="text-emerald-400">{playerMorale}/30</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-500" />
              <span className="text-slate-300">Opponent Morale: <strong className="text-rose-400">{opponentMorale}/30</strong></span>
            </div>
          </div>
        </div>

        {/* Deck Builder Card */}
        <div
          onClick={() => onNavigate('DECK_BUILDER')}
          className="group p-6 rounded-2xl bg-slate-900/90 border border-slate-700/80 hover:border-slate-500 shadow-xl cursor-pointer transition-all duration-300 card-tactile-depth flex flex-col justify-between hover:scale-[1.01]"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center mb-3">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-black text-slate-100 group-hover:text-purple-300 transition-colors">
              Deck Builder
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Assemble 30-card rosters, tune your Shift cost curve, and calibrate synergy.
            </p>
          </div>
          <div className="mt-4 text-xs font-bold text-purple-400 flex items-center gap-1">
            <span>Configure Rosters</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Card Collection Card */}
        <div
          onClick={() => onNavigate('COLLECTION')}
          className="group p-6 rounded-2xl bg-slate-900/90 border border-slate-700/80 hover:border-slate-500 shadow-xl cursor-pointer transition-all duration-300 card-tactile-depth flex flex-col justify-between hover:scale-[1.01]"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center justify-center mb-3">
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-black text-slate-100 group-hover:text-cyan-300 transition-colors">
              Card Collection
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Browse the Humber archive, inspect foil rarities, and study department abilities.
            </p>
          </div>
          <div className="mt-4 text-xs font-bold text-cyan-400 flex items-center gap-1">
            <span>Browse Archive</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Settings Card */}
        <div
          onClick={() => onNavigate('SETTINGS')}
          className="group p-6 rounded-2xl bg-slate-900/90 border border-slate-700/80 hover:border-slate-500 shadow-xl cursor-pointer transition-all duration-300 card-tactile-depth flex flex-col justify-between hover:scale-[1.01]"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center mb-3">
              <Settings className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-black text-slate-100 group-hover:text-amber-300 transition-colors">
              Game Settings
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Audio balance, screen shake, pass-and-play handoff curtain, and display modes.
            </p>
          </div>
          <div className="mt-4 text-xs font-bold text-amber-400 flex items-center gap-1">
            <span>Configure Preferences</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Foundation Command Center */}
        <div
          onClick={() => onNavigate('COMMAND_CENTER')}
          className="group p-6 rounded-2xl bg-slate-900/90 border border-slate-700/80 hover:border-slate-500 shadow-xl cursor-pointer transition-all duration-300 card-tactile-depth flex flex-col justify-between hover:scale-[1.01]"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center mb-3">
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-black text-slate-100 group-hover:text-emerald-300 transition-colors">
              Rules & Architecture
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Phase 1B math balance calculators, engine state specs, and test verifications.
            </p>
          </div>
          <div className="mt-4 text-xs font-bold text-emerald-400 flex items-center gap-1">
            <span>Inspect Engine Docs</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Satirical Booking Centre Dispatch News Ticker */}
      <div className="relative z-10 w-full max-w-4xl bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase shrink-0">
          <Radio className="w-3 h-3 animate-pulse" />
          <span>CAMPUS DISPATCH</span>
        </div>
        <div className="text-xs text-slate-300 truncate">
          <strong>MEMORANDUM #409:</strong> All BNC cables returned without over-under coiling will incur immediate morale deductions. Senior Archivist Eleanor has confiscated the master key to studio G-104.
        </div>
      </div>
    </div>
  );
};
