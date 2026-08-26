import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Trophy, Plus, Calendar, Users, Gamepad2, ArrowRight, X, Loader2,
  Flag, ChevronDown, ChevronUp, Play,
} from 'lucide-react';

import boardTypes from '../boards/boardTypes';
import {
  getTournaments, loadTournaments, createTournament, addTournamentGame,
  setTournamentStatus, deleteTournament,
} from '../services/storageService';
import useStore from '../hooks/useStore';

/**
 * Tournaments — a roster playing a series of boards.
 *
 * The standings come from the backend, which aggregates the real games rather
 * than keeping a second copy of the scores.
 */
export default function Tournaments() {
  const navigate = useNavigate();
  const location = useLocation();
  useStore();

  const tournaments = getTournaments();
  const [creating, setCreating] = useState(location.pathname === '/tournaments/new');
  const [form, setForm] = useState({ name: '', boardId: '', playerNames: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  const boards = boardTypes.filter((b) => b.tournamentSupported);

  useEffect(() => {
    loadTournaments()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const roster = form.playerNames
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  const canCreate = form.name.trim() && form.boardId && roster.length >= 2;

  const handleCreate = async () => {
    if (!canCreate || busy) return;
    setBusy(true);
    setError('');
    try {
      const board = boards.find((b) => b.id === form.boardId);
      const created = await createTournament({
        name: form.name.trim(),
        boardId: form.boardId,
        boardName: board?.name,
        players: roster,
      });
      setCreating(false);
      setForm({ name: '', boardId: '', playerNames: '' });
      setExpanded(created.id);
    } catch (e) {
      setError(e.message || 'Could not create the tournament.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddGame = async (id) => {
    setBusy(true);
    setError('');
    try {
      const board = await addTournamentGame(id);
      navigate(`/games/${board.id}`);
    } catch (e) {
      setError(e.message || 'Could not start the next game.');
      setBusy(false);
    }
  };

  const handleEnd = async (id) => {
    if (!window.confirm('Finish this tournament? No more games can be added.')) return;
    setBusy(true);
    try {
      await setTournamentStatus(id, 'ENDED');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this tournament? Its games are kept.')) return;
    try {
      await deleteTournament(id);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Trophy size={24} className="text-accent-amber" />
          <h1 className="font-heading text-2xl font-bold text-white">Tournaments</h1>
        </div>
        <button
          onClick={() => { setCreating((v) => !v); setError(''); }}
          className="flex items-center gap-1 px-3 py-2 bg-accent-amber/20 text-accent-amber rounded-lg hover:bg-accent-amber/30 transition-all text-sm"
        >
          {creating ? <X size={14} /> : <Plus size={14} />}
          {creating ? 'Cancel' : 'New tournament'}
        </button>
      </div>
      <p className="text-text-muted text-sm mb-6">
        One roster, a series of games. Standings add up across every game played.
      </p>

      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Create */}
      {creating && (
        <div className="glass-card-static p-6 mb-6 space-y-4 max-w-lg">
          <h3 className="font-heading text-lg font-semibold text-white">New tournament</h3>

          <div>
            <label className="block text-sm text-text-secondary mb-2">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Friday Night League"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-accent-blue/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-2">Board type</label>
            <select
              value={form.boardId}
              onChange={(e) => setForm((f) => ({ ...f, boardId: e.target.value }))}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-accent-blue/50 transition-all"
            >
              <option value="" className="bg-dark-bg">Choose how each game is scored…</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id} className="bg-dark-bg">
                  {b.name} — {b.tagline}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-2">
              Players <span className="text-text-muted">(comma separated)</span>
            </label>
            <input
              type="text"
              value={form.playerNames}
              onChange={(e) => setForm((f) => ({ ...f, playerNames: e.target.value }))}
              placeholder="Alice, Bob, Cara"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-accent-blue/50 transition-all"
            />
            <p className="text-[11px] text-text-muted mt-1.5">
              {roster.length === 0
                ? 'At least two players.'
                : `${roster.length} player${roster.length === 1 ? '' : 's'}: ${roster.join(', ')}`}
            </p>
          </div>

          <button
            onClick={handleCreate}
            disabled={!canCreate || busy}
            className="flex items-center gap-2 px-6 py-3 bg-accent-amber hover:bg-accent-amber/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-black font-medium transition-all"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            {busy ? 'Creating…' : 'Create tournament'}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-text-muted text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading tournaments…
        </div>
      ) : tournaments.length === 0 && !creating ? (
        <div className="glass-card-static p-12 text-center">
          <Trophy size={40} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">No tournaments yet.</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 px-4 py-2 bg-accent-amber/20 text-accent-amber rounded-lg text-sm hover:bg-accent-amber/30 transition-colors"
          >
            Create your first tournament
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => {
            const open = expanded === t.id;
            const played = t.games?.length || t.gameCount || 0;
            return (
              <div key={t.id} className="glass-card overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      onClick={() => setExpanded(open ? null : t.id)}
                      className="text-left flex-1 min-w-0"
                    >
                      <h3 className="font-heading font-semibold text-white truncate">{t.name}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-text-muted flex-wrap">
                        <span className="flex items-center gap-1">
                          <Gamepad2 size={10} /> {t.boardName || t.boardId}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users size={10} /> {t.players.length} players
                        </span>
                        <span className="flex items-center gap-1">
                          <Trophy size={10} /> {played} {played === 1 ? 'game' : 'games'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          {new Date(`${t.createdAt}Z`).toLocaleDateString()}
                        </span>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`text-[11px] px-2 py-1 rounded-full ${
                          t.status === 'ACTIVE'
                            ? 'bg-accent-green/20 text-accent-green'
                            : 'bg-white/5 text-text-muted'
                        }`}
                      >
                        {t.status === 'ACTIVE' ? 'Active' : 'Finished'}
                      </span>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-text-muted hover:text-red-400 transition-colors p-1"
                        title="Delete tournament"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => setExpanded(open ? null : t.id)}
                        className="text-text-muted hover:text-white transition-colors p-1"
                        title={open ? 'Collapse' : 'Expand'}
                      >
                        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Standings */}
                  <div className="mt-4 space-y-1">
                    {(t.standings || []).slice(0, open ? undefined : 3).map((row) => (
                      <div
                        key={row.name}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] text-sm"
                      >
                        <span
                          className={`w-5 text-center font-bold text-xs ${
                            row.rank === 1 ? 'gold-rank'
                            : row.rank === 2 ? 'silver-rank'
                            : row.rank === 3 ? 'bronze-rank'
                            : 'text-text-muted'
                          }`}
                        >
                          {row.rank}
                        </span>
                        <span className="flex-1 text-white truncate">{row.name}</span>
                        {row.wins > 0 && (
                          <span className="text-[11px] text-accent-amber tabular-nums">
                            {row.wins}W
                          </span>
                        )}
                        <span className="text-[11px] text-text-muted tabular-nums">
                          {row.gamesPlayed}g
                        </span>
                        <span className="font-heading font-bold text-white tabular-nums w-12 text-right">
                          {row.points}
                        </span>
                      </div>
                    ))}
                    {!open && (t.standings?.length || 0) > 3 && (
                      <button
                        onClick={() => setExpanded(t.id)}
                        className="text-[11px] text-text-muted hover:text-white pl-3 pt-1"
                      >
                        +{t.standings.length - 3} more
                      </button>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="px-5 pb-5 border-t border-white/5 pt-4">
                    {/* Games */}
                    {played > 0 && (
                      <>
                        <p className="text-xs text-text-muted mb-2">Games</p>
                        <div className="space-y-1.5 mb-4">
                          {(t.games || []).map((g, i) => (
                            <button
                              key={g.id}
                              onClick={() => navigate(`/games/${g.id}`)}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-sm text-left"
                            >
                              <span className="text-text-muted text-xs w-14">Game {i + 1}</span>
                              <span className="flex-1 text-white truncate">
                                {g.name || `Game ${i + 1}`}
                              </span>
                              {g.winner && (
                                <span className="text-[11px] text-accent-amber flex items-center gap-1">
                                  <Trophy size={10} /> {g.winner}
                                </span>
                              )}
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full ${
                                  g.status === 'ENDED'
                                    ? 'bg-white/5 text-text-muted'
                                    : 'bg-accent-green/15 text-accent-green'
                                }`}
                              >
                                {g.status === 'ENDED' ? 'done' : 'playing'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {t.status === 'ACTIVE' ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleAddGame(t.id)}
                          disabled={busy}
                          className="flex items-center gap-1.5 px-4 py-2 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-40 rounded-lg text-white text-sm transition-all"
                        >
                          {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                          Start game {played + 1}
                        </button>
                        <button
                          onClick={() => handleEnd(t.id)}
                          disabled={busy}
                          className="flex items-center gap-1.5 px-4 py-2 bg-red-500/15 text-red-400 border border-red-500/25 rounded-lg hover:bg-red-500/25 text-sm transition-all"
                        >
                          <Flag size={14} /> Finish tournament
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">
                        This tournament is finished.
                        {t.standings?.[0] && ` ${t.standings[0].name} came out on top.`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
