import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Undo2, Flag, BarChart3, Trophy, X, RotateCcw, ArrowLeft, Loader2, LineChart } from 'lucide-react';

import {
  getGameById, loadGame, startPolling, stopPolling,
  writeScore, addRound as addRoundApi, endGame as endGameApi,
  resetGame as resetGameApi, saveBoardState, isRunningBoard,
} from '../services/storageService';
import useStore from '../hooks/useStore';
import gameTemplates from '../templates/gameTemplates';
import { getBoard, resolveBoard } from '../boards/boardTypes';
import { determineRanking, calculateRoundTotal } from '../engines/scoringEngine';
import { generateCommentary, speak } from '../services/commentaryService';
import { answerQuery } from '../services/answers';
import { generateBracket, setMatchWinner, bracketWins, bracketChampion } from '../boards/bracketEngine';

import Leaderboard from '../components/Leaderboard';
import VoiceControl from '../components/VoiceControl';
import CommentaryToggle from '../components/CommentaryToggle';

import BoardLeaderboard from '../boards/BoardLeaderboard';
import BoardScoresheet from '../boards/BoardScoresheet';
import BoardScoreboard from '../boards/BoardScoreboard';
import BoardBracket from '../boards/BoardBracket';
import BoardSports, { elapsedMs } from '../boards/BoardSports';
import BoardCounter from '../boards/BoardCounter';
import BoardLegacy from '../boards/BoardLegacy';

