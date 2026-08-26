import { calculatePlayerTotal, calculateRoundTotal } from './scoringEngine.js';

/**
 * Generate full leaderboard data.
 */
export function generateLeaderboard(template, players, allScores, previousRanking) {
  const entries = players.map((player) => {
    const playerScores = allScores[player.id] || [];
    const total = calculatePlayerTotal(template, playerScores);
    const roundCount = playerScores.length;

    // Calculate W/D/L for match-based games
    let wdl = null;
    if (template.scoringType === 'match') {
      wdl = { W: 0, D: 0, L: 0 };
      playerScores.forEach((entry) => {
        if (entry.result === 'W') wdl.W++;
        else if (entry.result === 'D') wdl.D++;
        else if (entry.result === 'L') wdl.L++;
      });
    }

    // Calculate attribute breakdown for attribute-based
    let attributes = null;
    if (template.scoringType === 'attribute' && playerScores.length > 0) {
      attributes = playerScores[playerScores.length - 1];
    }

    const prevEntry = previousRanking
      ? previousRanking.find((r) => r.playerId === player.id)
      : null;

    return {
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      score: total,
      roundCount,
      wdl,
      attributes,
      previousRank: prevEntry ? prevEntry.rank : null,
    };
  });

  const ascending = template.scoringRules.highestWins === false;
  entries.sort((a, b) => ascending ? a.score - b.score : b.score - a.score);

  return entries.map((entry, index) => {
    const rank = index + 1;
    let trend = 0;
    if (entry.previousRank !== null) {
      trend = entry.previousRank - rank;
    }
    return { ...entry, rank, trend };
  });
}

/**
 * Get dynamic column definitions based on template.
 */
export function getLeaderboardColumns(template) {
  const columns = [
    { key: 'rank', label: '#', width: '50px' },
    { key: 'playerName', label: 'Player', width: 'auto' },
  ];

  if (template.scoringType === 'match' && template.leaderboard.showWDL) {
    columns.push(
      { key: 'W', label: 'W', width: '50px', accessor: (row) => row.wdl?.W ?? 0 },
      { key: 'D', label: 'D', width: '50px', accessor: (row) => row.wdl?.D ?? 0 },
      { key: 'L', label: 'L', width: '50px', accessor: (row) => row.wdl?.L ?? 0 },
    );
  }

  if (template.scoringType === 'attribute') {
    template.scoreFields.forEach((field) => {
      columns.push({
        key: field.key,
        label: field.label,
        width: '80px',
        accessor: (row) => {
          if (!row.attributes) return 0;
          if (field.type === 'boolean') return row.attributes[field.key] ? 'Yes' : 'No';
          return row.attributes[field.key] ?? 0;
        },
      });
    });
  }

  columns.push(
    { key: 'score', label: template.scoringType === 'match' ? 'Points' : 'Total', width: '80px' },
    { key: 'trend', label: '', width: '40px' },
  );

  return columns;
}
