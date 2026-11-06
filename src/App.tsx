/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Development Phase V1 — Main App Client
 * 
 * Top-level application shell hosting the full digital CCG visual suite:
 * 1. Main Battlefield (Tactical 5-slot grid, Booking Queue conveyor, Morale orbs)
 * 2. Card Design & Detailed Inspector
 * 3. Main Menu
 * 4. Deck Builder (30-card roster assembly & Shift cost curve analysis)
 * 5. Card Collection (Humber Archive binder & foil showcase)
 * 6. Settings & Display (Audio, visual shake, pass-and-play handoff)
 * 7. Rules & Architecture Command Center (Preserved foundational engine specs)
 */

import React, { useState, useEffect } from 'react';
import { VisualScreenType, VisualGameState } from './ui/types';
import { defaultMockController } from './ui/mock_controller';
import { TopNavigation } from './ui/components/TopNavigation';
import { BattlefieldScreen } from './ui/screens/BattlefieldScreen';
import { MainMenuScreen } from './ui/screens/MainMenuScreen';
import { DeckBuilderScreen } from './ui/screens/DeckBuilderScreen';
import { CardCollectionScreen } from './ui/screens/CardCollectionScreen';
import { CardArchiveScreen } from './ui/screens/CardArchiveScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { CommandCenterScreen } from './ui/screens/CommandCenterScreen';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<VisualScreenType>('BATTLEFIELD');
  const [gameState, setGameState] = useState<VisualGameState>(defaultMockController.getState());

  useEffect(() => {
    const unsubscribe = defaultMockController.subscribe((newState) => {
      setGameState(newState);
    });
    return unsubscribe;
  }, []);

  const handleAdvancePhase = () => {
    defaultMockController.advancePhase();
  };

  const handlePlayCard = (cardId: string, targetSlot: number): boolean => {
    return defaultMockController.playCard(cardId, targetSlot);
  };

  const handleExecuteAttack = (
    attackerSlot: number, 
    targetSlot: number | 'SUPERVISOR'
  ): boolean => {
    return defaultMockController.executeAttack(attackerSlot, targetSlot);
  };

  const handleExpediteTicket = (ticketId: string) => {
    defaultMockController.expediteTicket(ticketId);
  };

  const handleResetDemo = () => {
    defaultMockController.reset();
  };

  return (
    <div className="min-h-screen bg-[#070a0f] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Universal Top Navigation Header */}
      <TopNavigation
        activeScreen={activeScreen}
        onSelectScreen={setActiveScreen}
        onResetDemo={handleResetDemo}
        turnNumber={gameState.turnNumber}
        matchId={gameState.matchId}
      />

      {/* Screen Router */}
      <main className="flex-1 flex flex-col">
        {activeScreen === 'BATTLEFIELD' && (
          <BattlefieldScreen
            state={gameState}
            onAdvancePhase={handleAdvancePhase}
            onPlayCard={handlePlayCard}
            onExecuteAttack={handleExecuteAttack}
            onExpediteTicket={handleExpediteTicket}
            onResetDemo={handleResetDemo}
          />
        )}

        {activeScreen === 'MAIN_MENU' && (
          <MainMenuScreen
            onNavigate={setActiveScreen}
            playerMorale={gameState.player.morale}
            opponentMorale={gameState.opponent.morale}
            turnNumber={gameState.turnNumber}
          />
        )}

        {activeScreen === 'DECK_BUILDER' && (
          <DeckBuilderScreen />
        )}

        {activeScreen === 'COLLECTION' && (
          <CardCollectionScreen />
        )}

        {activeScreen === 'ARCHIVE' && (
          <CardArchiveScreen />
        )}

        {activeScreen === 'SETTINGS' && (
          <SettingsScreen onResetDemo={handleResetDemo} />
        )}

        {activeScreen === 'COMMAND_CENTER' && (
          <CommandCenterScreen />
        )}
      </main>
    </div>
  );
}
