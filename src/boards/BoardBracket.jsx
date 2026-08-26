import React from 'react';
import { Trophy, Shuffle } from 'lucide-react';
import { roundLabel, bracketChampion } from './bracketEngine';

/**
 * Tournament Bracket — single elimination.
 * Tap a competitor to send them through; tap again to undo the pick.
 */
export default function BoardBracket({ game, board, onPickWinner, onReseed, readOnly }) {
  const bracket = game.bracket;
  if (!bracket?.rounds?.length) {
    return <p className="text-text-muted text-sm text-center py-12">Bracket not generated.</p>;
  }

  const playerById = Object.fromEntries(game.players.map((p) => [p.id, p]));
  const champion = bracketChampion(bracket);
  const totalRounds = bracket.rounds.length;

  const Slot = ({ match, roundIndex, matchIndex, side }) => {
    const id = side === 'A' ? match.slotA : match.slotB;
    const other = side === 'A' ? match.slotB : match.slotA;
    const player = id ? playerById[id] : null;

    const isBye = id === null;
    const decided = match.winner !== undefined;
    const isWinner = decided && match.winner === id;
    const isLoser = decided && id && match.winner !== id;
    const canPick = !readOnly && id && other !== null && other !== undefined;

    if (isBye) {
      return (
        <div className="h-10 px-3 flex items-center text-[11px] text-text-muted italic border-l-2 border-transparent">
          bye
        </div>
      );
    }

    return (
      <button
        onClick={() => canPick && onPickWinner(roundIndex, matchIndex, id)}
        disabled={!canPick}
        className={`w-full h-10 px-3 flex items-center gap-2 text-left transition-all border-l-2 ${
          isWinner
            ? 'bg-accent-green/15 border-accent-green'
            : isLoser
            ? 'opacity-40 border-transparent'
            : canPick
            ? 'hover:bg-white/[0.06] border-transparent'
            : 'border-transparent'
        } ${canPick ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {player ? (
          <>
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: player.color }}
            />
            <span
              className={`text-sm truncate ${
                isWinner ? 'text-white font-semibold' : 'text-text-secondary'
              }`}
            >
              {player.name}
            </span>
            {isWinner && <Trophy size={11} className="ml-auto text-accent-green flex-shrink-0" />}
          </>
        ) : (
          <span className="text-xs text-text-muted italic">TBD</span>
        )}
      </button>
    );
  };

  return (
    <div>
      {champion && (
        <div className="mb-6 rounded-xl border border-accent-amber/30 bg-accent-amber/10 p-5 flex items-center gap-4">
          <Trophy size={28} className="text-accent-amber flex-shrink-0" />
          <div>
            <p className="text-xs text-accent-amber/80 uppercase tracking-wide">Champion</p>
            <p className="font-heading text-xl font-bold text-white">
              {playerById[champion]?.name || 'Unknown'}
            </p>
          </div>
        </div>
      )}

      {/* Connectors are drawn from each match box: a stub out to the right, and on
          every even match a vertical line down to its sibling. Because each match
          sits in an equal-height flex-1 cell, that line is exactly one cell tall
          and lands on the next round's match centre. */}
      <div className="overflow-x-auto -mx-2 px-2 pb-2">
        <div className="flex gap-6 min-w-min items-stretch" style={{ minHeight: `${bracket.rounds[0].length * 76}px` }}>
          {bracket.rounds.map((round, ri) => {
            const isLast = ri === totalRounds - 1;
            return (
              <div key={ri} className="flex flex-col min-w-[190px]">
                <p className="text-[11px] uppercase tracking-wide text-text-muted mb-3 text-center">
                  {roundLabel(ri, totalRounds)}
                </p>

                <div className="flex-1 flex flex-col">
                  {round.map((match, mi) => (
                    <div key={match.id} className="relative flex-1 flex items-center">
                      {ri > 0 && (
                        <span
                          className="absolute right-full w-3 border-t border-white/10"
                          style={{ top: '50%' }}
                        />
                      )}
                      {!isLast && (
                        <span
                          className="absolute left-full w-3 border-t border-white/10"
                          style={{ top: '50%' }}
                        />
                      )}
                      {!isLast && mi % 2 === 0 && (
                        <span
                          className="absolute h-full border-l border-white/10"
                          style={{ left: 'calc(100% + 0.75rem)', top: '50%' }}
                        />
                      )}

                      <div className="w-full rounded-lg border border-white/[0.07] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.06]">
                        <Slot match={match} roundIndex={ri} matchIndex={mi} side="A" />
                        <Slot match={match} roundIndex={ri} matchIndex={mi} side="B" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={onReseed}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white rounded-lg transition-all text-sm"
          >
            <Shuffle size={14} /> Redraw bracket
          </button>
          <p className="text-[11px] text-text-muted">
            Tap a name to advance them · tap again to undo
          </p>
        </div>
      )}
    </div>
  );
}
