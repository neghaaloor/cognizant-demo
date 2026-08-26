const gameTemplates = [
  {
    id: 'chess',
    name: 'Chess',
    icon: 'Crown',
    category: 'Strategy',
    scoringType: 'match',
    playersMin: 2,
    playersMax: 2,
    scoreFields: [
      { key: 'result', label: 'Result', type: 'select', options: ['W', 'D', 'L'] }
    ],
    scoringRules: {
      W: 1,
      D: 0.5,
      L: 0,
      highestWins: true,
    },
    leaderboard: {
      columns: ['Player', 'W', 'D', 'L', 'Points'],
      sortBy: 'points',
      showWDL: true,
    },
    tournamentSupported: true,
  },
  {
    id: 'uno',
    name: 'UNO',
    icon: 'Layers',
    category: 'Card Game',
    scoringType: 'round',
    playersMin: 2,
    playersMax: 10,
    scoreFields: [
      { key: 'score', label: 'Round Score', type: 'number' }
    ],
    scoringRules: {
      cumulative: true,
      highestWins: false,
      targetScore: 500,
    },
    leaderboard: {
      columns: ['Rank', 'Player', 'Total Score'],
      sortBy: 'total',
      ascending: true,
    },
    tournamentSupported: true,
  },
  {
    id: 'catan',
    name: 'Catan',
    icon: 'Hexagon',
    category: 'Board Game',
    scoringType: 'attribute',
    playersMin: 3,
    playersMax: 4,
    scoreFields: [
      { key: 'settlements', label: 'Settlements', type: 'number', pointValue: 1 },
      { key: 'cities', label: 'Cities', type: 'number', pointValue: 2 },
      { key: 'longestRoad', label: 'Longest Road', type: 'boolean', pointValue: 2 },
      { key: 'largestArmy', label: 'Largest Army', type: 'boolean', pointValue: 2 },
      { key: 'victoryPoints', label: 'VP Cards', type: 'number', pointValue: 1 },
    ],
    scoringRules: {
      highestWins: true,
      targetScore: 10,
      calculateTotal: (fields) => {
        return (fields.settlements || 0) * 1
          + (fields.cities || 0) * 2
          + (fields.longestRoad ? 2 : 0)
          + (fields.largestArmy ? 2 : 0)
          + (fields.victoryPoints || 0) * 1;
      },
    },
    leaderboard: {
      columns: ['Rank', 'Player', 'Settlements', 'Cities', 'Longest Road', 'Largest Army', 'VP Cards', 'Total'],
      sortBy: 'total',
    },
    tournamentSupported: true,
  },
  {
    id: 'scrabble',
    name: 'Scrabble',
    icon: 'Type',
    category: 'Word Game',
    scoringType: 'round',
    playersMin: 2,
    playersMax: 4,
    scoreFields: [
      { key: 'wordScore', label: 'Word Score', type: 'number' },
      { key: 'bonus', label: 'Bonus', type: 'number' },
    ],
    scoringRules: {
      cumulative: true,
      highestWins: true,
      roundTotal: (fields) => (fields.wordScore || 0) + (fields.bonus || 0),
    },
    leaderboard: {
      columns: ['Rank', 'Player', 'Total Score'],
      sortBy: 'total',
    },
    tournamentSupported: true,
  },
  {
    id: 'monopoly',
    name: 'Monopoly',
    icon: 'Building2',
    category: 'Board Game',
    scoringType: 'attribute',
    playersMin: 2,
    playersMax: 8,
    scoreFields: [
      { key: 'cash', label: 'Cash ($)', type: 'number', pointValue: 1 },
      { key: 'properties', label: 'Properties', type: 'number', pointValue: 100 },
      { key: 'houses', label: 'Houses', type: 'number', pointValue: 50 },
      { key: 'hotels', label: 'Hotels', type: 'number', pointValue: 150 },
    ],
    scoringRules: {
      highestWins: true,
      calculateTotal: (fields) => {
        return (fields.cash || 0)
          + (fields.properties || 0) * 100
          + (fields.houses || 0) * 50
          + (fields.hotels || 0) * 150;
      },
    },
    leaderboard: {
      columns: ['Rank', 'Player', 'Cash', 'Properties', 'Houses', 'Hotels', 'Net Worth'],
      sortBy: 'total',
    },
    tournamentSupported: false,
  },
  {
    id: 'custom',
    name: 'Custom Game',
    icon: 'Settings',
    category: 'Custom',
    scoringType: 'round',
    playersMin: 1,
    playersMax: 20,
    scoreFields: [
      { key: 'score', label: 'Score', type: 'number' }
    ],
    scoringRules: {
      cumulative: true,
      highestWins: true,
    },
    leaderboard: {
      columns: ['Rank', 'Player', 'Total Score'],
      sortBy: 'total',
    },
    tournamentSupported: true,
  },
];

export default gameTemplates;
