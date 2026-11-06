/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Development Phase V1 — Top Navigation Bar
 */

import React from 'react';
import { 
  Swords, 
  Menu, 
  Layers, 
  BookOpen, 
  Settings, 
  Terminal, 
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { VisualScreenType } from '../types';

interface TopNavigationProps {
  activeScreen: VisualScreenType;
  onSelectScreen: (screen: VisualScreenType) => void;
  onResetDemo: () => void;
  turnNumber?: number;
  matchId?: string;
}

export const TopNavigation: React.FC<TopNavigationProps> = ({
  activeScreen,
  onSelectScreen,
  onResetDemo,
  turnNumber = 4,
  matchId = 'bw-match-772'
}) => {
  const navItems: { screen: VisualScreenType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { screen: 'BATTLEFIELD', label: 'Battlefield', icon: Swords },
    { screen: 'MAIN_MENU', label: 'Main Menu', icon: Menu },
    { screen: 'DECK_BUILDER', label: 'Deck Builder', icon: Layers },
    { screen: 'COLLECTION', label: 'Card Collection', icon: BookOpen },
    { screen: 'SETTINGS', label: 'Settings', icon: Settings },
    { screen: 'COMMAND_CENTER', label: 'Rules & Architecture', icon: Terminal },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md px-3 sm:px-6 py-2 flex items-center justify-between">
      {/* Brand Title */}
      <div className="flex items-center gap-3">
        <div 
          onClick={() => onSelectScreen('MAIN_MENU')}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-md border border-amber-400/30 group-hover:scale-105 transition-transform">
            <Sparkles className="w-4 h-4 text-slate-950" />
          </div>
          <div>
            <div className="font-black text-sm tracking-wider text-slate-100 flex items-center gap-1.5">
              <span>BOOKING WARS</span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded uppercase tracking-widest">
                V1 Visual
              </span>
            </div>
            <div className="text-[10px] text-slate-400 truncate hidden md:block">
              The Battle for the Booking Centre
            </div>
          </div>
        </div>

        {activeScreen === 'BATTLEFIELD' && (
          <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-slate-800 text-xs">
            <span className="text-slate-400">Match: <code className="text-amber-400 font-mono text-[11px]">{matchId}</code></span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-300 font-bold">Turn {turnNumber}</span>
          </div>
        )}
      </div>

      {/* Screen Selector Tabs */}
      <nav className="flex items-center gap-1 overflow-x-auto max-w-full">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.screen;

          return (
            <button
              key={item.screen}
              onClick={() => onSelectScreen(item.screen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                isActive
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}

        {/* Quick Reset Demo State Button */}
        {activeScreen === 'BATTLEFIELD' && (
          <button
            onClick={onResetDemo}
            className="ml-2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-amber-300 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 transition-colors"
            title="Reset battlefield demonstration to fresh state"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden md:inline">Reset Demo</span>
          </button>
        )}
      </nav>
    </header>
  );
};
