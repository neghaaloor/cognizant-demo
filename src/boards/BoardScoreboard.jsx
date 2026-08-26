import React, { useState } from 'react';
import { Plus, Minus, Crown, Pencil, Check, X } from 'lucide-react';

/**
 * Scoreboard — participants in big readable blocks.
 * Built to stay legible on a TV or projector.
 */
export default function BoardScoreboard({ game, board, ranking, onDelta, onSet, readOnly }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const step = game.config?.step || 1;

  const commit = () => {
    if (editing == null) return;
    const val = Number(draft);
    if (!Number.isNaN(val)) onSet(editing, val);
    setEditing(null);
  };

  // Blocks are laid out in board order, not rank order, so tiles don't jump
  // around under someone's finger mid-game.
  const byId = Object.fromEntries(ranking.map((r) => [r.playerId, r]));
  const blocks = game.players.map((p) => byId[p.id]).filter(Boolean);

  const cols =
    blocks.length <= 2 ? 'sm:grid-cols-2'
    : blocks.length <= 4 ? 'sm:grid-cols-2'
    : blocks.length <= 9 ? 'sm:grid-cols-2 lg:grid-cols-3'
    : 'sm:grid-cols-3 lg:grid-cols-4';

  return (
    <div className={`grid grid-cols-1 ${cols} gap-4`}>
      {blocks.map((row) => {
        const isEditing = editing === row.playerId;
        const isLeader = row.rank === 1 && row.score !== 0;

        return (
          <div
            key={row.playerId}
            className="relative rounded-2xl border overflow-hidden transition-all duration-300"
            style={{
              backgroundColor: `${row.playerColor}0f`,
              borderColor: isLeader ? `${row.playerColor}66` : 'rgba(255,255,255,0.07)',
              boxShadow: isLeader ? `0 0 28px ${row.playerColor}22` : 'none',
            }}
          >
            <div
              className="h-1.5 w-full"
              style={{ backgroundColor: row.playerColor || '#3b82f6' }}
            />

            <div className="p-5 text-center">
              <div className="flex items-center justify-center gap-2 mb-1 min-h-[24px]">
                {isLeader && <Crown size={16} className="text-accent-amber" />}
                <p className="font-medium text-white truncate">{row.playerName}</p>
              </div>
              <p className="text-[11px] text-text-muted mb-3">Rank {row.rank}</p>

              {isEditing ? (
                <div className="flex items-center justify-center gap-1 mb-4">
                  <input
                    autoFocus
                    type="number"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    className="w-28 px-2 py-2 bg-accent-blue/20 border border-accent-blue/50 rounded-lg text-white text-center font-heading text-2xl font-bold focus:outline-none"
                  />
                  <button onClick={commit} className="p-2 text-accent-green hover:bg-white/10 rounded">
                    <Check size={18} />
                  </button>
                  <button onClick={() => setEditing(null)} className="p-2 text-text-muted hover:bg-white/10 rounded">
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (readOnly) return;
                    setEditing(row.playerId);
                    setDraft(String(row.score));
                  }}
                  disabled={readOnly}
                  className="group relative block w-full mb-4"
                  title="Click to set an exact score"
                >
                  <span className="font-heading text-6xl sm:text-7xl font-bold text-white tabular-nums leading-none">
                    {row.score}
                  </span>
                  {!readOnly && (
                    <Pencil
                      size={13}
                      className="absolute top-1 right-1 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  )}
                </button>
              )}

              {!readOnly && !isEditing && (
                <div className="flex gap-2">
                  <button
                    onClick={() => onDelta(row.playerId, -step)}
                    className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-red-500/20 text-text-secondary hover:text-red-400 flex items-center justify-center transition-all active:scale-95"
                  >
                    <Minus size={20} />
                  </button>
                  <button
                    onClick={() => onDelta(row.playerId, step)}
                    className="flex-[2] py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-1 transition-all active:scale-95"
                    style={{ backgroundColor: `${row.playerColor}33` }}
                  >
                    <Plus size={20} /> {step}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
