/**
 * REST client for the GameBoard Flask API.
 *
 * The contract is docs/API_CONTRACT.md: every response carries `success`, and
 * every failure carries a stable `error` code. Branch on `error`, never on
 * `message`.
 *
 * The signed-in account travels in `X-User-Id`. Without it the API answers 401
 * and, crucially, a board owned by someone else answers 404 — so history is
 * private at the API, not just hidden in the UI.
 *
 * FINDING THE BACKEND
 * -------------------
 * The base URL is discovered rather than assumed. A dev server left running
 * with a stale proxy target will happily forward /api to whatever else is on
 * that port, and the symptom is a bare 404 from a stranger. So on boot we probe
 * the candidates in order and keep the first one that answers /health as
 * GameBoard. The winner is remembered, so later loads go straight there.
 */

const BASE_KEY = 'gameboard_api_base';

/** Same-origin first — correct when Flask serves the built app, or the proxy works. */
function candidateBases() {
  const bases = [];
  const remembered = (() => {
    try {
      return localStorage.getItem(BASE_KEY);
    } catch {
      return null;
    }
  })();

  const push = (value) => {
    if (value && !bases.includes(value)) bases.push(value);
  };

  push(import.meta.env?.VITE_API_BASE);   // explicit override always wins
  push(remembered);
  push('/api');                           // same origin
  if (typeof location !== 'undefined') {
    // The backend's own default port, on whichever host served this page —
    // covers "app on the Vite port, API on 5055".
    push(`${location.protocol}//${location.hostname}:5055/api`);
  }
  return bases;
}

let BASE = candidateBases()[0] || '/api';

/** /health lives at the root, not under /api. */
const rootOf = (base) => base.replace(/\/api\/?$/, '');

export function getApiBase() {
  return BASE;
}

function rememberBase(base) {
  BASE = base;
  try {
    localStorage.setItem(BASE_KEY, base);
  } catch {
    /* private mode */
  }
}

