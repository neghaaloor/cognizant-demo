/**
 * Turns a parsed voice question into an answer — one spoken line plus optional
 * rows to show on screen.
 *
 * Everything reads from the ranking the board already computed, so answers obey
 * the board's own rules: on a lowest-wins board the "leader" really is the
 * lowest score, and on a bracket "points" are matches won.
 */

const ord = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const plural = (n, word) => `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`;

/** "12:05" -> "12 minutes 5 seconds"; keeps spoken time natural. */
function spokenClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return plural(s, 'second');
  if (s === 0) return plural(m, 'minute');
  return `${plural(m, 'minute')} and ${plural(s, 'second')}`;
}

/** Everyone sharing the top score, not just whoever sorted first. */
function tiedAt(ranking, score) {
  return ranking.filter((r) => r.score === score);
}

const rowsOf = (ranking) =>
  ranking.map((r) => ({
    rank: r.rank,
    name: r.playerName,
    score: r.score,
    color: r.playerColor,
  }));

/**
 * The singular unit for this board — "point", "count", "win" — so plural()
 * can add the s itself. Board labels are plural nouns ("Points", "Wins") or
 * compounds ("Round Score"), hence the trim and the de-pluralise.
 */
const unitFor = (board) => {
  const raw = (board?.scoreFields?.[0]?.label || 'points').toLowerCase();
  const cleaned = raw.replace(/\bround\b/g, '').replace(/\bscore\b/g, '').trim() || 'point';
  return cleaned.endsWith('s') ? cleaned.slice(0, -1) : cleaned;
};

/**
 * @param {object} query   from parseCommand()
 * @param {object} ctx     { board, boardId, game, ranking }
 * @returns {{ text: string, rows?: Array, title?: string }}
 */
