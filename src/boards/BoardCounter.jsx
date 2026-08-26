import React, { useState } from 'react';
import { Minus, RotateCcw, Pencil, Check, X } from 'lucide-react';

/**
 * Counter — tap a tile, the number goes up.
 * The whole tile is the +1 target; secondary controls sit underneath.
 */
export default function BoardCounter({ game, board, ranking, onDelta, onSet, readOnly }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [pulse, setPulse] = useState(null);
  const step = game.config?.step || 1;

  const byId = Object.fromEntries(ranking.map((r) => [r.playerId, r]));
  const tiles = game.players.map((p) => byId[p.id]).filter(Boolean);

  const commit = () => {
    if (editing == null) return;
    const val = Number(draft);
    if (!Number.isNaN(val)) onSet(editing, val);
    setEditing(null);
  };

  const bump = (playerId) => {
    if (readOnly) return;
    onDelta(playerId, step);
    setPulse(playerId);
    setTimeout(() => setPulse((p) => (p === playerId ? null : p)), 220);
  };

  const cols =
    tiles.length === 1 ? 'grid-cols-1 max-w-sm mx-auto'
    : tiles.length <= 4 ? 'grid-cols-1 sm:grid-cols-2'
    : tiles.length <= 9 ? 'grid-cols-2 lg:grid-cols-3'
    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';

  return (
    <div className={`grid ${cols} gap-4`}>
      {tiles.map((row) => {
        const isEditing = editing === row.playerId;

        return (
          <div key={row.playerId} className="flex flex-col gap-2">
            {isEditing ? (
              <div
                className="rounded-2xl border border-accent-blue/50 bg-accent-blue/10 p-6 flex flex-col items-center gap-3"
                style={{ minHeight: '11rem' }}
              >
                <p className="text-sm text-white truncate max-w-full">{row.playerName}</p>
                <input
                  autoFocus
                  type="number"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  className="w-full px-3 py-2 bg-black/30 border border-accent-blue/50 rounded-lg text-white text-center font-heading text-3xl font-bold focus:outline-none"
                />
                <div className="flex gap-2">
                  <button onClick={commit} className="px-3 py-1.5 rounded-lg bg-accent-green/20 text-accent-green flex items-center gap-1 text-sm">
                    <Check size={14} /> Set
                  </button>
                  <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg bg-white/5 text-text-muted flex items-center gap-1 text-sm">
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => bump(row.playerId)}
                disabled={readOnly}
                className={`group relative rounded-2xl border p-6 flex flex-col items-center justify-center transition-transform duration-150 select-none disabled:cursor-not-allowed ${
                  pulse === row.playerId ? 'scale-[0.97]' : 'active:scale-[0.97]'
                }`}
                style={{
                  minHeight: '11rem',
                  backgroundColor: `${row.playerColor}14`,
                  borderColor: `${row.playerColor}40`,
                }}
              >
                <span className="font-heading text-6xl font-bold text-white tabular-nums leading-none">
                  {row.score}
                </span>
                <span className="mt-3 text-sm text-white/80 truncate max-w-full">{row.playerName}</span>
                {!readOnly && (
                  <span
                    className="mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full opacity-70 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: `${row.playerColor}33`, color: '#fff' }}
                  >
                    tap for +{step}
                  </span>
                )}
              </button>
            )}

            {!readOnly && !isEditing && (
              <div className="flex gap-2">
                <button
                  onClick={() => onDelta(row.playerId, -step)}
                  className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-text-muted hover:text-red-400 flex items-center justify-center transition-all"
                  title={`-${step}`}
                >
                  <Minus size={16} />
                </button>
                <button
                  onClick={() => {
                    setEditing(row.playerId);
                    setDraft(String(row.score));
                  }}
                  className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-white flex items-center justify-center transition-all"
                  title="Set exact value"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => onSet(row.playerId, 0)}
                  className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-white flex items-center justify-center transition-all"
                  title="Reset to zero"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
