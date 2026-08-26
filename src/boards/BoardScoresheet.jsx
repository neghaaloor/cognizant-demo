import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';

/**
 * Scoresheet — the multi-column board. Rows are players, columns are rounds.
 * Every cell is editable; totals recompute live.
 */
export default function BoardScoresheet({
  game,
  board,
  ranking,
  onCell,
  onAddRound,
  onRemoveRound,
  readOnly,
}) {
  const [editing, setEditing] = useState(null); // { playerId, roundIndex }
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const rounds = game.currentRound || 0;
  const totalsById = Object.fromEntries(ranking.map((r) => [r.playerId, r.score]));
  const rankById = Object.fromEntries(ranking.map((r) => [r.playerId, r.rank]));

  const cellValue = (playerId, roundIndex) => {
    const entry = game.scores?.[playerId]?.[roundIndex];
    return entry?.score ?? 0;
  };

  /**
   * Commit a specific cell, not "whatever is being edited".
   *
   * Enter used to commit and then move to the next cell, at which point the old
   * input's blur fired a second commit — by then `editing` pointed at the NEW
   * cell, so the blur wrote the previous draft into the wrong cell and raced
   * the first write. Taking the cell as an argument, and ignoring a repeat for
   * the same cell, removes both problems.
   */
  const committed = useRef(null);

  const commit = (cell) => {
    const target = cell || editing;
    if (!target) return;

    const key = `${target.playerId}:${target.roundIndex}`;
    if (committed.current === key) return;   // blur following an Enter
    committed.current = key;

    const val = Number(draft);
    const previous = cellValue(target.playerId, target.roundIndex);
    const next = Number.isNaN(val) ? 0 : val;
    if (next !== previous) onCell(target.playerId, target.roundIndex, next);
    setEditing(null);
  };

  const beginEdit = (playerId, roundIndex) => {
    committed.current = null;
    setEditing({ playerId, roundIndex });
    setDraft(String(cellValue(playerId, roundIndex)));
  };

  const moveTo = (playerIndex, roundIndex) => {
    const p = game.players[playerIndex];
    if (!p || roundIndex < 0 || roundIndex >= rounds) return;
    beginEdit(p.id, roundIndex);
  };

  const handleKey = (e, playerIndex, roundIndex) => {
    const cell = { playerId: game.players[playerIndex].id, roundIndex };
    if (e.key === 'Enter') {
      commit(cell);
      // Enter walks down the column, wrapping to the next round.
      if (playerIndex + 1 < game.players.length) moveTo(playerIndex + 1, roundIndex);
      else if (roundIndex + 1 < rounds) moveTo(0, roundIndex + 1);
    } else if (e.key === 'Escape') {
      committed.current = null;
      setEditing(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commit(cell);
      const dir = e.shiftKey ? -1 : 1;
      moveTo(playerIndex, roundIndex + dir);
    }
  };

  if (rounds === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-text-muted text-sm mb-4">No rounds on this sheet yet.</p>
        {!readOnly && (
          <button
            onClick={onAddRound}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-blue hover:bg-accent-blue/90 rounded-lg text-white text-sm font-medium transition-all"
          >
            <Plus size={16} /> Add first round
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-[#0f0f1a] text-left py-2.5 px-3 text-text-muted font-medium border-b border-white/10 min-w-[140px]">
                Player
              </th>
              {Array.from({ length: rounds }, (_, i) => (
                <th
                  key={i}
                  className="group py-2.5 px-2 text-text-muted font-medium border-b border-white/10 min-w-[72px]"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>R{i + 1}</span>
                    {!readOnly && i === rounds - 1 && rounds > 0 && (
                      <button
                        onClick={onRemoveRound}
                        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 transition-all"
                        title="Remove last round"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="sticky right-0 z-20 bg-[#0f0f1a] py-2.5 px-3 text-text-muted font-medium border-b border-white/10 min-w-[80px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {game.players.map((player, pi) => {
              const rank = rankById[player.id];
              return (
                <tr key={player.id} className="group/row">
                  <td className="sticky left-0 z-10 bg-[#0f0f1a] py-2.5 px-3 border-b border-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <span className="w-4 text-[11px] text-text-muted tabular-nums">{rank}</span>
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: player.color }}
                      />
                      <span className="text-white truncate">{player.name}</span>
                    </div>
                  </td>

                  {Array.from({ length: rounds }, (_, ri) => {
                    const isEditing =
                      editing?.playerId === player.id && editing?.roundIndex === ri;
                    const value = cellValue(player.id, ri);

                    return (
                      <td key={ri} className="py-1 px-1 text-center border-b border-white/[0.04]">
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            autoFocus
                            type="number"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => commit({ playerId: player.id, roundIndex: ri })}
                            onKeyDown={(e) => handleKey(e, pi, ri)}
                            className="w-16 px-1 py-1.5 bg-accent-blue/20 border border-accent-blue/60 rounded text-white text-center focus:outline-none tabular-nums"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              if (readOnly) return;
                              beginEdit(player.id, ri);
                            }}
                            disabled={readOnly}
                            className={`w-16 py-1.5 rounded tabular-nums transition-colors ${
                              value === 0
                                ? 'text-text-muted hover:text-white hover:bg-white/5'
                                : 'text-white hover:bg-white/5'
                            } disabled:hover:bg-transparent`}
                          >
                            {value}
                          </button>
                        )}
                      </td>
                    );
                  })}

                  <td className="sticky right-0 z-10 bg-[#0f0f1a] py-2.5 px-3 text-center border-b border-white/[0.04]">
                    <span
                      className={`font-heading font-bold text-lg tabular-nums ${
                        rank === 1 ? 'text-accent-amber' : 'text-white'
                      }`}
                    >
                      {totalsById[player.id] ?? 0}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={onAddRound}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-accent-blue/20 text-accent-blue rounded-lg hover:bg-accent-blue/30 transition-all text-sm"
          >
            <Plus size={14} /> Add round
          </button>
          <p className="text-[11px] text-text-muted">
            Tab moves across a row · Enter moves down a column
          </p>
        </div>
      )}
    </div>
  );
}
