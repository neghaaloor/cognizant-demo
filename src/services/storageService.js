/**
 * Client data store for GameBoard.
 *
 * The Flask + SQLite backend is the source of truth. This keeps a small
 * in-memory cache so pages can read synchronously at render time, and pushes
 * every change to the server.
 *
 * WHY THERE IS NO LOCAL GAME MIRROR ANY MORE
 * -----------------------------------------
 * The previous version mirrored boards into localStorage and, on sign-in,
 * merged whatever it found there into the account being signed into. That is
 * exactly why a second person signing in on the same browser saw the first
 * person's history — the boards were uploaded into their account. Boards now
 * live only on the server, keyed by owner, and signing in or out wipes the
 * cache. Only the session itself is remembered locally.
 */

import {
  api, setUserId, getUserId, ApiError, setForeignApiHandler,
  discoverApiBase, getApiBase,
} from './api';

const USER_KEY = 'gameboard_user';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const cache = {
  user: readUser(),
  boards: [],      // list view (history / dashboard)
  games: {},       // id -> fully hydrated game, for the board screen
  players: [],     // names seen before, for quick-add
};

let revision = 0;
let loading = false;
let reachable = true;
let lastError = null;
let backendProblem = null;   // set when the API is missing or is not ours

const listeners = new Set();

if (cache.user?.id != null) setUserId(cache.user.id);

function readUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* private mode */
  }
}

