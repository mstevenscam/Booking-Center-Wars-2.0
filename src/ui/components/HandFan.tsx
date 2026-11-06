/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Hearthstone-Style Curved Hand Fan Component
 * 
 * Implements curved radial card arrangement, natural overlap, hover elevation,
 * green playable glow, and drag-and-drop deployment interaction.
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
  // Calculate rotation step and horizontal spacing dynamically based on hand size
  const maxAngle = Math.min(24, totalCards * 4);
  const angleStep = totalCards > 1 ? (maxAngle * 2) / (totalCards - 1) : 0;

  return (
    <div className="relative w-full h-36 sm:h-44 md:h-48 flex items-end justify-center select-none pb-1 pointer-events-auto">
      <div className="relative flex items-end justify-center w-full max-w-4xl h-full">
        {hand.map((card, index) => {
          const isSelected = selectedCardId === card.id;
          const isHovered = hoveredCardId === card.id;
          const canAfford = shiftAvailable >= card.shiftCost;

          // Fan geometry calculation
          const offsetIndex = index - (totalCards - 1) / 2;
          const defaultRotation = offsetIndex * (angleStep || 0);
          const defaultTranslateY = Math.abs(offsetIndex) * (totalCards > 5 ? 6 : 4);
          const defaultTranslateX = offsetIndex * (totalCards > 6 ? 32 : 42);

          // Dynamic transform when hovered or selected
          const rotation = isHovered || isSelected ? 0 : defaultRotation;
          const translateY = isSelected 
            ? -60 
            : isHovered 
              ? -50 
              : defaultTranslateY;
          const scale = isSelected 
            ? 1.15 
            : isHovered 
              ? 1.25 
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
                transition: 'transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), z-index 0.1s ease',
                transformOrigin: 'bottom center'
              }}
              className={`absolute bottom-0 cursor-grab active:cursor-grabbing origin-bottom ${
                canAfford && !card.isExhausted ? 'card-playable-glow rounded-xl' : ''
              }`}
            >
              <CardView
                card={card}
                size="compact"
                isSelected={isSelected}
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
