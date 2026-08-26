/**
 * Speak text using the Web Speech API.
 */
export function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

/**
 * Generate commentary based on game state.
 * gameState: { ranking: [{ rank, playerName, score, previousRank, change }], roundNumber }
 */
export function generateCommentary(gameState) {
  if (!gameState || !gameState.ranking || gameState.ranking.length === 0) {
    return '';
  }

  const { ranking, roundNumber } = gameState;
  const leader = ranking[0];
  const lines = [];

  // Check for lead change
  const leadChanged = leader.change > 0;
  if (leadChanged) {
    lines.push(`${leader.playerName} is ON FIRE! Taking the lead with ${leader.score} points!`);
  }

  // Check for close game
  if (ranking.length >= 2) {
    const diff = Math.abs(ranking[0].score - ranking[1].score);
    if (diff <= 5 && diff > 0) {
      lines.push(`It's neck and neck! Only ${diff} point${diff !== 1 ? 's' : ''} between first and second!`);
    } else if (diff === 0) {
      lines.push(`We have a tie at the top! ${ranking[0].playerName} and ${ranking[1].playerName} are locked at ${ranking[0].score} points!`);
    }
  }

  // Check for comebacks
  for (const player of ranking) {
    if (player.change >= 2) {
      lines.push(`What a comeback by ${player.playerName}! Rising from ${player.previousRank}${ordSuffix(player.previousRank)} to ${player.rank}${ordSuffix(player.rank)}!`);
    }
  }

  // Check for dominant lead
  if (ranking.length >= 2) {
    const diff = ranking[0].score - ranking[1].score;
    if (diff > 20) {
      lines.push(`${ranking[0].playerName} is absolutely CRUSHING it with a ${diff} point lead!`);
    }
  }

  // Default round commentary if nothing else triggered
  if (lines.length === 0) {
    if (roundNumber) {
      lines.push(`End of round ${roundNumber}. ${leader.playerName} leads with ${leader.score} points.`);
    } else {
      lines.push(`${leader.playerName} is currently in the lead with ${leader.score} points.`);
    }
  }

  return lines.join(' ');
}

function ordSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