/** Does this base answer as a GameBoard backend? */
async function probe(base) {
  try {
    const res = await fetch(`${rootOf(base)}/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined,
    });
    const body = await res.json().catch(() => null);
    return Boolean(body && body.server === 'running' && body.database);
  } catch {
    return false;
  }
}

/**
 * Settle on a working base URL.
 * @returns {Promise<{ base: string|null, tried: string[] }>}
 */
export async function discoverApiBase() {
  const tried = candidateBases();
  for (const base of tried) {
    if (await probe(base)) {
      rememberBase(base);
      return { base, tried };
    }
  }
  try {
    localStorage.removeItem(BASE_KEY);
  } catch {
    /* ignore */
  }
  return { base: null, tried };
}

let userId = null;

export function setUserId(id) {
  userId = id ?? null;
}

export function getUserId() {
  return userId;
}

export class ApiError extends Error {
  constructor(code, message, status, details) {
    super(message || code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Every GameBoard response carries `success`. Anything else means we are not
 * talking to GameBoard at all — most often another service already sitting on
 * the port the dev proxy points at. Saying so beats a bare "404".
 */
function looksLikeGameBoard(payload) {
  return payload !== null && typeof payload === 'object' && 'success' in payload;
}

// Reported whenever any call discovers a foreign API, not just the /health
// preflight — /health can be blocked (CORS) while ordinary calls still answer.
let onForeignApi = null;
export function setForeignApiHandler(fn) {
  onForeignApi = fn;
}

async function request(method, path, body, { timeout = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(userId != null ? { 'X-User-Id': String(userId) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      /* empty or non-JSON body */
    }

    if (!looksLikeGameBoard(payload)) {
      // Something answered, but it is not this API.
      const message =
        `Something other than the GameBoard API answered ${method} ${BASE}${path} ` +
        `(HTTP ${res.status}). Another service is probably on that port — ` +
        `start the backend and point the dev proxy at it.`;
      onForeignApi?.(message);
      throw new ApiError('NOT_GAMEBOARD_API', message, res.status);
    }

    if (!res.ok || payload.success === false) {
      throw new ApiError(
        payload.error || `HTTP_${res.status}`,
        payload.message || `Request failed (${res.status})`,
        res.status,
        payload.details
      );
    }
    return payload;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // Abort or network failure — the server is unreachable.
    throw new ApiError('NETWORK', e.name === 'AbortError' ? 'Request timed out' : 'Cannot reach the server', 0);
  } finally {
    clearTimeout(timer);
  }
}

const enc = encodeURIComponent;

export const api = {
  /** Root-level, and deliberately not wrapped in the success envelope. */
  health: async () => {
    const { base, tried } = await discoverApiBase();
    if (!base) {
      throw new ApiError(
        'NOT_GAMEBOARD_API',
        `No GameBoard backend found. Tried ${tried.join(', ')}. ` +
          `Start it with \`npm run dev:api\` (it listens on 5055).`,
        0
      );
    }
    const res = await fetch(`${rootOf(base)}/health`, { headers: { Accept: 'application/json' } });
    return res.json();
  },

  /* ---- session ---- */
  signIn: (name) => request('POST', '/session', { name }),
  whoami: () => request('GET', '/session'),
  myBoards: () => request('GET', '/session/boards'),

  /* ---- boards (scoreboards) ---- */
  listBoards: () => request('GET', '/scoreboards'),
  getBoard: (id) => request('GET', `/scoreboards/${enc(id)}`),
  createBoard: (payload) => request('POST', '/scoreboards', payload),
  patchBoard: (id, payload) => request('PATCH', `/scoreboards/${enc(id)}`, payload),
  deleteBoard: (id) => request('DELETE', `/scoreboards/${enc(id)}`),
  startBoard: (id) => request('POST', `/scoreboards/${enc(id)}/start`),
  endBoard: (id) => request('POST', `/scoreboards/${enc(id)}/end`),
  resetBoard: (id, mode = 'REMATCH') => request('POST', `/scoreboards/${enc(id)}/reset`, { mode }),

  /* ---- players ---- */
  addPlayer: (boardId, name, colour) =>
    request('POST', `/scoreboards/${enc(boardId)}/players`, { name, colour }),
  renamePlayer: (boardId, playerId, name) =>
    request('PATCH', `/scoreboards/${enc(boardId)}/players/${enc(playerId)}`, { name }),
  removePlayer: (boardId, playerId) =>
    request('DELETE', `/scoreboards/${enc(boardId)}/players/${enc(playerId)}`),

  /* ---- rounds ---- */
  listRounds: (boardId) => request('GET', `/scoreboards/${enc(boardId)}/rounds`),
  currentRound: (boardId) => request('GET', `/scoreboards/${enc(boardId)}/rounds/current`),
  nextRound: (boardId) => request('POST', `/scoreboards/${enc(boardId)}/rounds`),

  /* ---- scores ---- */
  submitScores: (boardId, roundId, scores) =>
    request('POST', `/scoreboards/${enc(boardId)}/rounds/${enc(roundId)}/scores`, { scores }),
  /** Set or nudge one player's score — the running-total boards use this. */
  setScore: (boardId, roundId, playerId, points, mode = 'SET') =>
    request('PUT', `/scoreboards/${enc(boardId)}/rounds/${enc(roundId)}/scores/${enc(playerId)}`, {
      points,
      mode,
    }),

  /* ---- tournaments ---- */
  listTournaments: () => request('GET', '/tournaments'),
  getTournament: (id) => request('GET', `/tournaments/${enc(id)}`),
  createTournament: (payload) => request('POST', '/tournaments', payload),
  addTournamentGame: (id, name) => request('POST', `/tournaments/${enc(id)}/games`, { name }),
  setTournamentStatus: (id, status) => request('PATCH', `/tournaments/${enc(id)}`, { status }),
  deleteTournament: (id) => request('DELETE', `/tournaments/${enc(id)}`),

  /* ---- derived views (the backend ranks and totals; do not re-sort in JS) ---- */
  leaderboard: (boardId) => request('GET', `/scoreboards/${enc(boardId)}/leaderboard`),
  history: (boardId) => request('GET', `/scoreboards/${enc(boardId)}/history`),
  summary: (boardId) => request('GET', `/scoreboards/${enc(boardId)}/summary`),
  analysis: (boardId) => request('GET', `/scoreboards/${enc(boardId)}/analysis`),
};
