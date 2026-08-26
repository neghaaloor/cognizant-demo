import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, RotateCcw, ChevronRight, Tv, X, Minus } from 'lucide-react';

/** ms -> "12:34" (or "1:02:33" when it runs past an hour) */
export function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Elapsed ms including the currently running segment. */
export function elapsedMs(sports) {
  if (!sports) return 0;
  const base = sports.accumulatedMs || 0;
  if (sports.running && sports.startedAt) return base + (Date.now() - sports.startedAt);
  return base;
}

/**
 * Sports Scoreboard — two sides, a game clock and periods,
 * plus a full-screen scorebug for a second screen or a stream.
 */
export default function BoardSports({
  game,
  board,
  ranking,
  onDelta,
  onSet,
  onClockToggle,
  onClockReset,
  onNextPeriod,
  readOnly,
}) {
  const [, setTick] = useState(0);
  const [bug, setBug] = useState(false);

  const cfg = game.config || {};
  const sports = game.sports || {};
  const countDown = cfg.countDown !== false;
  const periodLength = (cfg.periodLength || 720) * 1000;
  const periodCount = cfg.periodCount || 4;
  const periodLabel = cfg.periodLabel || 'Quarter';
  const step = cfg.step || 1;

  // Re-render 4x/second while the clock runs so the display stays smooth.
  useEffect(() => {
    if (!sports.running) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [sports.running]);

  // Escape closes the scorebug.
  useEffect(() => {
    if (!bug) return;
    const onKey = (e) => e.key === 'Escape' && setBug(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bug]);

  const elapsed = elapsedMs(sports);
  const shown = countDown ? Math.max(0, periodLength - elapsed) : elapsed;
  const expired = countDown && elapsed >= periodLength;

  const byId = Object.fromEntries(ranking.map((r) => [r.playerId, r]));
  const sides = game.players.slice(0, 2).map((p) => byId[p.id]).filter(Boolean);
  const [home, away] = sides;

  if (sides.length < 2) {
    return <p className="text-text-muted text-sm text-center py-12">This board needs two teams.</p>;
  }

  const Side = ({ row, align }) => (
    <div className="flex-1 flex flex-col items-center gap-3 min-w-0">
      <div className="flex items-center gap-2 max-w-full">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: row.playerColor }} />
        <p className="font-medium text-white truncate uppercase tracking-wide text-sm">{row.playerName}</p>
      </div>

      <p
        className="font-heading font-bold tabular-nums leading-none text-[clamp(3.5rem,14vw,7rem)]"
        style={{ color: row.playerColor }}
      >
        {row.score}
      </p>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => onDelta(row.playerId, -step)}
            className="w-10 h-10 rounded-lg bg-white/5 hover:bg-red-500/20 text-text-secondary hover:text-red-400 flex items-center justify-center transition-all active:scale-90"
          >
            <Minus size={16} />
          </button>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => onDelta(row.playerId, n)}
              className="w-10 h-10 rounded-lg text-white font-semibold flex items-center justify-center transition-all active:scale-90"
              style={{ backgroundColor: `${row.playerColor}33` }}
            >
              +{n}
            </button>
          ))}
          <button
            onClick={() => {
              const v = window.prompt(`Set ${row.playerName}'s score to:`, String(row.score));
              if (v !== null && !Number.isNaN(Number(v))) onSet(row.playerId, Number(v));
            }}
            className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-white flex items-center justify-center transition-all text-xs"
            title="Set exact score"
          >
            =
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-8">
        {/* Clock */}
        <div className="flex flex-col items-center mb-8">
          <p className="text-[11px] uppercase tracking-widest text-text-muted mb-1">
            {periodLabel} {sports.period || 1} of {periodCount}
          </p>
          <p
            className={`font-heading font-bold tabular-nums leading-none text-[clamp(2.5rem,9vw,4.5rem)] transition-colors ${
              expired ? 'text-red-400' : sports.running ? 'text-white' : 'text-text-secondary'
            }`}
          >
            {formatClock(shown)}
          </p>

          {!readOnly && (
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={onClockToggle}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  sports.running
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-accent-green/20 text-accent-green hover:bg-accent-green/30'
                }`}
              >
                {sports.running ? <><Pause size={15} /> Stop</> : <><Play size={15} /> Start</>}
              </button>
              <button
                onClick={onClockReset}
                className="p-2 rounded-lg bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-all"
                title="Reset clock"
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={onNextPeriod}
                disabled={(sports.period || 1) >= periodCount}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"
                title={`Next ${periodLabel.toLowerCase()}`}
              >
                Next <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setBug(true)}
                className="p-2 rounded-lg bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-all"
                title="Scorebug display"
              >
                <Tv size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Scores */}
        <div className="flex items-start gap-4">
          <Side row={home} />
          <div className="flex flex-col items-center justify-center pt-8">
            <span className="font-heading text-2xl text-text-muted">–</span>
          </div>
          <Side row={away} />
        </div>
      </div>

      {/* Full-screen scorebug — portalled to <body> so the parent card's
          backdrop-filter doesn't become its containing block. */}
      {bug && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6">
          <button
            onClick={() => setBug(false)}
            className="absolute top-5 right-5 text-white/40 hover:text-white transition-colors"
            title="Close (Esc)"
          >
            <X size={26} />
          </button>

          <p className="text-white/40 uppercase tracking-[0.3em] text-xs sm:text-sm mb-6">
            {periodLabel} {sports.period || 1}
          </p>

          <div className="flex items-center justify-center gap-6 sm:gap-14 w-full max-w-5xl">
            {[home, away].map((row, i) => (
              <React.Fragment key={row.playerId}>
                {i === 1 && (
                  <span className="font-heading text-white/20 text-[clamp(2rem,6vw,4rem)] leading-none">–</span>
                )}
                <div className="flex flex-col items-center min-w-0 flex-1">
                  <p
                    className="font-heading font-bold tabular-nums leading-none text-[clamp(4.5rem,22vw,14rem)]"
                    style={{ color: row.playerColor }}
                  >
                    {row.score}
                  </p>
                  <p className="mt-4 text-white uppercase tracking-wider text-[clamp(0.8rem,2.5vw,1.5rem)] truncate max-w-full">
                    {row.playerName}
                  </p>
                </div>
              </React.Fragment>
            ))}
          </div>

          <p
            className={`mt-10 font-heading font-bold tabular-nums leading-none text-[clamp(3rem,12vw,7rem)] ${
              expired ? 'text-red-500' : 'text-white'
            }`}
          >
            {formatClock(shown)}
          </p>

          {!readOnly && (
            <button
              onClick={onClockToggle}
              className={`mt-8 flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                sports.running
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-accent-green/20 text-accent-green hover:bg-accent-green/30'
              }`}
            >
              {sports.running ? <><Pause size={18} /> Stop clock</> : <><Play size={18} /> Start clock</>}
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
