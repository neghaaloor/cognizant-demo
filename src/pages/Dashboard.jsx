import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gamepad2,
  Trophy,
  Users,
  History,
  ArrowRight,
  TrendingUp,
  Target,
  Award,
} from 'lucide-react';
import { getUser, getGames, getPlayers } from '../services/storageService';
import useStore from '../hooks/useStore';

export default function Dashboard() {
  useStore();
  const navigate = useNavigate();
  const user = getUser();
  const games = getGames();
  const players = getPlayers();

  const completedGames = games.filter((g) => g.status === 'completed');
  const totalWins = completedGames.filter((g) => g.winner === user?.name).length;
  const winRate = completedGames.length > 0
    ? Math.round((totalWins / completedGames.length) * 100)
    : 0;

  const recentGames = games.slice(0, 5);

  const actionCards = [
    {
      title: 'Start Game',
      description: 'Create a new game session',
      icon: Gamepad2,
      color: 'text-accent-blue',
      bg: 'bg-accent-blue/10',
      border: 'border-accent-blue/20',
      to: '/games/new',
    },
    {
      title: 'Tournaments',
      description: 'Create or view tournaments',
      icon: Trophy,
      color: 'text-accent-amber',
      bg: 'bg-accent-amber/10',
      border: 'border-accent-amber/20',
      to: '/tournaments',
    },
    {
      title: 'Players',
      description: 'Manage player profiles',
      icon: Users,
      color: 'text-accent-green',
      bg: 'bg-accent-green/10',
      border: 'border-accent-green/20',
      to: '/players',
    },
    {
      title: 'Game History',
      description: 'View past games',
      icon: History,
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
      border: 'border-purple-400/20',
      to: '/history',
    },
  ];

  const stats = [
    { label: 'Total Games', value: games.length, icon: Target, color: 'text-accent-blue' },
    { label: 'Players', value: players.length, icon: Users, color: 'text-accent-green' },
    { label: 'Win Rate', value: `${winRate}%`, icon: TrendingUp, color: 'text-accent-amber' },
    { label: 'Wins', value: totalWins, icon: Award, color: 'text-purple-400' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="font-heading text-3xl font-bold text-white">
          Welcome back, {user?.name || 'Player'}!
        </h1>
        <p className="text-text-secondary mt-1">Ready for another game?</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={16} className={stat.color} />
              <span className="text-xs text-text-muted">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {actionCards.map((card) => (
          <button
            key={card.title}
            onClick={() => navigate(card.to)}
            className={`glass-card p-6 text-left group ${card.border} border`}
          >
            <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center mb-4`}>
              <card.icon size={24} className={card.color} />
            </div>
            <h3 className="font-heading font-semibold text-white mb-1">{card.title}</h3>
            <p className="text-sm text-text-muted">{card.description}</p>
            <ArrowRight
              size={16}
              className="mt-3 text-text-muted group-hover:text-white group-hover:translate-x-1 transition-all"
            />
          </button>
        ))}
      </div>

      {/* Recent Games */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-xl font-semibold text-white">Recent Games</h2>
          {games.length > 0 && (
            <button
              onClick={() => navigate('/history')}
              className="text-sm text-accent-blue hover:underline"
            >
              View all
            </button>
          )}
        </div>

        {recentGames.length === 0 ? (
          <div className="glass-card-static p-12 text-center">
            <Gamepad2 size={40} className="text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary">No games yet. Start your first game!</p>
            <button
              onClick={() => navigate('/games/new')}
              className="mt-4 px-4 py-2 bg-accent-blue rounded-lg text-white text-sm hover:bg-accent-blue/90 transition-colors"
            >
              Start Game
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {recentGames.map((game) => (
              <button
                key={game.id}
                onClick={() => navigate(game.status === 'active' ? `/games/${game.id}` : '/history')}
                className="w-full glass-card p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      game.status === 'active' ? 'bg-accent-green animate-pulse' : 'bg-text-muted'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{game.name}</p>
                    <p className="text-xs text-text-muted">
                      {game.templateName} - {game.players?.length || 0} players
                      {game.status === 'active' && ' - In Progress'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-text-muted">
                    {new Date(game.createdAt).toLocaleDateString()}
                  </p>
                  {game.winner && (
                    <p className="text-xs text-accent-amber mt-1">Winner: {game.winner}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
