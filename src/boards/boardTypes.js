/**
 * Board types — the six ways a score can be displayed.
 *
 * A board is shaped to be drop-in compatible with the old `template` contract
 * (scoringType / scoreFields / scoringRules / leaderboard), so scoringEngine.js,
 * leaderboardEngine.js and the shared <Leaderboard /> keep working untouched.
 *
 * scoringType values:
 *   'running'  — one cumulative total per player, appended as a ledger of deltas
 *   'round'    — a grid of rounds x players, each cell editable
 *   'bracket'  — single-elimination knockout, scores derived from match wins
 *   'sports'   — two sides, a game clock and periods
 */

const boardTypes = [
  {
    id: 'leaderboard',
    name: 'Leaderboard',
    tagline: 'Participants are displayed in rows.',
    blurb:
      'A ranked list. Best for quiz nights, class points, sales targets — anything where you just need "who is winning".',
    icon: 'ListOrdered',
    accent: '#3b82f6',
    accentName: 'blue',
    scoringType: 'running',
    playerNoun: 'Participant',
    playersMin: 1,
    playersMax: 50,
    hasRounds: false,
    hasClock: false,
    fixedPlayers: null,
    scoreFields: [{ key: 'score', label: 'Points', type: 'number' }],
    scoringRules: { cumulative: true, highestWins: true },
    leaderboard: { columns: ['Rank', 'Participant', 'Points'], sortBy: 'total' },
    tournamentSupported: true,
    defaults: { step: 1, highestWins: true, targetScore: 0 },
  },
  {
    id: 'scoresheet',
    name: 'Scoresheet',
    tagline: 'The multi-column board for any competition.',
    blurb:
      'Track rounds, matches and stages side by side. Every cell is editable, totals update live. Best for card games and multi-round play.',
    icon: 'Table2',
    accent: '#22c55e',
    accentName: 'green',
    scoringType: 'round',
    playerNoun: 'Player',
    playersMin: 1,
    playersMax: 20,
    hasRounds: true,
    hasClock: false,
    fixedPlayers: null,
    scoreFields: [{ key: 'score', label: 'Round Score', type: 'number' }],
    scoringRules: { cumulative: true, highestWins: true },
    leaderboard: { columns: ['Rank', 'Player', 'Total'], sortBy: 'total' },
    tournamentSupported: true,
    defaults: { step: 1, highestWins: true, targetScore: 0, maxRounds: 10 },
  },
  {
    id: 'scoreboard',
    name: 'Scoreboard',
    tagline: 'Participants are displayed in blocks.',
    blurb:
      'Big, readable score tiles — one block per player. Best on a TV or projector where people need to read it from across the room.',
    icon: 'LayoutGrid',
    accent: '#a855f7',
    accentName: 'purple',
    scoringType: 'running',
    playerNoun: 'Participant',
    playersMin: 1,
    playersMax: 24,
    hasRounds: false,
    hasClock: false,
    fixedPlayers: null,
    scoreFields: [{ key: 'score', label: 'Points', type: 'number' }],
    scoringRules: { cumulative: true, highestWins: true },
    leaderboard: { columns: ['Rank', 'Participant', 'Points'], sortBy: 'total' },
    tournamentSupported: true,
    defaults: { step: 1, highestWins: true, targetScore: 0 },
  },
  {
    id: 'bracket',
    name: 'Tournament Bracket',
    tagline: 'Complete tournament management.',
    blurb:
      'Single-elimination knockout. Seeds are drawn automatically, byes are handled, and winners advance as you tap them.',
    icon: 'Network',
    accent: '#ef4444',
    accentName: 'red',
    scoringType: 'bracket',
    playerNoun: 'Competitor',
    playersMin: 2,
    playersMax: 32,
    hasRounds: false,
    hasClock: false,
    fixedPlayers: null,
    scoreFields: [{ key: 'score', label: 'Wins', type: 'number' }],
    scoringRules: { cumulative: true, highestWins: true },
    leaderboard: { columns: ['Rank', 'Competitor', 'Wins'], sortBy: 'total' },
    tournamentSupported: true,
    defaults: { step: 1, highestWins: true, thirdPlace: false },
  },
  {
    id: 'sports',
    name: 'Sports Scoreboard',
    tagline: 'One team or player versus another.',
    blurb:
      'Two sides, a running game clock and periods. Includes a full-screen scorebug display for streaming or a side screen.',
    icon: 'Timer',
    accent: '#10b981',
    accentName: 'emerald',
    scoringType: 'sports',
    playerNoun: 'Team',
    playersMin: 2,
    playersMax: 2,
    hasRounds: false,
    hasClock: true,
    fixedPlayers: 2,
    scoreFields: [{ key: 'score', label: 'Points', type: 'number' }],
    scoringRules: { cumulative: true, highestWins: true },
    leaderboard: { columns: ['Rank', 'Team', 'Score'], sortBy: 'total' },
    tournamentSupported: false,
    defaults: {
      step: 1,
      highestWins: true,
      periodLength: 12 * 60, // seconds
      periodCount: 4,
      periodLabel: 'Quarter',
      countDown: true,
    },
  },
  {
    id: 'counter',
    name: 'Counter',
    tagline: 'Count with clicks.',
    blurb:
      'The simplest board there is — tap a tile, the number goes up. Best for tallies, headcounts, reps and drinking games.',
    icon: 'MousePointerClick',
    accent: '#f97316',
    accentName: 'orange',
    scoringType: 'running',
    playerNoun: 'Counter',
    playersMin: 1,
    playersMax: 24,
    hasRounds: false,
    hasClock: false,
    fixedPlayers: null,
    scoreFields: [{ key: 'score', label: 'Count', type: 'number' }],
    scoringRules: { cumulative: true, highestWins: true },
    leaderboard: { columns: ['Rank', 'Counter', 'Count'], sortBy: 'total' },
    tournamentSupported: false,
    defaults: { step: 1, highestWins: true, targetScore: 0 },
  },
];

export function getBoard(id) {
  return boardTypes.find((b) => b.id === id) || null;
}

/**
 * Resolve the board/template a saved game was created with.
 * Falls back to the legacy gameTemplates list so games created before
 * board types shipped still open correctly.
 */
export function resolveBoard(game, legacyTemplates = []) {
  if (!game) return null;
  return (
    getBoard(game.boardId) ||
    getBoard(game.templateId) ||
    legacyTemplates.find((t) => t.id === game.templateId) ||
    null
  );
}

export default boardTypes;
