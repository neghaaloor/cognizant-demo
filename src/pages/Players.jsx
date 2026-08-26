import React, { useState } from 'react';
import { Users, Plus, X, Trophy, Target, TrendingUp } from 'lucide-react';
import { getPlayers, getGames } from '../services/storageService';
import useStore from '../hooks/useStore';

export default function Players() {
  useStore();
  const players = getPlayers();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const games = getGames();

  const getPlayerStats = (playerName) => {
    const playerGames = games.filter((g) =>
      g.players?.some((p) => p.name.toLowerCase() === playerName.toLowerCase())
    );
    const completedGames = playerGames.filter((g) => g.status === 'completed');
    const wins = completedGames.filter((g) => g.winner?.toLowerCase() === playerName.toLowerCase()).length;

    return {
      gamesPlayed: playerGames.length,
      wins,
      winRate: completedGames.length > 0 ? Math.round((wins / completedGames.length) * 100) : 0,
    };
  };

  // Players belong to a board on the server, so this screen is a read-only
  // roll-up of everyone across your boards rather than a global roster.
  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (players.find((p) => p.name.toLowerCase() === name.toLowerCase())) return;

    const player = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
      createdAt: Date.now(),
    };
    setNewName('');
    setShowAdd(false);
  };

  const handleDelete = () => {};

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users size={24} className="text-accent-green" />
          <h1 className="font-heading text-2xl font-bold text-white">Players</h1>
          <span className="text-text-muted text-sm">({players.length})</span>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 px-3 py-2 bg-accent-blue/20 text-accent-blue rounded-lg hover:bg-accent-blue/30 transition-all text-sm"
        >
          <Plus size={14} /> Add Player
        </button>
      </div>

      {/* Add player form */}
      {showAdd && (
        <div className="glass-card-static p-4 mb-6 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Player name"
            autoFocus
            className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-accent-blue/50 transition-all"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-40 rounded-lg text-white transition-all"
          >
            Add
          </button>
          <button
            onClick={() => setShowAdd(false)}
            className="px-3 py-2 bg-white/5 text-text-muted hover:text-white rounded-lg transition-all"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Player list */}
        <div className="lg:col-span-2 space-y-2">
          {players.length === 0 ? (
            <div className="glass-card-static p-12 text-center">
              <Users size={40} className="text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No players yet. Add some players or start a game!</p>
            </div>
          ) : (
            players.map((player) => {
              const stats = getPlayerStats(player.name);
              return (
                <div
                  key={player.id}
                  className={`w-full glass-card p-4 flex items-center gap-4 ${
                    selectedPlayer?.id === player.id ? 'border-accent-blue/30' : ''
                  }`}
                >
                  <button
                    onClick={() => setSelectedPlayer(player)}
                    className="flex items-center gap-4 flex-1 min-w-0 text-left"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: player.color || '#3b82f6' }}
                    >
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{player.name}</p>
                      <p className="text-xs text-text-muted">
                        {stats.gamesPlayed} games | {stats.wins} wins
                      </p>
                    </div>
                  </button>
                  {stats.wins > 0 && (
                    <Trophy size={14} className="text-accent-amber flex-shrink-0" />
                  )}
                  <button
                    onClick={() => handleDelete(player.id)}
                    className="text-text-muted hover:text-red-400 transition-colors p-1 flex-shrink-0"
                    title={`Remove ${player.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Player detail */}
        <div>
          {selectedPlayer ? (
            <div className="glass-card-static p-6 sticky top-8">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4"
                style={{ backgroundColor: selectedPlayer.color || '#3b82f6' }}
              >
                {selectedPlayer.name.charAt(0).toUpperCase()}
              </div>
              <h3 className="font-heading text-lg font-semibold text-white text-center mb-4">
                {selectedPlayer.name}
              </h3>

              {(() => {
                const stats = getPlayerStats(selectedPlayer.name);
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-white/[0.03] rounded-lg">
                      <span className="text-sm text-text-muted flex items-center gap-2">
                        <Target size={14} /> Games Played
                      </span>
                      <span className="text-white font-medium">{stats.gamesPlayed}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/[0.03] rounded-lg">
                      <span className="text-sm text-text-muted flex items-center gap-2">
                        <Trophy size={14} /> Wins
                      </span>
                      <span className="text-accent-amber font-medium">{stats.wins}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/[0.03] rounded-lg">
                      <span className="text-sm text-text-muted flex items-center gap-2">
                        <TrendingUp size={14} /> Win Rate
                      </span>
                      <span className="text-accent-green font-medium">{stats.winRate}%</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="glass-card-static p-8 text-center">
              <p className="text-text-muted text-sm">Select a player to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
