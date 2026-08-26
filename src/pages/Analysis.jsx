import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, Layers, Coins, TrendingUp, Trophy, Loader2,
  Activity, Award, Clock,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

import { api } from '../services/api';

/**
 * Analysis dashboard.
 *
 * Ported from the standalone analytics page, minus everything it had to ask
 * for: it prompted for a scoreboard id in the query string and carried its own
 * API base and connection indicator. All three are already known here — the
 * board comes from the route, the API base is discovered, and the app has one
 * connection status. So the inputs are gone and the panels are the same.
 *
 * Every number below comes from GET /api/scoreboards/{id}/analysis. Nothing is
 * re-totalled or re-ranked in the browser.
 */

const PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

const colourFor = (index) => PALETTE[index % PALETTE.length];

const num = (value, fallback = '—') =>
  value === null || value === undefined || Number.isNaN(value) ? fallback : value;

const initials = (name) =>
  String(name || '?')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function Panel({ title, subtitle, right, children, className = '' }) {
  return (
    <div className={`glass-card-static p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-[11px] text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent }) {
  return (
    <div className="glass-card-static p-4 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${accent}1f` }}
      >
        <Icon size={18} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-text-muted truncate">{label}</p>
        <p className="font-heading text-2xl font-bold text-white tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export default function Analysis() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [syncedAt, setSyncedAt] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const body = await api.analysis(id);
        if (cancelled) return;
        // The route nests everything under `analysis`; accept a flat body too.
        setData(body.analysis || body);
        setSyncedAt(new Date());
        setError('');
      } catch (e) {
        if (cancelled) return;
        setError(e.message || 'Could not load the analysis.');
      } finally {
        firstLoad.current = false;
      }
    };

    load();
    // Same cadence the rest of the app polls at — this backend has no push channel.
    const timer = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  const players = data?.players || [];
  const leaderboard = data?.leaderboard || [];
  const roundNumbers = data?.roundNumbers || [];
  const achievements = data?.achievements || [];
  const timeline = data?.timeline || [];
  const scoreboard = data?.scoreboard;

  const colourById = useMemo(() => {
    const map = {};
    // Colour by board order so a player keeps their colour as ranks change.
    leaderboard
      .map((r) => r.playerId)
      .sort((a, b) => a - b)
      .forEach((playerId, i) => {
        map[playerId] = colourFor(i);
      });
    return map;
  }, [leaderboard]);

  useEffect(() => {
    if (!selectedId && players.length) setSelectedId(players[0].playerId);
  }, [players, selectedId]);

  const selected = players.find((p) => String(p.playerId) === String(selectedId));
  const leader = leaderboard[0] || null;
  const leaderGap =
    leaderboard.length > 1 ? (leaderboard[0].score ?? 0) - (leaderboard[1].score ?? 0) : 0;
  const totalPoints = leaderboard.reduce((sum, r) => sum + (r.score ?? 0), 0);

  // One row per round, one key per player — what the chart plots.
  const chartRows = useMemo(
    () =>
      roundNumbers.map((round, i) => {
        const row = { round: `R${round}` };
        for (const p of players) row[p.name] = p.cumulative?.[i] ?? null;
        return row;
      }),
    [roundNumbers, players]
  );

  const toggleSeries = (name) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  if (error && !data) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-white font-medium mb-2">Couldn't load the analysis.</p>
        <p className="text-text-muted text-sm mb-6">{error}</p>
        <button
          onClick={() => navigate(`/games/${id}`)}
          className="px-5 py-2.5 bg-accent-blue hover:bg-accent-blue/90 rounded-lg text-white text-sm transition-all"
        >
          Back to the board
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-text-muted">
        <Loader2 size={18} className="animate-spin" /> Loading analysis…
      </div>
    );
  }

  const nothingYet = roundNumbers.length === 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={() => navigate(`/games/${id}`)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft size={13} /> Back to the board
          </button>
          <p className="text-[11px] uppercase tracking-widest text-accent-blue mb-1">
            {scoreboard?.status === 'ENDED' ? 'Final analysis' : 'Live game'}
          </p>
          <h1 className="font-heading text-2xl font-bold text-white truncate">
            {scoreboard?.name || 'Board'}
          </h1>
          <p className="text-text-muted text-sm flex items-center gap-2 flex-wrap mt-1">
            <span>{scoreboard?.status || '—'}</span>
            <span>·</span>
            <span>Round {scoreboard?.currentRound ?? 0}</span>
            <span>·</span>
            <span>
              Synced {syncedAt ? syncedAt.toLocaleTimeString() : '—'}
            </span>
          </p>
        </div>

        {leader && (
          <div className="glass-card-static px-5 py-4 min-w-[200px]">
            <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">
              {scoreboard?.status === 'ENDED' ? 'Winner' : 'Current leader'}
            </p>
            <p className="font-heading text-xl font-bold text-white truncate flex items-center gap-2">
              <Trophy size={16} className="text-accent-amber flex-shrink-0" />
              {leader.name}
            </p>
            <p className="text-sm text-accent-amber tabular-nums">{leader.score} points</p>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Players" value={leaderboard.length} accent="#3b82f6" />
        <Kpi icon={Layers} label="Rounds played" value={roundNumbers.length} accent="#22c55e" />
        <Kpi icon={Coins} label="Total points" value={totalPoints} accent="#f59e0b" />
        <Kpi icon={TrendingUp} label="Leader gap" value={`${leaderGap} pts`} accent="#a855f7" />
      </div>

      {nothingYet && (
        <div className="glass-card-static p-8 text-center">
          <Activity size={28} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary text-sm">
            No rounds have been scored yet — the analysis fills in as the game is played.
          </p>
        </div>
      )}

      {/* Leaderboard + insight */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          title="Leaderboard"
          subtitle="Ranked by the backend"
          right={
            scoreboard?.status !== 'ENDED' && (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-accent-green/10 text-accent-green text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" /> LIVE
              </span>
            )
          }
        >
          <div className="space-y-1.5">
            {leaderboard.map((row) => {
              const active = String(row.playerId) === String(selectedId);
              return (
                <button
                  key={row.playerId}
                  onClick={() => setSelectedId(row.playerId)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
                    active
                      ? 'bg-white/[0.07] border-white/15'
                      : 'bg-white/[0.02] border-transparent hover:bg-white/[0.05]'
                  }`}
                >
                  <span
                    className={`w-6 text-center font-bold text-sm ${
                      row.rank === 1 ? 'gold-rank'
                      : row.rank === 2 ? 'silver-rank'
                      : row.rank === 3 ? 'bronze-rank'
                      : 'text-text-muted'
                    }`}
                  >
                    {row.rank}
                  </span>
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: colourById[row.playerId] }}
                  >
                    {initials(row.name)}
                  </span>
                  <span className="flex-1 text-white text-sm truncate">{row.name}</span>
                  <span className="text-[11px] text-text-muted tabular-nums">
                    {row.roundsPlayed}r
                  </span>
                  <span className="font-heading font-bold text-white tabular-nums">{row.score}</span>
                </button>
              );
            })}
            {leaderboard.length === 0 && (
              <p className="text-text-muted text-sm text-center py-6">No players yet.</p>
            )}
          </div>
        </Panel>

        <Panel title="Player insight" subtitle="Pick anyone on the leaderboard">
          {selected ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: colourById[selected.playerId] }}
                >
                  {initials(selected.name)}
                </span>
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">{selected.name}</p>
                  <p className="text-[11px] text-text-muted">
                    Rank {selected.rank} · {selected.total} points
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['Average', num(selected.average)],
                  ['Best round', num(selected.bestRound)],
                  ['Worst round', num(selected.worstRound)],
                  ['Consistency', num(selected.consistency)],
                  ['Last round', num(selected.lastRound)],
                  [
                    'Trend',
                    selected.trend === null || selected.trend === undefined ? '—'
                      : selected.trend > 0 ? `+${selected.trend}`
                      : String(selected.trend),
                  ],
                  ['Gap to leader', selected.gapToLeader === 0 ? 'Leader' : `${selected.gapToLeader} pts`],
                  ['Rounds played', num(selected.roundsPlayed)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white/[0.03] rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-text-muted leading-tight">{label}</p>
                    <p
                      className={`font-heading font-bold tabular-nums mt-0.5 ${
                        label === 'Trend' && typeof value === 'string' && value.startsWith('+')
                          ? 'text-accent-green'
                          : label === 'Trend' && typeof value === 'string' && value.startsWith('-')
                          ? 'text-red-400'
                          : 'text-white'
                      }`}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-text-muted mt-3">
                Consistency is the spread of their round scores — lower is steadier.
              </p>
            </>
          ) : (
            <p className="text-text-muted text-sm text-center py-10">No player data yet.</p>
          )}
        </Panel>
      </div>

      {/* Progression */}
      <Panel
        title="Score progression"
        subtitle="Running total after each round"
        right={
          <div className="flex flex-wrap gap-1.5 justify-end">
            {players.map((p) => (
              <button
                key={p.playerId}
                onClick={() => toggleSeries(p.name)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] transition-opacity ${
                  hidden.has(p.name) ? 'opacity-35' : 'opacity-100'
                }`}
                style={{ backgroundColor: `${colourById[p.playerId]}1f`, color: colourById[p.playerId] }}
                title={hidden.has(p.name) ? 'Show' : 'Hide'}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: colourById[p.playerId] }}
                />
                {p.name}
              </button>
            ))}
          </div>
        }
      >
        {chartRows.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-16">
            The chart appears once a round has been scored.
          </p>
        ) : (
          <div className="h-[320px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="round"
                  stroke="#555"
                  tick={{ fill: '#888', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                />
                <YAxis
                  stroke="#555"
                  tick={{ fill: '#888', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    background: '#12121f',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600 }}
                />
                {players
                  .filter((p) => !hidden.has(p.name))
                  .map((p) => (
                    <Line
                      key={p.playerId}
                      type="monotone"
                      dataKey={p.name}
                      stroke={colourById[p.playerId]}
                      strokeWidth={2}
                      dot={{ r: 2.5, strokeWidth: 0, fill: colourById[p.playerId] }}
                      activeDot={{ r: 4 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      {/* Achievements + timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          title="Achievements"
          subtitle="Earned during this game"
          right={
            <span className="px-2 py-0.5 rounded-full bg-white/5 text-text-secondary text-[11px] tabular-nums">
              {achievements.length}
            </span>
          }
        >
          {achievements.length === 0 ? (
            <div className="text-center py-10">
              <Award size={26} className="text-text-muted mx-auto mb-2" />
              <p className="text-text-muted text-sm">
                Nothing earned yet — badges appear once people start scoring.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {achievements.map((a) => (
                <div
                  key={a.code}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]"
                >
                  <span className="text-lg leading-none flex-shrink-0">{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{a.label}</p>
                    <p className="text-[11px] text-text-muted truncate">{a.detail}</p>
                  </div>
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 truncate max-w-[90px]"
                    style={{
                      backgroundColor: `${colourById[a.playerId] || '#3b82f6'}22`,
                      color: colourById[a.playerId] || '#3b82f6',
                    }}
                  >
                    {a.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Game timeline" subtitle="Lead changes and key moments">
          {timeline.length === 0 ? (
            <div className="text-center py-10">
              <Clock size={26} className="text-text-muted mx-auto mb-2" />
              <p className="text-text-muted text-sm">The story starts after round one.</p>
            </div>
          ) : (
            <div className="relative pl-5">
              <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
              <div className="space-y-3">
                {timeline.map((event, i) => (
                  <div key={`${event.round}-${i}`} className="relative">
                    <span
                      className="absolute -left-5 top-1.5 w-[9px] h-[9px] rounded-full border-2 border-[#0f0f1a]"
                      style={{ backgroundColor: colourById[event.leaderId] || '#3b82f6' }}
                    />
                    <p className="text-[10px] uppercase tracking-wide text-text-muted">
                      Round {event.round} · {event.type.replace(/_/g, ' ').toLowerCase()}
                    </p>
                    <p className="text-sm text-white leading-snug">{event.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
