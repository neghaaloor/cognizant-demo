/**
 * Single-elimination bracket generation and advancement.
 *
 * The bracket is stored on the game as:
 *   game.bracket = { rounds: [ [match, match, ...], [match, ...], ... ] }
 * where a match is:
 *   { id, slotA, slotB, winner }   // slots hold a playerId, null (bye) or undefined (TBD)
 */

/**
 * Standard seeding order so top seeds meet as late as possible.
 * Builds up by reflection: [1,2] -> [1,4,2,3] -> [1,8,4,5,2,7,3,6] ...
 * Consecutive pairs in the result are the round-one matchups.
 */
function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    const next = [];
    for (const seed of order) {
      next.push(seed);
      next.push(n + 1 - seed);
    }
    order = next;
  }
  return order;
}

export function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(2, p);
}

/**
 * Build a fresh bracket for the given players.
 * Players beyond a power of two receive byes in round 1.
 */
export function generateBracket(players) {
  const size = nextPowerOfTwo(players.length);
  const order = seedOrder(size);

  const firstRound = [];
  for (let i = 0; i < order.length; i += 2) {
    const seedA = order[i];
    const seedB = order[i + 1];
    const a = players[seedA - 1];
    const b = players[seedB - 1];
    firstRound.push({
      id: `m_r0_${firstRound.length}`,
      slotA: a ? a.id : null,
      slotB: b ? b.id : null,
      winner: undefined,
    });
  }

  const rounds = [firstRound];
  let count = firstRound.length;
  let r = 1;
  while (count > 1) {
    count = Math.floor(count / 2);
    rounds.push(
      Array.from({ length: count }, (_, i) => ({
        id: `m_r${r}_${i}`,
        slotA: undefined,
        slotB: undefined,
        winner: undefined,
      }))
    );
    r++;
  }

  return propagate({ rounds });
}

/**
 * Push byes and decided winners forward through the bracket.
 * Also clears any downstream result that a changed pick invalidated.
 */
export function propagate(bracket) {
  const rounds = bracket.rounds.map((r) => r.map((m) => ({ ...m })));

  for (let r = 0; r < rounds.length; r++) {
    for (let i = 0; i < rounds[r].length; i++) {
      const match = rounds[r][i];

      // A slot facing an empty slot advances automatically (a bye).
      if (match.slotA && match.slotB === null) match.winner = match.slotA;
      else if (match.slotB && match.slotA === null) match.winner = match.slotB;

      // A winner that is no longer in this match is stale.
      if (match.winner && match.winner !== match.slotA && match.winner !== match.slotB) {
        match.winner = undefined;
      }

      const nextRound = rounds[r + 1];
      if (!nextRound) continue;
      const nextMatch = nextRound[Math.floor(i / 2)];
      if (!nextMatch) continue;
      const slot = i % 2 === 0 ? 'slotA' : 'slotB';
      nextMatch[slot] = match.winner ?? undefined;
    }
  }

  return { ...bracket, rounds };
}

/** Record a pick and re-propagate. */
export function setMatchWinner(bracket, roundIndex, matchIndex, playerId) {
  const rounds = bracket.rounds.map((r) => r.map((m) => ({ ...m })));
  const match = rounds[roundIndex]?.[matchIndex];
  if (!match) return bracket;
  match.winner = match.winner === playerId ? undefined : playerId;
  return propagate({ ...bracket, rounds });
}

/** Total wins per player, used to feed the shared leaderboard. */
export function bracketWins(bracket) {
  const wins = {};
  for (const round of bracket.rounds) {
    for (const match of round) {
      // A bye is not an earned win.
      const isBye = match.slotA === null || match.slotB === null;
      if (match.winner && !isBye) {
        wins[match.winner] = (wins[match.winner] || 0) + 1;
      }
    }
  }
  return wins;
}

/** The player who won the final, if the bracket is complete. */
export function bracketChampion(bracket) {
  const final = bracket.rounds[bracket.rounds.length - 1]?.[0];
  return final?.winner || null;
}

export function roundLabel(roundIndex, totalRounds) {
  const fromEnd = totalRounds - roundIndex;
  if (fromEnd === 1) return 'Final';
  if (fromEnd === 2) return 'Semi-finals';
  if (fromEnd === 3) return 'Quarter-finals';
  return `Round ${roundIndex + 1}`;
}
