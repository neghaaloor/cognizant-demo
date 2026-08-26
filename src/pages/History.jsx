import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Trash2, Trophy, Calendar, Users, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { getGames, deleteGame } from '../services/storageService';
import useStore from '../hooks/useStore';
import gameTemplates from '../templates/gameTemplates';
import { resolveBoard } from '../boards/boardTypes';
import { calculatePlayerTotal } from '../engines/scoringEngine';

export default function History() {
  const navigate = useNavigate();
  useStore();
  const games = getGames();
  const [expandedId, setExpandedId] = useState(null);

  const completedGames = games.filter((g) => g.status === 'completed');
  const activeGames = games.filter((g) => g.status === 'active');

  const handleDelete = (e, gameId) => {
    e.stopPropagation();
    if (!window.confirm('Delete this board? This cannot be undone.')) return;
    deleteGame(gameId).catch((err) => window.alert(err.message));
  };

  const toggleExpand = (gameId) => {
    setExpandedId(expandedId === gameId ? null : gameId);
  };

  const renderGameCard = (game) => {
    const template = resolveBoard(game, gameTemplates);
    const isExpanded = expandedId === game.id;

    // The backend already ranks and totals — use its order rather than
    // re-deriving it here (and getting zeros when the list has no round detail).
    const colourOf = (playerId) =>
      game.players?.find((p) => p.id === playerId)?.color || '#3b82f6';

    let finalScores = [];
    if (game.leaderboard?.length) {
      finalScores = game.leaderboard.map((row) => ({
        name: row.name,
        color: colourOf(row.playerId),
        total: row.score,
        rank: row.rank,
      }));
    } else if (template && game.players) {
      finalScores = game.players.map((p) => ({
        name: p.name,
        color: p.color,
        total: calculatePlayerTotal(template, game.scores?.[p.id] || []),
      }));
      const ascending = template.scoringRules?.highestWins === false;
      finalScores.sort((a, b) => (ascending ? a.total - b.total : b.total - a.total));
    }

    return (
      <div key={game.id} className="glass-card overflow-hidden">
        <div className="w-full p-4 flex items-center justify-between">
          <button
            onClick={() => toggleExpand(game.id)}
            className="flex items-center gap-4 flex-1 min-w-0 text-left"
          >
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                game.status === 'active' ? 'bg-accent-green animate-pulse' : 'bg-text-muted'
              }`}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{game.name}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-text-muted flex items-center gap-1">
                  <Calendar size={10} />
                  {new Date(game.createdAt).toLocaleDateString()}
                </span>
                <span className="text-xs text-text-muted flex items-center gap-1">
                  <Users size={10} />
                  {game.players?.length || 0}
                </span>
                <span className="text-xs text-text-muted">{game.templateName}</span>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-3 flex-shrink-0">
            {game.winner && (
              <span className="text-xs text-accent-amber flex items-center gap-1">
                <Trophy size={12} /> {game.winner}
              </span>
            )}
            {!game.winner && game.tie && (
              <span className="text-xs text-accent-blue flex items-center gap-1">
                <Trophy size={12} /> Tie
              </span>
            )}
            {game.status === 'completed' && (
              <span className="text-xs text-text-muted tabular-nums hidden sm:inline">
                {game.roundsPlayed || 0} {game.roundsPlayed === 1 ? 'round' : 'rounds'}
              </span>
            )}
            {game.status === 'active' && (
              <button
                onClick={() => navigate(`/games/${game.id}`)}
                className="px-3 py-1 bg-accent-green/20 text-accent-green rounded text-xs hover:bg-accent-green/30 transition-all"
              >
                Resume
              </button>
            )}
            <button
              onClick={(e) => handleDelete(e, game.id)}
              className="text-text-muted hover:text-red-400 transition-colors p-1"
              title="Delete board"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => toggleExpand(game.id)}
              className="text-text-muted hover:text-white transition-colors p-1"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-white/5 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-text-muted">Final Scores</p>
              <button
                onClick={() => navigate(`/games/${game.id}/analysis`)}
                className="flex items-center gap-1 text-xs text-accent-blue hover:underline"
              >
                <BarChart3 size={12} /> Analysis
              </button>
            </div>
            <div className="space-y-1">
              {finalScores.map((ps, idx) => (
                <div
                  key={ps.name}
                  className="flex items-center gap-2 py-1"
                >
                  <span className={`text-xs font-bold w-6 ${
                    idx === 0 ? 'gold-rank' : idx === 1 ? 'silver-rank' : idx === 2 ? 'bronze-rank' : 'text-text-muted'
                  }`}>
                    #{ps.rank ?? idx + 1}
                  </span>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ps.color }} />
                  <span className="text-sm text-white flex-1">{ps.name}</span>
                  <span className="text-sm text-text-secondary font-medium">{ps.total}</span>
                </div>
              ))}
            </div>
            {game.currentRound > 0 && (
              <p className="text-xs text-text-muted mt-2">
                Rounds played: {game.currentRound}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <HistoryIcon size={24} className="text-accent-blue" />
        <h1 className="font-heading text-2xl font-bold text-white">Your History</h1>
      </div>
      <p className="text-text-muted text-sm -mt-4 mb-6">
        Only boards you created. Other people's boards never appear here.
      </p>

      {games.length === 0 ? (
        <div className="glass-card-static p-12 text-center">
          <HistoryIcon size={40} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">You haven't created any boards yet.</p>
          <button
            onClick={() => navigate('/games/new')}
            className="mt-4 px-4 py-2 bg-accent-blue rounded-lg text-white text-sm hover:bg-accent-blue/90 transition-colors"
          >
            Create a board
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeGames.length > 0 && (
            <div>
              <h2 className="text-sm text-accent-green font-medium mb-2">Active Games</h2>
              <div className="space-y-2">
                {activeGames.map(renderGameCard)}
              </div>
            </div>
          )}

          {completedGames.length > 0 && (
            <div>
              <h2 className="text-sm text-text-muted font-medium mb-2 mt-6">Completed Games</h2>
              <div className="space-y-2">
                {completedGames.map(renderGameCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
