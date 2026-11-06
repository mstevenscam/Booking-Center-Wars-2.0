/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Polish Phase V1.1 — Physical Booking Queue Conveyor
 */

import React from 'react';
import { Clock, ArrowRight, Zap, QrCode } from 'lucide-react';
import { QueueTicketView } from '../types';

interface QueueConveyorProps {
  queue: QueueTicketView[];
  onExpediteTicket?: (ticketId: string) => void;
  onInspectCard?: (card: QueueTicketView['card']) => void;
}

export const QueueConveyor: React.FC<QueueConveyorProps> = ({
  queue,
  onExpediteTicket,
  onInspectCard
}) => {
  return (
    <div className="relative w-full bg-slate-950/95 border-y-2 border-slate-800 py-2 sm:py-2.5 px-3 sm:px-4 flex items-center gap-3 overflow-hidden shadow-inner">
      {/* Belt texture background animation */}
      <div className="absolute inset-0 conveyor-belt-strip opacity-25 pointer-events-none" />

      {/* Conveyor Label & LED Station Tag */}
      <div className="relative z-10 flex items-center gap-2 pr-3 border-r border-slate-800 shrink-0">
        <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
          <Clock className="w-4 h-4 animate-spin [animation-duration:16s]" />
        </div>
        <div>
          <div className="text-[9.5px] sm:text-[10px] font-black tracking-widest text-slate-300 uppercase flex items-center gap-1.5">
            <span>BOOKING QUEUE</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
          </div>
          <div className="text-[8.5px] sm:text-[9px] text-amber-400/90 font-mono">
            {queue.length} Active Reservations
          </div>
        </div>
      </div>

      {/* Ticket List Conveyor Belt */}
      <div className="relative z-10 flex-1 flex items-center gap-2.5 sm:gap-3 overflow-x-auto py-1">
        {queue.length === 0 ? (
          <div className="text-xs text-slate-500 italic py-1">
            Booking Queue is clear. No gear reservations pending arrival.
          </div>
        ) : (
          queue.map((ticket, index) => {
            const isExpedited = ticket.priorityLevel === 'EXPEDITED' || ticket.turnsRemaining <= 1;
            const isPlayer = ticket.owner === 'PLAYER';

            return (
              <div
                key={ticket.id}
                className={`relative shrink-0 flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all duration-200 card-tactile-depth group
                  ${isPlayer 
                    ? 'bg-slate-900/95 border-amber-500/50 hover:border-amber-400' 
                    : 'bg-slate-900/95 border-rose-500/50 hover:border-rose-400'
                  }
                  ${isExpedited ? 'ring-1 ring-amber-400/70 shadow-[0_0_14px_rgba(245,158,11,0.3)]' : ''}
                `}
              >
                {/* Turn Countdown Badge */}
                <div className={`w-7 sm:w-8 h-7 sm:h-8 rounded-lg flex flex-col items-center justify-center font-black text-xs border shadow-sm ${
                  isExpedited 
                    ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 border-amber-300' 
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  <span className="leading-none text-xs">{ticket.turnsRemaining}</span>
                  <span className="text-[6.5px] tracking-tighter uppercase font-black leading-none mt-0.5">
                    {ticket.turnsRemaining === 1 ? 'TURN' : 'TURNS'}
                  </span>
                </div>

                {/* Ticket Details & Barcode */}
                <div 
                  className="cursor-pointer"
                  onClick={() => onInspectCard && onInspectCard(ticket.card)}
                  title="Click to inspect reservation item"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8.5px] font-mono font-bold text-slate-400">
                      {ticket.ticketNumber}
                    </span>
                    <span className={`text-[7.5px] font-black px-1 rounded uppercase tracking-wider ${
                      isPlayer ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {isPlayer ? 'Friendly' : 'Opponent'}
                    </span>
                  </div>
                  <div className="text-[11px] sm:text-xs font-bold text-slate-100 truncate max-w-[120px] sm:max-w-[160px] group-hover:text-amber-300 transition-colors">
                    {ticket.card.name}
                  </div>
                </div>

                {/* Action button: Expedite demo */}
                {isPlayer && onExpediteTicket && ticket.turnsRemaining > 1 && (
                  <button
                    onClick={() => onExpediteTicket(ticket.id)}
                    className="ml-0.5 px-1.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/35 text-amber-300 border border-amber-500/35 text-[9px] font-black flex items-center gap-0.5 transition-colors shadow-xs"
                    title="Simulate queue acceleration (-1 turn)"
                  >
                    <Zap className="w-2.5 h-2.5" />
                    <span>-1</span>
                  </button>
                )}

                {/* Next In Line Indicator Arrow */}
                {index === 0 && (
                  <div className="ml-1 flex items-center text-amber-400 font-bold text-[9px] animate-pulse">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
