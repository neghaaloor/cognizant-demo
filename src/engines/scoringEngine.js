/**
 * Calculate the total for a single round entry based on the template.
 */
export function calculateRoundTotal(template, scoreEntry) {
  if (!scoreEntry) return 0;

  if (template.scoringType === 'match') {
    const result = scoreEntry.result;
    if (result === 'W') return template.scoringRules.W ?? 1;
    if (result === 'D') return template.scoringRules.D ?? 0.5;
    if (result === 'L') return template.scoringRules.L ?? 0;
    return 0;
  }

  if (template.scoringType === 'attribute') {
    if (typeof template.scoringRules.calculateTotal === 'function') {
      return template.scoringRules.calculateTotal(scoreEntry);
    }
    // Fallback: sum all numeric fields multiplied by pointValue
    return template.scoreFields.reduce((sum, field) => {
      if (field.type === 'boolean') {
        return sum + (scoreEntry[field.key] ? (field.pointValue || 0) : 0);
      }
      return sum + (Number(scoreEntry[field.key]) || 0) * (field.pointValue || 1);
    }, 0);
  }

  // round-based
  if (typeof template.scoringRules.roundTotal === 'function') {
    return template.scoringRules.roundTotal(scoreEntry);
  }

  // Default: sum all numeric score fields
  return template.scoreFields.reduce((sum, field) => {
    return sum + (Number(scoreEntry[field.key]) || 0);
  }, 0);
}

/**
 * Calculate a player's total across all rounds.
 */
export function calculatePlayerTotal(template, allRoundScores) {
  if (!allRoundScores || allRoundScores.length === 0) return 0;

  if (template.scoringType === 'attribute') {
    // For attribute-based, the latest entry is the current state
    const latest = allRoundScores[allRoundScores.length - 1];
    return calculateRoundTotal(template, latest);
  }

  // For round and match-based, sum all rounds
  return allRoundScores.reduce((total, entry) => {
    return total + calculateRoundTotal(template, entry);
  }, 0);
}

/**
 * Determine rankings for all players.
 * Returns sorted array with { rank, playerId, playerName, score, previousRank, change }.
 */
export function determineRanking(template, players, allScores, previousRanking) {
  const ranked = players.map((player) => {
    const playerScores = allScores[player.id] || [];
    const score = calculatePlayerTotal(template, playerScores);
    const prevEntry = previousRanking
      ? previousRanking.find((r) => r.playerId === player.id)
      : null;
    return {
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      score,
      previousRank: prevEntry ? prevEntry.rank : null,
    };
  });

  const ascending = template.scoringRules.highestWins === false;
  ranked.sort((a, b) => ascending ? a.score - b.score : b.score - a.score);

  return ranked.map((entry, index) => {
    const rank = index + 1;
    let change = 0;
    if (entry.previousRank !== null) {
      change = entry.previousRank - rank; // positive = moved up
    }
    return { ...entry, rank, change };
  });
}