export function answerQuery(query, ctx) {
  const { board, boardId, game, ranking = [] } = ctx;
  const unit = unitFor(board);

  if (!ranking.length) {
    return { text: 'There is nobody on this board yet.' };
  }

  const scored = ranking.filter((r) => r.score !== 0);
  const nobodyScored = scored.length === 0;

  switch (query.kind) {
    /* ---------------- who is winning ---------------- */
    case 'leader': {
      if (nobodyScored) {
        return { text: 'Nobody has scored yet — everyone is on zero.', rows: rowsOf(ranking) };
      }
      const top = ranking[0];
      const tied = tiedAt(ranking, top.score);

      if (tied.length > 1) {
        const names = tied.map((t) => t.playerName);
        const list = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        const everyone = tied.length === 2 ? 'both' : 'all';
        return {
          title: 'Tied at the top',
          text: `It's a tie at the top — ${list}, ${everyone} on ${plural(top.score, unit)}.`,
          rows: rowsOf(ranking),
        };
      }

      const second = ranking[1];
      const lead = second ? top.score - second.score : 0;
      const margin =
        second && lead !== 0
          ? ` — ${Math.abs(lead)} ahead of ${second.playerName}.`
          : '.';

      return {
        title: 'Leading',
        text: `${top.playerName} is on top with ${plural(top.score, unit)}${margin}`,
        rows: rowsOf(ranking),
      };
    }

    /* ---------------- who is losing ---------------- */
    case 'loser': {
      const bottom = ranking[ranking.length - 1];
      if (nobodyScored) {
        return { text: 'Nobody has scored yet, so nobody is behind.', rows: rowsOf(ranking) };
      }
      const top = ranking[0];
      const behind = top.score - bottom.score;
      return {
        title: 'Last place',
        text: `${bottom.playerName} is last with ${plural(bottom.score, unit)}, ${Math.abs(behind)} behind ${top.playerName}.`,
        rows: rowsOf(ranking),
      };
    }

    /* ---------------- a specific placing ---------------- */
    case 'rank': {
      const index = query.rank === -1 ? ranking.length - 1 : query.rank - 1;
      const row = ranking[index];
      if (!row) {
        return { text: `There is no ${ord(query.rank)} place — this board has ${ranking.length}.`, rows: rowsOf(ranking) };
      }
      const label = query.rank === -1 ? 'last' : `in ${ord(row.rank)}`;
      return {
        title: query.rank === -1 ? 'Last place' : `${ord(row.rank)} place`,
        text: `${row.playerName} is ${label} with ${plural(row.score, unit)}.`,
        rows: rowsOf(ranking),
      };
    }

    /* ---------------- one player ---------------- */
    case 'player_score': {
      const row = ranking.find((r) => r.playerId === query.playerId);
      if (!row) return { text: `I couldn't find ${query.playerName || 'that player'} on this board.` };

      const target = game?.config?.targetScore || 0;
      const toGo = target > 0 ? Math.max(0, target - row.score) : 0;
      const chase =
        target > 0
          ? toGo === 0
            ? ' — target reached.'
            : ` — ${toGo} short of ${target}.`
          : '';

      return {
        title: row.playerName,
        text: `${row.playerName} has ${plural(row.score, unit)}, ${ord(row.rank)} of ${ranking.length}${chase}`,
        rows: rowsOf(ranking),
      };
    }

    /* ---------------- how close is it ---------------- */
    case 'gap': {
      if (ranking.length < 2) return { text: 'There is only one player on this board.' };

      if (query.playerId) {
        const row = ranking.find((r) => r.playerId === query.playerId);
        const top = ranking[0];
        if (row && row.playerId === top.playerId) {
          const diff = top.score - ranking[1].score;
          return {
            title: 'Margin',
            text: diff === 0
              ? `${row.playerName} is level with ${ranking[1].playerName} at the top.`
              : `${row.playerName} leads by ${plural(diff, unit)}.`,
            rows: rowsOf(ranking),
          };
        }
        if (row) {
          const diff = top.score - row.score;
          return {
            title: 'Margin',
            text: `${row.playerName} is ${plural(Math.abs(diff), unit)} behind ${top.playerName}.`,
            rows: rowsOf(ranking),
          };
        }
      }

      const diff = ranking[0].score - ranking[1].score;
      if (diff === 0) {
        return {
          title: 'Dead level',
          text: `It's dead level — ${ranking[0].playerName} and ${ranking[1].playerName} are both on ${plural(ranking[0].score, unit)}.`,
          rows: rowsOf(ranking),
        };
      }
      return {
        title: 'Margin',
        text: `${ranking[0].playerName} leads ${ranking[1].playerName} by ${plural(Math.abs(diff), unit)}.`,
        rows: rowsOf(ranking),
      };
    }

    /* ---------------- the whole board ---------------- */
    case 'standings': {
      if (nobodyScored) {
        return {
          title: 'Standings',
          text: `Nobody has scored yet. ${ranking.length} players are on the board.`,
          rows: rowsOf(ranking),
        };
      }
      const spoken = ranking
        .slice(0, 6)
        .map((r) => `${r.playerName} ${r.score}`)
        .join(', ');
      const more = ranking.length > 6 ? `, and ${ranking.length - 6} more` : '';
      return {
        title: 'Standings',
        text: `${ranking[0].playerName} leads. ${spoken}${more}.`,
        rows: rowsOf(ranking),
      };
    }

    /* ---------------- closest to the target ---------------- */
    case 'remaining': {
      const target = game?.config?.targetScore || 0;
      if (!target) {
        const top = ranking[0];
        return {
          title: 'No target set',
          text: `This board has no target score. ${top.playerName} is ahead with ${plural(top.score, unit)}.`,
          rows: rowsOf(ranking),
        };
      }
      const top = ranking[0];
      const toGo = Math.max(0, target - top.score);
      return {
        title: 'Closest to winning',
        text: toGo === 0
          ? `${top.playerName} has reached the target of ${target}.`
          : `${top.playerName} is closest — ${plural(toGo, unit)} from ${target}.`,
        rows: rowsOf(ranking),
      };
    }

    /* ---------------- rounds ---------------- */
    case 'round': {
      const round = game?.currentRound || 0;
      if (!round) return { text: 'No rounds have been played yet.' };
      return {
        title: 'Round',
        text: `You're on round ${round}${game?.maxRounds ? ` of ${game.maxRounds}` : ''}.`,
      };
    }

    /* ---------------- game clock ---------------- */
    case 'clock': {
      if (boardId !== 'sports' || !game?.sports) {
        return { text: 'This board does not have a clock.' };
      }
      const s = game.sports;
      const elapsed = (s.accumulatedMs || 0) + (s.running && s.startedAt ? Date.now() - s.startedAt : 0);
      const periodLength = (game.config?.periodLength || 720) * 1000;
      const countDown = game.config?.countDown !== false;
      const shown = countDown ? Math.max(0, periodLength - elapsed) : elapsed;
      const label = game.config?.periodLabel || 'Quarter';
      const state = s.running ? 'running' : 'stopped';

      if (countDown && shown === 0) {
        return { title: 'Clock', text: `Time is up in ${label.toLowerCase()} ${s.period || 1}.` };
      }
      return {
        title: 'Clock',
        text: `${spokenClock(shown)} ${countDown ? 'left' : 'played'} in ${label.toLowerCase()} ${s.period || 1}, clock ${state}.`,
      };
    }

    default:
      return { text: "I'm not sure how to answer that one." };
  }
}
