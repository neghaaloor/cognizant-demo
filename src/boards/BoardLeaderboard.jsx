import React, { useState } from 'react';
import { Plus, Minus, ArrowUp, ArrowDown, Pencil, Check, X } from 'lucide-react';

/**
 * Leaderboard — participants in ranked rows.
 */
export default function BoardLeaderboard({ game, board, ranking, onDelta, onSet, readOnly }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const step = game.config?.step || 1;
  const target = game.config?.targetScore || 0;

  const startEdit = (row) => {
    setEditing(row.playerId);
    setDraft(String(row.score));
  };

  const commit = () => {
    if (editing == null) return;
    const val = Number(draft);
    if (!Number.isNaN(val)) onSet(editing, val);
    setEditing(null);
  };

  const rankStyles = (rank) => {
    if (rank === 1) return 'bg-amber-500/10 border-amber-500/25';
    if (rank === 2) return 'bg-gray-400/[0.07] border-gray-400/15';
    if (rank === 3) return 'bg-orange-700/10 border-orange-700/20';
    return 'bg-white/[0.02] border-white/[0.05]';
  };

  const rankBadge = (rank) => {
    const cls =
      rank === 1 ? 'gold-rank' : rank === 2 ? 'silver-rank' : rank === 3 ? 'bronze-rank' : 'text-text-muted';
    return <span className={`font-heading font-bold text-lg ${cls}`}>{rank}</span>;
  };

  return (
    <div className="space-y-2">
      {ranking.map((row) => {
        const isEditing = editing === row.playerId;
        const pct = target > 0 ? Math.min(100, (row.score / target) * 100) : 0;

        return (
          <div
            key={row.playerId}
            className={`relative overflow-hidden rounded-xl border transition-all duration-500 ${rankStyles(row.rank)}`}
          >
            {target > 0 && (
              <div
                className="absolute inset-y-0 left-0 transition-all duration-700 pointer-events-none"
                style={{ width: `${pct}%`, backgroundColor: `${row.playerColor}14` }}
              />
            )}

            <div className="relative flex items-center gap-3 p-3 sm:p-4">
              <div className="w-8 text-center flex-shrink-0">{rankBadge(row.rank)}</div>

              <div
                className="w-2.5 h-10 rounded-full flex-shrink-0"
                style={{ backgroundColor: row.playerColor || '#3b82f6' }}
              />

              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">{row.playerName}</p>
                {target > 0 && (
                  <p className="text-[11px] text-text-muted">
                    {Math.max(0, target - row.score)} to go
                  </p>
                )}
              </div>

              {row.trend > 0 && <ArrowUp size={16} className="text-accent-green flex-shrink-0" />}
              {row.trend < 0 && <ArrowDown size={16} className="text-red-400 flex-shrink-0" />}

              {isEditing ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    type="number"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    className="w-24 px-2 py-1.5 bg-accent-blue/20 border border-accent-blue/50 rounded-lg text-white text-right font-bold focus:outline-none"
                  />
                  <button onClick={commit} className="p-1.5 text-accent-green hover:bg-white/10 rounded">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setEditing(null)} className="p-1.5 text-text-muted hover:bg-white/10 rounded">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => !readOnly && startEdit(row)}
                    disabled={readOnly}
                    className="group flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/5 disabled:hover:bg-transparent transition-colors"
                    title="Click to set an exact score"
                  >
                    <span className="font-heading text-2xl sm:text-3xl font-bold text-white tabular-nums">
                      {row.score}
                    </span>
                    {!readOnly && (
                      <Pencil size={12} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>

                  {!readOnly && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => onDelta(row.playerId, -step)}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-red-500/20 text-text-secondary hover:text-red-400 flex items-center justify-center transition-all active:scale-90"
                        title={`-${step}`}
                      >
                        <Minus size={16} />
                      </button>
                      <button
                        onClick={() => onDelta(row.playerId, step)}
                        className="w-9 h-9 rounded-lg bg-accent-blue/15 hover:bg-accent-blue/30 text-accent-blue flex items-center justify-center transition-all active:scale-90"
                        title={`+${step}`}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {ranking.length === 0 && (
        <p className="text-text-muted text-sm text-center py-12">No participants on this board.</p>
      )}
    </div>
  );
}