function notify() {
  revision += 1;
  for (const fn of listeners) fn();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getRevision() {
  return revision;
}

export function getSyncStatus() {
  if (!cache.user?.id) return 'offline';
  if (!reachable) return 'offline';
  return loading ? 'connecting' : 'online';
}

export function getLastError() {
  return lastError;
}

/**
 * Non-null when the backend is absent, or when something that is not GameBoard
 * is answering on the API path. Shown as a banner rather than left to surface
 * as a confusing 404 on the first thing the user clicks.
 */
export function getBackendProblem() {
  return backendProblem;
}

// A foreign API answering means the base we picked is wrong — re-run discovery
// rather than just complaining. This is what makes a stale dev-proxy target
// self-correct instead of blocking every action.
let rediscovering = null;
setForeignApiHandler(() => {
  if (!rediscovering) rediscovering = checkBackend().finally(() => { rediscovering = null; });
});

/**
 * Find a GameBoard backend and confirm it answers.
 * Sets `backendProblem` only when nothing usable was found anywhere.
 */
export async function checkBackend() {
  const { base, tried } = await discoverApiBase();

  if (!base) {
    backendProblem =
      `No GameBoard backend found (tried ${tried.join(', ')}). ` +
      'Start it with `npm run dev:api` — it listens on port 5055.';
    reachable = false;
    notify();
    return backendProblem;
  }

  backendProblem = null;
  reachable = true;
  notify();
  return null;
}

export function getApiBaseInUse() {
  return getApiBase();
}

export function getPendingCount() {
  return 0;
}

/** Clear every trace of the previous account. Called on sign-in and sign-out. */
function clearAccountData() {
  cache.boards = [];
  cache.games = {};
  cache.players = [];
}

/* ------------------------------------------------------------------ *
 * Mapping: backend scoreboard  <->  frontend game
 * ------------------------------------------------------------------ */

const RUNNING_BOARDS = new Set(['leaderboard', 'scoreboard', 'counter', 'sports']);

export function isRunningBoard(boardId) {
  return RUNNING_BOARDS.has(boardId);
}

const FALLBACK_COLOURS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

/**
 * Turn the backend's scoreboard (+ optional history) into the shape the board
 * components already expect.
 */
function toGame(scoreboard, history) {
  const players = (scoreboard.players || []).map((p, i) => ({
    id: p.id,
    name: p.name,
    color: p.colour || FALLBACK_COLOURS[i % FALLBACK_COLOURS.length],
  }));

  // scores[playerId] = [{ score }] per round, index-aligned with roundNumbers.
  const scores = {};
  players.forEach((p) => {
    scores[p.id] = [];
  });

  const roundNumbers = history?.roundNumbers || [];
  if (history?.players) {
    for (const row of history.players) {
      scores[row.playerId] = roundNumbers.map((_, i) => ({ score: row.rounds[i] ?? 0 }));
    }
  } else if (scoreboard.leaderboard) {
    // List view: no per-round detail, but the backend sent final totals. Without
    // this the history screen showed every finished game as all-zero.
    for (const row of scoreboard.leaderboard) {
      scores[row.playerId] = [{ score: row.score }];
    }
  }

  const state = scoreboard.boardState || {};

  return {
    id: String(scoreboard.id),
    boardIdNumeric: scoreboard.id,
    name: scoreboard.name || 'Untitled board',
    boardId: scoreboard.boardId || 'scoresheet',
    boardName: scoreboard.boardName || null,
    // kept so History/Dashboard and resolveBoard keep working unchanged
    templateId: scoreboard.boardId || 'scoresheet',
    templateName: scoreboard.boardName || scoreboard.boardId || 'Scoresheet',
    players,
    scores,
    rounds: (history?.rounds || []).map((r) => ({ index: r.roundNumber - 1, id: r.roundId })),
    roundIds: (history?.rounds || []).map((r) => r.roundId),
    currentRound: roundNumbers.length,
    maxRounds: scoreboard.config?.maxRounds || 0,
    config: scoreboard.config || {},
    bracket: state.bracket || null,
    sports: state.sports || null,
    lifecycle: scoreboard.status,
    status: scoreboard.status === 'ENDED' ? 'completed' : 'active',
    // Ranked by the backend — do not re-sort or re-total in JS.
    leaderboard: scoreboard.leaderboard || null,
    roundsPlayed: scoreboard.roundsPlayed ?? roundNumbers.length,
    totalPoints: scoreboard.totalPoints ?? null,
    tie: scoreboard.tie || false,
    tiedPlayers: scoreboard.tiedPlayers || [],
    winner: scoreboard.winner ?? null,
    createdAt: Date.parse(`${scoreboard.createdAt}Z`) || Date.now(),
    endedAt: scoreboard.endedAt ? Date.parse(`${scoreboard.endedAt}Z`) : undefined,
    currentRoundId: scoreboard.currentRoundId ?? null,
  };
}

function applyWinner(game, leaderboard) {
  if (!leaderboard?.length) return game;
  const next = { ...game, leaderboard };
  if (game.status === 'completed' && !next.winner) {
    // A shared top score is a draw, not a winner.
    const top = leaderboard[0];
    const tied = leaderboard.filter((r) => r.score === top.score);
    next.tie = tied.length > 1;
    next.tiedPlayers = next.tie ? tied : [];
    next.winner = next.tie ? null : top.name;
  }
  return next;
}

/* ------------------------------------------------------------------ *
 * Session
 * ------------------------------------------------------------------ */

export function getUser() {
  return cache.user;
}

export function isSignedIn() {
  return Boolean(cache.user?.id);
}

/**
 * Sign in by name. The name is the account.
 *
 * Any cached data from a previous account is discarded first — that is the
 * fix for one person seeing another's history on a shared browser.
 */
export async function signIn(name) {
  const clean = String(name || '').trim();
  if (!clean) throw new ApiError('INVALID_USER_NAME', 'Enter a name to continue.', 400);

  clearAccountData();
  setUserId(null);

  const body = await api.signIn(clean);
  cache.user = body.user;
  writeUser(body.user);
  setUserId(body.user.id);

  reachable = true;
  lastError = null;
  cache.boards = (body.boards || []).map((b) => toGame(b));
  refreshPlayerSuggestions();
  notify();
  loadTournaments().catch(() => {});
  return body.user;
}

export function signOut() {
  clearAccountData();
  cache.user = null;
  writeUser(null);
  setUserId(null);
  notify();
}

/** Validate a remembered session and load this account's boards. */
export async function init() {
  // Do this first: if another service is sitting on the API path, every later
  // call would fail with an opaque status instead of an explanation.
  await checkBackend();

  if (!cache.user?.id) {
    notify();
    return;
  }
  setUserId(cache.user.id);
  loading = true;
  notify();

  try {
    await api.whoami();
    await loadBoards();
    await loadTournaments();
    reachable = true;
    lastError = null;
  } catch (e) {
    if (e.code === 'UNAUTHENTICATED' || e.code === 'USER_NOT_FOUND' || e.status === 401) {
      // The account no longer exists (fresh database). Force a clean sign-in.
      signOut();
    } else {
      reachable = false;
      lastError = e.message;
    }
  } finally {
    loading = false;
    notify();
  }
}

/* ------------------------------------------------------------------ *
 * Boards
 * ------------------------------------------------------------------ */

export function getGames() {
  return cache.boards;
}

export function getGameById(id) {
  return cache.games[String(id)] || cache.boards.find((b) => b.id === String(id)) || null;
}

export function getPlayers() {
  return cache.players;
}

export function getTournaments() {
  return cache.tournaments;
}

export function getSettings() {
  return { commentaryEnabled: false, voiceEnabled: true, theme: 'dark' };
}

export function saveSettings() {
  /* settings are per-device only; nothing to persist server-side */
}

/** Names seen across this account's boards, for the quick-add chips. */
function refreshPlayerSuggestions() {
  const seen = new Map();
  for (const board of cache.boards) {
    for (const p of board.players || []) {
      const key = p.name.toLowerCase();
      if (!seen.has(key)) seen.set(key, { id: `s_${key}`, name: p.name, color: p.color });
    }
  }
  cache.players = [...seen.values()];
}

export async function loadBoards() {
  const body = await api.listBoards();
  cache.boards = (body.scoreboards || []).map((b) => toGame(b));
  refreshPlayerSuggestions();
  notify();
  return cache.boards;
}

/** Full hydration for the board screen: scoreboard + history + leaderboard. */
export async function loadGame(id) {
  const [boardBody, historyBody, leaderboardBody] = await Promise.all([
    api.getBoard(id),
    api.history(id),
    api.leaderboard(id),
  ]);

  let game = toGame(boardBody.scoreboard, historyBody.history);
  game = applyWinner(game, leaderboardBody.leaderboard);

  // The round we write into. Running boards keep exactly one.
  const rounds = historyBody.history?.rounds || [];
  game.currentRoundId = rounds.length ? rounds[rounds.length - 1].roundId : null;

  cache.games[game.id] = game;
  const i = cache.boards.findIndex((b) => b.id === game.id);
  if (i >= 0) cache.boards[i] = { ...cache.boards[i], ...game };
  notify();
  return game;
}

/**
 * Create a board and get it playing.
 *
 * The backend lifecycle is SETUP -> ACTIVE: players can only be added during
 * SETUP, and scores only accepted once ACTIVE. So: create, add the roster,
 * then start — which also opens Round 1.
 */
export async function createGame({ name, boardId, boardName, config, players, boardState }) {
  const created = await api.createBoard({ name, boardId, boardName, config, boardState });
  const id = created.scoreboard.id;

  for (const p of players) {
    await api.addPlayer(id, p.name, p.color);
  }

  await api.startBoard(id);
  const game = await loadGame(id);
  await loadBoards();
  return game;
}

export async function deleteGame(id) {
  await api.deleteBoard(id);
  delete cache.games[String(id)];
  cache.boards = cache.boards.filter((b) => b.id !== String(id));
  notify();
}

export async function renameGame(id, name) {
  await api.patchBoard(id, { name });
  return loadGame(id);
}

/** Bracket tree and game clock — display state the score tables don't model. */
export async function saveBoardState(id, boardState) {
  const game = getGameById(id);
  const merged = { ...(game?.bracket ? { bracket: game.bracket } : {}),
                   ...(game?.sports ? { sports: game.sports } : {}),
                   ...boardState };
  await api.patchBoard(id, { boardState: merged });
  if (game) {
    cache.games[String(id)] = { ...game, ...boardState };
    notify();
  }
}

export async function saveConfig(id, config) {
  await api.patchBoard(id, { config });
  return loadGame(id);
}

/* ------------------------------------------------------------------ *
 * Scores
 * ------------------------------------------------------------------ */

/**
 * Write one player's score.
 * mode 'SET' replaces the value, 'ADJUST' adds a delta.
 */
export async function writeScore(gameId, roundId, playerId, points, mode = 'SET') {
  await api.setScore(gameId, roundId, playerId, points, mode);
  return loadGame(gameId);
}

/**
 * Open the next round.
 *
 * The backend refuses to advance while the current round is incomplete
 * (ROUND_INCOMPLETE) — a deliberate rule so a round can't be half-recorded.
 * Our scoresheet shows unfilled cells as 0, so we write those zeros first,
 * which satisfies the rule honestly rather than working around it.
 */
export async function addRound(gameId) {
  const current = await api.currentRound(gameId);
  const round = current.round;

  if (round && !round.complete) {
    for (const missing of round.missingPlayers || []) {
      await api.setScore(gameId, round.id, missing.playerId, 0, 'SET');
    }
  }

  await api.nextRound(gameId);
  return loadGame(gameId);
}

export async function endGame(gameId) {
  const result = await api.endBoard(gameId);
  await loadGame(gameId);
  await loadBoards();
  return result;
}

export async function resetGame(gameId, mode = 'REMATCH') {
  await api.resetBoard(gameId, mode);
  return loadGame(gameId);
}

/* ------------------------------------------------------------------ *
 * Polling — this backend has no push channel; its contract says poll.
 * ------------------------------------------------------------------ */

let pollTimer = null;

export function startPolling(gameId, intervalMs = 3000) {
  stopPolling();
  if (!gameId) return;

  pollTimer = setInterval(async () => {
    try {
      const body = await api.summary(gameId);
      const known = getGameById(gameId);
      const remoteRound = body.scoreboard?.currentRound ?? 0;
      const remoteEnded = body.scoreboard?.status === 'ENDED';

      // Cheap check first (summary is the small endpoint), full reload only
      // when something actually moved.
      const changed =
        !known ||
        remoteRound !== known.currentRound ||
        remoteEnded !== (known.status === 'completed') ||
        body.totalPointsScored !== known._totalPoints;

      if (changed) {
        const game = await loadGame(gameId);
        game._totalPoints = body.totalPointsScored;
      }
      reachable = true;
    } catch (e) {
      if (e.code === 'NETWORK') {
        reachable = false;
        notify();
      }
    }
  }, intervalMs);
}

export function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

export async function refresh() {
  if (!cache.user?.id) return;
  loading = true;
  notify();
  try {
    await loadBoards();
    reachable = true;
    lastError = null;
  } catch (e) {
    reachable = false;
    lastError = e.message;
  } finally {
    loading = false;
    notify();
  }
}

/* ------------------------------------------------------------------ *
 * Tournaments
 * ------------------------------------------------------------------ */

export async function loadTournaments() {
  const body = await api.listTournaments();
  cache.tournaments = body.tournaments || [];
  notify();
  return cache.tournaments;
}

export function getTournamentById(id) {
  return cache.tournaments.find((t) => String(t.id) === String(id)) || null;
}

export async function loadTournament(id) {
  const body = await api.getTournament(id);
  const tournament = body.tournament;
  const i = cache.tournaments.findIndex((t) => String(t.id) === String(id));
  if (i >= 0) cache.tournaments[i] = tournament;
  else cache.tournaments.unshift(tournament);
  notify();
  return tournament;
}

export async function createTournament({ name, boardId, boardName, players }) {
  const body = await api.createTournament({ name, boardId, boardName, players });
  cache.tournaments.unshift(body.tournament);
  notify();
  return body.tournament;
}

export async function addTournamentGame(id, name) {
  const body = await api.addTournamentGame(id, name);
  await loadTournament(id);
  await loadBoards();
  return body.scoreboard;
}

export async function setTournamentStatus(id, status) {
  const body = await api.setTournamentStatus(id, status);
  await loadTournament(id);
  return body.tournament;
}

export async function deleteTournament(id) {
  await api.deleteTournament(id);
  cache.tournaments = cache.tournaments.filter((t) => String(t.id) !== String(id));
  notify();
}

/* Legacy names kept so existing call sites keep compiling. */
export const savePlayer = () => {};
export const deletePlayer = () => {};
export const getCustomTemplates = () => [];
export const saveUser = (user) => signIn(user?.name);
export const clearUser = signOut;
export const saveGame = () => {
  throw new Error('saveGame is gone — use writeScore / addRound / saveBoardState');
};
