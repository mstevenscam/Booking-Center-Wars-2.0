/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Hearthstone-Style Interactive Targeting Arrow Component
 * 
 * Draws an interactive SVG bezier arrow from the attacking character to
 * the pointer/crosshair position with tactile glow and arrowhead.
 */

import React from 'react';

interface TargetingArrowProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  isOverValidTarget?: boolean;
}

export const TargetingArrow: React.FC<TargetingArrowProps> = ({
  startX,
  startY,
  endX,
  endY,
  isOverValidTarget = false
}) => {
  // Control point for a slight natural curve
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // If distance is very small, don't render yet
  if (distance < 20) return null;

  // Midpoint with perpendicular offset for smooth arc
  const midX = (startX + endX) / 2 - dy * 0.12;
  const midY = (startY + endY) / 2 + dx * 0.12;

  // Angle for arrowhead
  const angle = Math.atan2(endY - midY, endX - midX) * (180 / Math.PI);

  const strokeColor = isOverValidTarget ? '#ef4444' : '#f59e0b';
  const glowColor = isOverValidTarget ? 'rgba(239, 68, 68, 0.7)' : 'rgba(245, 158, 11, 0.7)';

  return (
    <svg 
      className="fixed inset-0 w-full h-full pointer-events-none z-50 overflow-visible"
      style={{ filter: `drop-shadow(0 0 8px ${glowColor})` }}
    >
      <defs>
        <marker
          id="targeting-arrowhead"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill={strokeColor} />
        </marker>
      </defs>

      {/* Main Bezier Curve */}
      <path
        d={`M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`}
        fill="none"
        stroke={strokeColor}
        strokeWidth="6"
        strokeDasharray="10 6"
        strokeLinecap="round"
        markerEnd="url(#targeting-arrowhead)"
      />

      {/* Target Reticle at pointer */}
      <circle
        cx={endX}
        cy={endY}
        r={isOverValidTarget ? 18 : 12}
        fill="none"
        stroke={strokeColor}
        strokeWidth="3"
        strokeDasharray={isOverValidTarget ? 'none' : '4 4'}
        className={isOverValidTarget ? 'animate-ping' : ''}
      />
    </svg>
  );
};
