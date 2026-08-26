import React, { useState, useRef } from 'react';
import { Plus } from 'lucide-react';
import { calculateRoundTotal, calculatePlayerTotal } from '../engines/scoringEngine';

/**
 * Renderer for games created before board types shipped
 * (Chess, Catan, Monopoly, UNO, Scrabble …).
 *
 * Board types replaced game templates for *new* boards, but saved games keep
 * their original match / attribute / multi-field-round scoring so nothing
 * already in progress breaks.
 */
export default function BoardLegacy({ game, board, onCell, onAttribute, onAddRound, readOnly }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const template = board;
  const rounds = game.currentRound || 0;

  const commit = () => {
    if (!editing) return;
    const field = template.scoreFields.find((f) => f.key === editing.fieldKey);
    const value = field?.type === 'boolean' ? draft === 'true' : Number(draft) || 0;
    onCell(editing.playerId, editing.roundIndex, editing.fieldKey, value);
    setEditing(null);
  };

  /* ---------------- attribute (Catan, Monopoly) ---------------- */
  if (template.scoringType === 'attribute') {
    return (
      <div className="space-y-3">
        {game.players.map((player) => {
          const scores = game.scores[player.id] || [];
          const current = scores[0] || {};
          const total = calculatePlayerTotal(template, scores.length ? scores : [current]);

          return (
            <div key={player.id} className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.04]">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: player.color }} />
                <span className="font-medium text-white">{player.name}</span>
                <span className="ml-auto text-lg font-bold text-accent-amber">Total: {total}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {template.scoreFields.map((field) => (
                  <div key={field.key}>
                    <label className="text-xs text-text-muted block mb-1">{field.label}</label>
                    {field.type === 'boolean' ? (
                      <button
                        onClick={() => !readOnly && onAttribute(player.id, field.key, !current[field.key])}
                        disabled={readOnly}
                        className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${
                          current[field.key]
                            ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                            : 'bg-white/5 text-text-muted border border-white/10'
                        }`}
                      >
                        {current[field.key] ? 'Yes' : 'No'}
                      </button>
                    ) : (
                      <input
                        type="number"
                        value={current[field.key] || 0}
                        onChange={(e) => onAttribute(player.id, field.key, Number(e.target.value) || 0)}
                        disabled={readOnly}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-accent-blue/50 disabled:opacity-50 transition-all"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ---------------- match (Chess) ---------------- */
  if (template.scoringType === 'match') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-3 text-text-muted font-medium">Player</th>
              {Array.from({ length: rounds }, (_, i) => (
                <th key={i} className="text-center py-2 px-2 text-text-muted font-medium">R{i + 1}</th>
              ))}
              <th className="text-center py-2 px-3 text-text-muted font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {game.players.map((player) => {
              const scores = game.scores[player.id] || [];
              return (
                <tr key={player.id} className="border-b border-white/[0.04]">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: player.color }} />
                      <span className="text-white">{player.name}</span>
                    </div>
                  </td>
                  {Array.from({ length: rounds }, (_, ri) => {
                    const result = scores[ri]?.result || '';
                    return (
                      <td key={ri} className="py-2 px-1 text-center">
                        {readOnly ? (
                          <span
                            className={
                              result === 'W' ? 'text-accent-green font-bold'
                              : result === 'D' ? 'text-accent-amber'
                              : 'text-red-400'
                            }
                          >
                            {result || '-'}
                          </span>
                        ) : (
                          <div className="flex gap-1 justify-center">
                            {['W', 'D', 'L'].map((r) => (
                              <button
                                key={r}
                                onClick={() => onCell(player.id, ri, 'result', r)}
                                className={`w-7 h-7 rounded text-xs font-bold transition-all ${
                                  result === r
                                    ? r === 'W' ? 'bg-accent-green/30 text-accent-green'
                                      : r === 'D' ? 'bg-accent-amber/30 text-accent-amber'
                                      : 'bg-red-500/30 text-red-400'
                                    : 'bg-white/5 text-text-muted hover:bg-white/10'
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-center font-bold text-white">
                    {calculatePlayerTotal(template, scores)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!readOnly && (
          <button
            onClick={onAddRound}
            className="mt-4 flex items-center gap-1 px-3 py-1.5 bg-accent-blue/20 text-accent-blue rounded-lg hover:bg-accent-blue/30 transition-all text-sm"
          >
            <Plus size={14} /> Add round
          </button>
        )}
      </div>
    );
  }

  /* ---------------- round, possibly multi-field (UNO, Scrabble) ---------------- */
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-3 text-text-muted font-medium sticky left-0 bg-[#0f0f1a] z-10">
                Player
              </th>
              {Array.from({ length: rounds }, (_, i) => (
                <th key={i} className="text-center py-2 px-2 text-text-muted font-medium min-w-[60px]">
                  R{i + 1}
                </th>
              ))}
              <th className="text-center py-2 px-3 text-text-muted font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {game.players.map((player) => {
              const scores = game.scores[player.id] || [];
              return (
                <tr key={player.id} className="border-b border-white/[0.04]">
                  <td className="py-3 px-3 sticky left-0 bg-[#0f0f1a] z-10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: player.color }} />
                      <span className="text-white">{player.name}</span>
                    </div>
                  </td>

                  {Array.from({ length: rounds }, (_, ri) => {
                    const entry = scores[ri] || {};
                    return (
                      <td key={ri} className="py-2 px-1 text-center">
                        <div className="space-y-1">
                          {template.scoreFields.map((field) => {
                            const isEditing =
                              editing?.playerId === player.id &&
                              editing?.roundIndex === ri &&
                              editing?.fieldKey === field.key;

                            return isEditing ? (
                              <input
                                key={field.key}
                                ref={inputRef}
                                autoFocus
                                type="number"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={commit}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commit();
                                  if (e.key === 'Escape') setEditing(null);
                                }}
                                className="w-14 px-1 py-0.5 bg-accent-blue/20 border border-accent-blue/50 rounded text-white text-center text-xs focus:outline-none"
                              />
                            ) : (
                              <button
                                key={field.key}
                                onClick={() => {
                                  if (readOnly) return;
                                  setEditing({ playerId: player.id, roundIndex: ri, fieldKey: field.key });
                                  setDraft(String(entry[field.key] ?? 0));
                                }}
                                disabled={readOnly}
                                className="w-14 py-0.5 text-xs text-text-secondary hover:text-white hover:bg-white/5 rounded transition-all"
                                title={field.label}
                              >
                                {entry[field.key] ?? 0}
                              </button>
                            );
                          })}
                          {template.scoreFields.length > 1 && (
                            <div className="text-xs text-accent-blue font-medium border-t border-white/5 pt-0.5">
                              {calculateRoundTotal(template, entry)}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  <td className="py-2 px-3 text-center font-bold text-accent-amber text-lg">
                    {calculatePlayerTotal(template, scores)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <button
          onClick={onAddRound}
          className="mt-4 flex items-center gap-1 px-3 py-1.5 bg-accent-blue/20 text-accent-blue rounded-lg hover:bg-accent-blue/30 transition-all text-sm"
        >
          <Plus size={14} /> Add round
        </button>
      )}
    </div>
  );
}
