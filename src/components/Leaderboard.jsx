import React from 'react';
import { ArrowUp, ArrowDown, Minus, Trophy } from 'lucide-react';
import { generateLeaderboard, getLeaderboardColumns } from '../engines/leaderboardEngine';

export default function Leaderboard({ template, players, scores, previousRanking }) {
  const leaderboard = generateLeaderboard(template, players, scores, previousRanking);
  const columns = getLeaderboardColumns(template);

  const getRankBadge = (rank) => {
    if (rank === 1) return <span className="text-lg gold-rank font-bold">1st</span>;
    if (rank === 2) return <span className="text-lg silver-rank font-bold">2nd</span>;
    if (rank === 3) return <span className="text-lg bronze-rank font-bold">3rd</span>;
    return <span className="text-text-secondary">{rank}</span>;
  };

  const getTrendIcon = (trend) => {
    if (trend > 0) return <ArrowUp size={14} className="text-accent-green" />;
    if (trend < 0) return <ArrowDown size={14} className="text-red-400" />;
    return <Minus size={14} className="text-text-muted" />;
  };

  const getRowBg = (rank) => {
    if (rank === 1) return 'bg-amber-500/10 border-amber-500/20';
    if (rank === 2) return 'bg-gray-400/5 border-gray-400/10';
    if (rank === 3) return 'bg-orange-700/10 border-orange-700/15';
    return 'bg-white/[0.02] border-white/[0.04]';
  };

  return (
    <div className="glass-card-static p-4">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={18} className="text-accent-amber" />
        <h3 className="font-heading font-semibold text-white">Leaderboard</h3>
      </div>

      {leaderboard.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-8">No scores yet</p>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((row) => (
            <div
              key={row.playerId}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-500 ${getRowBg(row.rank)}`}
            >
              <div className="w-12 text-center">{getRankBadge(row.rank)}</div>

              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: row.playerColor || '#3b82f6' }}
              />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{row.playerName}</p>
                {row.wdl && (
                  <p className="text-xs text-text-muted">
                    {row.wdl.W}W {row.wdl.D}D {row.wdl.L}L
                  </p>
                )}
              </div>

              {/* Attribute columns for attribute-based games */}
              {template.scoringType === 'attribute' && row.attributes && (
                <div className="hidden md:flex gap-3">
                  {template.scoreFields.map((field) => (
                    <div key={field.key} className="text-center min-w-[40px]">
                      <p className="text-xs text-text-muted">{field.label}</p>
                      <p className="text-sm text-white">
                        {field.type === 'boolean'
                          ? (row.attributes[field.key] ? 'Y' : 'N')
                          : (row.attributes[field.key] ?? 0)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-right min-w-[60px]">
                <p className="text-lg font-bold text-white">{row.score}</p>
              </div>

              <div className="w-6">{getTrendIcon(row.trend)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
