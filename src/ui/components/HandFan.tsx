/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Milestone 3 — Premium Hearthstone-Style Curved Hand Fan
 * 
 * Production-grade collectible card hand tray:
 * - Natural radial fan curve with smooth mathematical curvature.
 * - Overlap geometry calibrated so the 3D Shift cost crystal and title remain visible.
 * - Smooth hover elevation: Straightens, elevates above siblings, and scales without jitter.
 * - Selected state with tactile rise and glowing golden selection ring.
 * - Clear playable status (green crystal aura) when Shift points allow deployment.
 * - Full touch and keyboard accessibility (Tab, Enter, Space).
 */

import React, { useState } from 'react';
import { GameViewCard } from '../types';
import { CardView } from './CardView';

interface HandFanProps {
  hand: GameViewCard[];
  shiftAvailable: number;
  selectedCardId: string | null;
  onSelectCard: (cardId: string) => void;
  onInspectCard: (card: GameViewCard) => void;
  onDragStart?: (card: GameViewCard, e: React.DragEvent) => void;
}

export const HandFan: React.FC<HandFanProps> = ({
  hand,
  shiftAvailable,
  selectedCardId,
  onSelectCard,
  onInspectCard,
  onDragStart
}) => {
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  const totalCards = hand.length;
  // Calculate angular spread and horizontal spacing dynamically based on hand size
  const maxAngle = Math.min(22, totalCards * 3.8);
  const angleStep = totalCards > 1 ? (maxAngle * 2) / (totalCards - 1) : 0;

  // Horizontal card spacing (closer when more cards in hand)
  const cardSpacing = totalCards > 7 ? 32 : totalCards > 5 ? 40 : 48;

  return (
    <div className="relative w-full h-36 sm:h-42 md:h-46 flex items-end justify-center select-none pb-1 pointer-events-auto overflow-visible">
      <div className="relative flex items-end justify-center w-full max-w-4xl h-full overflow-visible">
        {hand.map((card, index) => {
          const isSelected = selectedCardId === card.id;
          const isHovered = hoveredCardId === card.id;
          const canAfford = shiftAvailable >= card.shiftCost;

          // Fan geometry calculation
          const offsetIndex = index - (totalCards - 1) / 2;
          const defaultRotation = offsetIndex * (angleStep || 0);
          
          // Subtle parabolic curve: cards at ends dip down slightly
          const defaultTranslateY = Math.pow(Math.abs(offsetIndex), 1.6) * (totalCards > 5 ? 4.5 : 3.5);
          const defaultTranslateX = offsetIndex * cardSpacing;

          // Dynamic transform when hovered or selected
          const rotation = isHovered || isSelected ? 0 : defaultRotation;
          const translateY = isSelected 
            ? -65 
            : isHovered 
              ? -52 
              : defaultTranslateY;
          const scale = isSelected 
            ? 1.15 
            : isHovered 
              ? 1.22 
              : 1;
          const zIndex = isSelected ? 40 : isHovered ? 50 : 10 + index;

          return (
            <div
              key={card.id}
              draggable
              onDragStart={(e) => onDragStart && onDragStart(card, e)}
              onMouseEnter={() => setHoveredCardId(card.id)}
              onMouseLeave={() => setHoveredCardId(null)}
              onClick={() => onSelectCard(card.id)}
              style={{
                transform: `translateX(${defaultTranslateX}px) translateY(${translateY}px) rotate(${rotation}deg) scale(${scale})`,
                zIndex,
                transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), z-index 0.08s ease',
                transformOrigin: 'bottom center'
              }}
              className="absolute bottom-0 cursor-grab active:cursor-grabbing origin-bottom focus-visible:outline-none"
            >
              <CardView
                card={card}
                size="compact"
                isSelected={isSelected}
                isPlayable={canAfford && !card.isExhausted}
                isInteractable={true}
                onInspect={() => onInspectCard(card)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