export default function ActiveGame() {
  const { id } = useParams();
  const navigate = useNavigate();

  useStore();
  const game = getGameById(id);

  const [loadState, setLoadState] = useState('loading'); // loading | ready | missing | error
  const [errorText, setErrorText] = useState('');
  const [busy, setBusy] = useState(false);
  const [commentary, setCommentary] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [previousRanking, setPreviousRanking] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [flash, setFlash] = useState('');

  const flashTimer = useRef(null);

  /* ---------------- load + keep fresh ---------------- */

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');

    loadGame(id)
      .then(() => !cancelled && setLoadState('ready'))
      .catch((e) => {
        if (cancelled) return;
        setLoadState(e.code === 'SCOREBOARD_NOT_FOUND' ? 'missing' : 'error');
        setErrorText(e.message);
      });

    // No push channel on this backend — its contract says poll /summary.
    startPolling(id, 3000);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [id]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const board = useMemo(() => (game ? resolveBoard(game, gameTemplates) : null), [game]);
  const isNewBoard = Boolean(game && getBoard(game.boardId));
  const boardId = game?.boardId;
  const readOnly = game?.status === 'completed';
  const running = isRunningBoard(boardId);

  /** The round scores are written into. Running boards keep exactly one. */
  const scoringRoundId = useMemo(() => {
    if (!game?.roundIds?.length) return game?.currentRoundId ?? null;
    return running ? game.roundIds[0] : game.roundIds[game.roundIds.length - 1];
  }, [game, running]);

  const engineScores = useMemo(() => {
    if (!game) return {};
    if (boardId === 'bracket' && game.bracket) {
      const wins = bracketWins(game.bracket);
      return Object.fromEntries(game.players.map((p) => [p.id, [{ score: wins[p.id] || 0 }]]));
    }
    return game.scores || {};
  }, [game, boardId]);

  const ranking = useMemo(
    () => (game && board ? determineRanking(board, game.players, engineScores, previousRanking) : []),
    [game, board, engineScores, previousRanking]
  );

  const notify = useCallback((msg) => {
    setFlash(msg);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(''), 3200);
  }, []);

  /* ---------------- mutation ---------------- */

  const rememberRanking = useCallback(() => {
    if (board && game) setPreviousRanking(determineRanking(board, game.players, engineScores));
  }, [board, game, engineScores]);

  /**
   * Run a server write. `inverse` is what would undo it — the server is the
   * source of truth, so undo replays an opposite write rather than restoring
   * a local snapshot.
   */
  const run = useCallback(
    async (action, inverse) => {
      if (readOnly) return;
      setBusy(true);
      rememberRanking();
      try {
        await action();
        if (inverse) setUndoStack((s) => [...s.slice(-49), inverse]);
      } catch (e) {
        notify(e.message || 'That change could not be saved.');
      } finally {
        setBusy(false);
      }
    },
    [readOnly, rememberRanking, notify]
  );

  const totalFor = useCallback(
    (playerId) => ranking.find((r) => r.playerId === playerId)?.score ?? 0,
    [ranking]
  );

  /** Running boards: nudge by a delta. ADJUST is applied server-side, so
   *  rapid taps cannot race each other into a lost update. */
  const applyDelta = useCallback(
    (playerId, delta) => {
      if (!delta || !scoringRoundId) return;
      run(
        () => writeScore(id, scoringRoundId, playerId, delta, 'ADJUST'),
        { kind: 'adjust', playerId, roundId: scoringRoundId, value: -delta }
      );
    },
    [run, id, scoringRoundId]
  );

  const applySet = useCallback(
    (playerId, value) => {
      if (!scoringRoundId) return;
      const previous = totalFor(playerId);
      run(
        () => writeScore(id, scoringRoundId, playerId, value, 'SET'),
        { kind: 'set', playerId, roundId: scoringRoundId, value: previous }
      );
    },
    [run, id, scoringRoundId, totalFor]
  );

  /** Scoresheet: one cell, addressed by round index. */
  const applyCell = useCallback(
    (playerId, roundIndex, value) => {
      const roundId = game?.roundIds?.[roundIndex];
      if (!roundId) return;
      const previous = game?.scores?.[playerId]?.[roundIndex]?.score ?? 0;
      run(
        () => writeScore(id, roundId, playerId, value, 'SET'),
        { kind: 'set', playerId, roundId, value: previous }
      );
    },
    [run, id, game]
  );

  const addRound = useCallback(() => {
    run(() => addRoundApi(id), null);
  }, [run, id]);

  const undo = useCallback(() => {
    const op = undoStack[undoStack.length - 1];
    if (!op) return;
    setUndoStack((s) => s.slice(0, -1));
    setBusy(true);
    writeScore(id, op.roundId, op.playerId, op.value, op.kind === 'adjust' ? 'ADJUST' : 'SET')
      .catch((e) => notify(e.message))
      .finally(() => setBusy(false));
  }, [undoStack, id, notify]);

  const resetScores = useCallback(() => {
    setUndoStack([]);
    run(() => resetGameApi(id, 'REMATCH'), null);
  }, [run, id]);

  const endGame = useCallback(async () => {
    setBusy(true);
    try {
      const result = await endGameApi(id);
      setShowCelebration(true);
      const name = result.tie
        ? `a tie between ${result.tiedPlayers.map((p) => p.name).join(' and ')}`
        : result.winner?.name;
      if (commentary && name) speak(result.tie ? `It's ${name}!` : `Game over! ${name} wins!`);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }, [id, commentary, notify]);

  /* ---------------- bracket + clock (display state) ---------------- */

  const pickWinner = useCallback(
    (roundIndex, matchIndex, playerId) => {
      if (readOnly || !game?.bracket) return;
      const next = setMatchWinner(game.bracket, roundIndex, matchIndex, playerId);
      saveBoardState(id, { bracket: next }).catch((e) => notify(e.message));
    },
    [readOnly, game, id, notify]
  );

  const reseed = useCallback(() => {
    if (readOnly || !game) return;
    if (!window.confirm('Redraw the bracket? All results so far will be cleared.')) return;
    saveBoardState(id, { bracket: generateBracket(game.players) }).catch((e) => notify(e.message));
  }, [readOnly, game, id, notify]);

  const clockToggle = useCallback(() => {
    if (readOnly || !game) return;
    const s = game.sports || { running: false, startedAt: null, accumulatedMs: 0, period: 1 };
    const next = s.running
      ? { ...s, running: false, accumulatedMs: elapsedMs(s), startedAt: null }
      : { ...s, running: true, startedAt: Date.now() };
    saveBoardState(id, { sports: next }).catch((e) => notify(e.message));
  }, [readOnly, game, id, notify]);

  const clockReset = useCallback(() => {
    if (readOnly || !game) return;
    saveBoardState(id, {
      sports: { ...(game.sports || {}), running: false, startedAt: null, accumulatedMs: 0 },
    }).catch((e) => notify(e.message));
  }, [readOnly, game, id, notify]);

  const nextPeriod = useCallback(() => {
    if (readOnly || !game) return;
    const s = game.sports || {};
    const max = game.config?.periodCount || 4;
    if ((s.period || 1) >= max) return;
    saveBoardState(id, {
      sports: { ...s, period: (s.period || 1) + 1, running: false, startedAt: null, accumulatedMs: 0 },
    }).catch((e) => notify(e.message));
  }, [readOnly, game, id, notify]);

  /* ---------------- voice ---------------- */

  const handleVoiceCommand = useCallback(
    (parsed) => {
      if (!game || !board) return { ok: false, label: 'Board not ready' };

      if (parsed.type === 'QUERY') {
        const answer = answerQuery(parsed.query, { board, boardId, game, ranking });
        speak(answer.text);
        return { ok: true, undoable: false, answer };
      }

      if (readOnly) return { ok: false, label: 'This board is finished' };

      switch (parsed.type) {
        case 'SCORE': {
          if (boardId === 'bracket') {
            return { ok: false, label: 'A bracket is decided by picking winners, not points' };
          }
          const roundIndex = Math.max(0, (game.currentRound || 1) - 1);
          for (const action of parsed.actions) {
            if (running) {
              if (action.op === 'set') applySet(action.playerId, action.value);
              else applyDelta(action.playerId, action.op === 'subtract' ? -action.value : action.value);
            } else {
              const current = game.scores?.[action.playerId]?.[roundIndex]?.score ?? 0;
              const next =
                action.op === 'set' ? action.value
                : action.op === 'subtract' ? current - action.value
                : current + action.value;
              applyCell(action.playerId, roundIndex, next);
            }
          }
          if (commentary) {
            const text = generateCommentary({ ranking, roundNumber: game.currentRound || 1 });
            if (text) speak(text);
          }
          return { ok: true, undoable: true };
        }

        case 'NEXT_ROUND':
          if (running) return { ok: false, label: 'This board has no rounds' };
          addRound();
          return { ok: true, label: 'Round added' };

        case 'UNDO':
          undo();
          return { ok: true, label: 'Undone', undoable: false };

        case 'END_GAME':
          endGame();
          return { ok: true, label: 'Game ended' };

        case 'RESET':
          resetScores();
          return { ok: true, label: 'Scores cleared' };

        case 'START_CLOCK':
        case 'STOP_CLOCK':
          if (boardId !== 'sports') return { ok: false, label: 'No clock on this board' };
          clockToggle();
          return { ok: true, label: parsed.type === 'START_CLOCK' ? 'Clock started' : 'Clock stopped' };

        case 'RESET_CLOCK':
          if (boardId !== 'sports') return { ok: false, label: 'No clock on this board' };
          clockReset();
          return { ok: true, label: 'Clock reset' };

        case 'NEXT_PERIOD':
          if (boardId !== 'sports') return { ok: false, label: 'No periods on this board' };
          nextPeriod();
          return { ok: true, label: 'Next period' };

        default:
          return { ok: false, label: 'Not supported here' };
      }
    },
    [game, board, boardId, running, readOnly, ranking, commentary,
     applySet, applyDelta, applyCell, addRound, undo, endGame, resetScores,
     clockToggle, clockReset, nextPeriod]
  );

  /* ---------------- render ---------------- */

  if (loadState === 'missing') {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-white font-medium mb-2">That board isn't on your account.</p>
        <p className="text-text-muted text-sm mb-6">
          It may have been deleted, or it belongs to someone else.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 bg-accent-blue hover:bg-accent-blue/90 rounded-lg text-white text-sm transition-all"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (loadState === 'error' && !game) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-white font-medium mb-2">Couldn't load this board.</p>
        <p className="text-text-muted text-sm mb-6">{errorText}</p>
        <button
          onClick={() => loadGame(id).then(() => setLoadState('ready')).catch(() => {})}
          className="px-5 py-2.5 bg-accent-blue hover:bg-accent-blue/90 rounded-lg text-white text-sm transition-all"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!game || !board) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-text-muted">
        <Loader2 size={18} className="animate-spin" /> Loading board…
      </div>
    );
  }

  const accent = board.accent || '#3b82f6';
  const showSideLeaderboard = boardId !== 'bracket' && boardId !== 'sports' && game.players.length > 1;

  const boardProps = { game, board, ranking, readOnly, onDelta: applyDelta, onSet: applySet };

  const renderBoard = () => {
    if (!isNewBoard) {
      return <BoardLegacy game={game} board={board} readOnly onCell={() => {}} onAttribute={() => {}} onAddRound={() => {}} />;
    }
    switch (boardId) {
      case 'leaderboard': return <BoardLeaderboard {...boardProps} />;
      case 'scoreboard': return <BoardScoreboard {...boardProps} />;
      case 'counter': return <BoardCounter {...boardProps} />;
      case 'scoresheet':
        return <BoardScoresheet {...boardProps} onCell={applyCell} onAddRound={addRound} onRemoveRound={() => notify('Rounds cannot be removed once scored.')} />;
      case 'bracket':
        return <BoardBracket game={game} board={board} readOnly={readOnly} onPickWinner={pickWinner} onReseed={reseed} />;
      case 'sports':
        return <BoardSports {...boardProps} onClockToggle={clockToggle} onClockReset={clockReset} onNextPeriod={nextPeriod} />;
      default: return <BoardLeaderboard {...boardProps} />;
    }
  };

  const allRoundValues = Object.values(engineScores).flatMap((entries) =>
    (entries || []).map((e) => calculateRoundTotal(board, e))
  );
  const highest = allRoundValues.length ? Math.max(...allRoundValues) : 0;
  const totalPoints = ranking.reduce((sum, r) => sum + r.score, 0);
  const average = ranking.length ? Math.round(totalPoints / ranking.length) : 0;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-white mb-2 transition-colors"
            >
              <ArrowLeft size={13} /> Dashboard
            </button>
            <h1 className="font-heading text-2xl font-bold text-white truncate flex items-center gap-2">
              {game.name}
              {busy && <Loader2 size={15} className="animate-spin text-text-muted flex-shrink-0" />}
            </h1>
            <p className="text-text-muted text-sm flex items-center gap-2 flex-wrap">
              <span style={{ color: accent }}>{board.name}</span>
              <span>·</span>
              <span>{game.players.length} {board.playerNoun?.toLowerCase() || 'player'}s</span>
              {!running && (<><span>·</span><span>Round {game.currentRound || 0}</span></>)}
              {readOnly && (<><span>·</span><span className="text-accent-amber">Completed</span></>)}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <CommentaryToggle enabled={commentary} onToggle={setCommentary} />
            <button onClick={() => setShowStats((v) => !v)} className="p-2.5 rounded-xl bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-all" title="Quick stats">
              <BarChart3 size={17} />
            </button>
            <button
              onClick={() => navigate(`/games/${id}/analysis`)}
              className="p-2.5 rounded-xl bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-all"
              title="Analysis dashboard"
            >
              <LineChart size={17} />
            </button>
            <button onClick={undo} disabled={undoStack.length === 0 || readOnly} className="p-2.5 rounded-xl bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all" title={`Undo${undoStack.length ? ` (${undoStack.length})` : ''}`}>
              <Undo2 size={17} />
            </button>
            {!readOnly && (
              <>
                <button onClick={() => window.confirm('Clear every score on this board?') && resetScores()} className="p-2.5 rounded-xl bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-all" title="Reset scores">
                  <RotateCcw size={17} />
                </button>
                <button onClick={endGame} className="flex items-center gap-1.5 px-4 py-2.5 bg-red-500/15 text-red-400 border border-red-500/25 rounded-xl hover:bg-red-500/25 transition-all text-sm">
                  <Flag size={14} /> End
                </button>
              </>
            )}
          </div>
        </div>

        <div className="glass-card-static p-4">
          <VoiceControl
            players={game.players}
            ranking={ranking}
            defaultStep={game.config?.step || 1}
            onCommand={handleVoiceCommand}
            onUndo={undo}
            disabled={readOnly}
          />
        </div>

        {flash && (
          <div className="px-4 py-2.5 rounded-lg bg-accent-amber/10 border border-accent-amber/25 text-sm text-accent-amber">
            {flash}
          </div>
        )}
      </div>

      {showStats && (
        <div className="glass-card-static p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><p className="text-xs text-text-muted">Leader</p><p className="text-xl font-bold text-accent-green truncate">{ranking[0]?.playerName || '—'}</p></div>
          <div><p className="text-xs text-text-muted">Top score</p><p className="text-xl font-bold text-accent-amber">{ranking[0]?.score ?? 0}</p></div>
          <div><p className="text-xs text-text-muted">Average</p><p className="text-xl font-bold text-accent-blue">{average}</p></div>
          <div>
            <p className="text-xs text-text-muted">{running ? 'Total awarded' : 'Best round'}</p>
            <p className="text-xl font-bold text-white">{running ? totalPoints : highest}</p>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-6 ${showSideLeaderboard ? 'lg:grid-cols-3' : ''}`}>
        <div className={showSideLeaderboard ? 'lg:col-span-2' : ''}>
          <div className="glass-card-static p-4 sm:p-5">{renderBoard()}</div>
        </div>
        {showSideLeaderboard && (
          <div className="lg:col-span-1">
            <Leaderboard template={board} players={game.players} scores={engineScores} previousRanking={previousRanking} />
          </div>
        )}
      </div>

      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="confetti-piece absolute w-3 h-3 rounded-sm"
              style={{
                left: `${(i * 37) % 100}%`, top: `-${(i * 13) % 20}%`,
                backgroundColor: ['#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#8b5cf6'][i % 5],
                animationDelay: `${(i % 10) * 0.2}s`, animationDuration: `${2 + (i % 5) * 0.4}s`,
              }} />
          ))}
          <div className="glass-card p-8 sm:p-10 text-center relative z-10 max-w-md w-full">
            <button onClick={() => setShowCelebration(false)} className="absolute top-4 right-4 text-text-muted hover:text-white"><X size={20} /></button>
            <Trophy size={56} className="text-accent-amber mx-auto mb-4" />
            <h2 className="font-heading text-3xl font-bold text-white mb-1">That's a wrap!</h2>
            <p className="text-xl text-accent-amber font-semibold mb-6">{game.winner ? `${game.winner} wins` : 'Final standings'}</p>
            <div className="space-y-2 mb-6">
              {ranking.slice(0, 3).map((r) => (
                <div key={r.playerId} className="flex items-center justify-between px-4 py-2 rounded-lg bg-white/5">
                  <span className={`font-bold ${r.rank === 1 ? 'gold-rank text-lg' : r.rank === 2 ? 'silver-rank' : 'bronze-rank'}`}>#{r.rank}</span>
                  <span className="text-white truncate px-3">{r.playerName}</span>
                  <span className="text-text-secondary font-medium tabular-nums">{r.score}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCelebration(false)} className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-text-secondary hover:text-white font-medium transition-all">Stay here</button>
              <button onClick={() => navigate('/')} className="flex-1 px-4 py-3 bg-accent-blue hover:bg-accent-blue/90 rounded-lg text-white font-medium transition-all">Dashboard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
