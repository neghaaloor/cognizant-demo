/**
 * Offline voice command parser.
 *
 * Turns a raw speech transcript into structured, executable commands.
 * Runs entirely in the browser — no API key, no network, no cost.
 *
 *   "add 5 points to player 1"      -> SCORE  [{ op:'add',      value:5,  player:#1 }]
 *   "give Rahul ten"                -> SCORE  [{ op:'add',      value:10, player:Rahul }]
 *   "remove 3 from Alice"           -> SCORE  [{ op:'subtract', value:3,  player:Alice }]
 *   "set Bob to 20"                 -> SCORE  [{ op:'set',      value:20, player:Bob }]
 *   "Jhanavi 25 Rahul 18"           -> SCORE  [ +25 Jhanavi, +18 Rahul ]
 *   "add 5 to alice and minus 2 for bob"
 *                                   -> SCORE  [ +5 Alice, -2 Bob ]
 *   "give everyone 10"              -> SCORE  [ +10 to every player ]
 *   "next round" / "undo" / "end game" / "start the clock"
 *                                   -> control commands
 */

/* ------------------------------------------------------------------ *
 * 1. Number words
 * ------------------------------------------------------------------ */

const UNITS = {
  zero: 0, oh: 0, nil: 0, nought: 0,
  one: 1, won: 1, a: 1, an: 1, two: 2, to: 2, too: 2, three: 3, tree: 3,
  four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, ate: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const SCALES = { hundred: 100, thousand: 1000 };

// Words that mean a number but only in a quantity slot.
const FUZZY_QUANTITIES = { couple: 2, pair: 2, few: 3, several: 3, dozen: 12, half: 0.5 };

// 'a', 'an', 'to', 'for', 'won' are far more often filler than digits.
// Only treat them as numbers when nothing else in the clause is numeric.
const WEAK_NUMBER_WORDS = new Set(['a', 'an', 'to', 'too', 'for', 'won', 'oh', 'ate', 'tree']);

/**
 * Convert spoken number words in a string into digits, in place,
 * preserving character positions as closely as possible.
 * Handles "twenty five" -> 25, "one hundred and twenty" -> 120, "a dozen" -> 12.
 */
export function normalizeNumbers(text) {
  const tokens = text.split(/\s+/);
  const out = [];
  let i = 0;

  const isStrongNumWord = (w) =>
    (UNITS[w] !== undefined && !WEAK_NUMBER_WORDS.has(w)) ||
    TENS[w] !== undefined ||
    SCALES[w] !== undefined ||
    FUZZY_QUANTITIES[w] !== undefined ||
    /^\d+$/.test(w);

  while (i < tokens.length) {
    const word = tokens[i];

    if (!isStrongNumWord(word)) {
      out.push(word);
      i++;
      continue;
    }

    // Greedily consume a number phrase.
    let total = 0;
    let current = 0;
    let consumed = 0;
    let sawAny = false;

    while (i < tokens.length) {
      const w = tokens[i];

      if (/^\d+$/.test(w)) {
        // A literal digit only joins the phrase if it's the first piece.
        if (sawAny) break;
        current += parseInt(w, 10);
        sawAny = true;
        i++;
        consumed++;
        continue;
      }

      if (FUZZY_QUANTITIES[w] !== undefined) {
        if (sawAny) break;
        current += FUZZY_QUANTITIES[w];
        sawAny = true;
        i++;
        consumed++;
        continue;
      }

      if (TENS[w] !== undefined) {
        // "twenty" after "twenty" ends the phrase.
        if (current % 100 >= 20) break;
        current += TENS[w];
        sawAny = true;
        i++;
        consumed++;
        continue;
      }

      if (UNITS[w] !== undefined && !WEAK_NUMBER_WORDS.has(w)) {
        const unit = UNITS[w];
        // "twenty five" -> 25, but "five five" ends the phrase.
        if (current % 10 !== 0 || (current % 100 >= 10 && current % 100 < 20)) break;
        current += unit;
        sawAny = true;
        i++;
        consumed++;
        continue;
      }

      if (SCALES[w] !== undefined) {
        if (!sawAny) current = 1;
        if (SCALES[w] === 100) {
          current *= 100;
        } else {
          total += current * SCALES[w];
          current = 0;
        }
        sawAny = true;
        i++;
        consumed++;
        // allow a linking "and": "one hundred and twenty"
        if (tokens[i] === 'and' && isStrongNumWord(tokens[i + 1] || '')) i++;
        continue;
      }

      break;
    }

    if (sawAny) {
      out.push(String(total + current));
      // keep token count stable-ish for readability; not position critical
      for (let k = 1; k < consumed; k++) out.push('');
    } else {
      out.push(word);
      i++;
    }
  }

  return out.filter((t) => t !== '').join(' ');
}

/* ------------------------------------------------------------------ *
 * 2. Text normalization
 * ------------------------------------------------------------------ */

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\w\s+-]/g, ' ')
    .replace(/\bplus\s*plus\b/g, 'plus')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ *
 * 3. Fuzzy name matching
 * ------------------------------------------------------------------ */

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 0..1 similarity. */
export function similarity(a, b) {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/**
 * Find the best matching player for a spoken fragment.
 * Speech recognition mangles names constantly ("Jhanavi" -> "Janavi"/"Genovie"),
 * so this is deliberately forgiving — but only above a confidence floor.
 */
export function matchPlayerName(fragment, players, threshold = 0.62) {
  if (!fragment) return null;
  const frag = fragment.toLowerCase().trim();
  let best = null;
  let bestScore = 0;

  for (const p of players) {
    const name = p.name.toLowerCase();
    let score = 0;

    if (name === frag) score = 1;
    else if (name.startsWith(frag) && frag.length >= 3) score = 0.94;
    else if (frag.startsWith(name) && name.length >= 3) score = 0.92;
    else if (name.includes(frag) && frag.length >= 3) score = 0.85;
    else {
      score = similarity(name, frag);
      // First name only: "alice smith" spoken as "alice"
      const first = name.split(' ')[0];
      if (first !== name) score = Math.max(score, similarity(first, frag) * 0.97);
    }

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return bestScore >= threshold ? { player: best, confidence: bestScore } : null;
}

/* ------------------------------------------------------------------ *
 * 4. Operation keywords
 * ------------------------------------------------------------------ */

// Order matters — multi-word phrases are tested before single words.
const SUBTRACT_PATTERNS = [
  /\btakes?\s+away\b/, /\btook\s+away\b/, /\btake\s+off\b/, /\bknock\s+off\b/,
  /\bgoes?\s+down\b/, /\bwent\s+down\b/, /\bdown\s+by\b/, /\bback\s+by\b/,
  /\bsubtracts?\b/, /\bsubtracted\b/, /\bminus\b/, /\bnegative\b/,
  /\bremoves?\b/, /\bremoved\b/, /\bdeducts?\b/, /\bdeducted\b/, /\bdeduction\b/,
  /\bpenali[sz]e[ds]?\b/, /\bpenalt(?:y|ies)\b/, /\bfines?\b/, /\bfined\b/,
  /\bloses?\b/, /\blost\b/, /\blosing\b/,
  /\bdecreases?\b/, /\bdecreased\b/, /\breduces?\b/, /\breduced\b/,
  /\bdrops?\b/, /\bdropped\b/, /\bless\b/, /\bwithdraws?\b/,
];

const SET_PATTERNS = [
  /\bset\b/, /\bsets\b/, /\bchange[ds]?\b/, /\bcorrects?\b/, /\bcorrected\b/,
  /\bmake\s+it\b/, /\bmakes\s+it\b/, /\bis\s+now\b/, /\bare\s+now\b/,
  /\bequals?\b/, /\bshould\s+be\b/, /\bput\b/, /\bfix(?:es|ed)?\b/,
  /\boverride\b/, /\breplace\b/,
];

const ADD_PATTERNS = [
  /\bgoes?\s+up\b/, /\bwent\s+up\b/, /\bup\s+by\b/,
  /\badds?\b/, /\badded\b/, /\bgives?\b/, /\bgave\b/, /\bplus\b/,
  /\bawards?\b/, /\bawarded\b/, /\bincreases?\b/, /\bincreased\b/,
  /\bgains?\b/, /\bgained\b/, /\bearns?\b/, /\bearned\b/,
  /\bscores?\b/, /\bscored\b/, /\bgets?\b/, /\bgot\b/, /\bbumps?\b/,
  /\bwins?\b/, /\bwon\b/, /\bcredits?\b/, /\bbonus\b/,
];

function detectOp(clause) {
  for (const re of SUBTRACT_PATTERNS) if (re.test(clause)) return 'subtract';
  for (const re of SET_PATTERNS) if (re.test(clause)) return 'set';
  for (const re of ADD_PATTERNS) if (re.test(clause)) return 'add';
  return 'add'; // bare "Alice 25" means award 25
}

/* ------------------------------------------------------------------ *
 * 5. Global (non-scoring) commands
 * ------------------------------------------------------------------ */

const GLOBAL_COMMANDS = [
  { type: 'NEXT_ROUND', patterns: [/\bnext\s+round\b/, /\bnew\s+round\b/, /\badd\s+a?\s*round\b/, /\bstart\s+(?:the\s+)?next\s+round\b/, /\bround\s+over\b/, /\banother\s+round\b/] },
  { type: 'UNDO', patterns: [/\bundo\b/, /\bscratch\s+that\b/, /\bnever\s*mind\b/, /\bgo\s+back\b/, /\brevert\b/, /\btake\s+that\s+back\b/, /\bmy\s+(?:bad|mistake)\b/, /\bcancel\s+that\b/] },
  { type: 'END_GAME', patterns: [/\bend\s+(?:the\s+)?game\b/, /\bfinish\s+(?:the\s+)?game\b/, /\bgame\s+over\b/, /\bthats?\s+(?:the\s+)?(?:end|game)\b/, /\bfinal\s+whistle\b/, /\bdeclare\s+(?:the\s+)?winner\b/] },
  { type: 'RESET', patterns: [/\breset\s+(?:the\s+)?(?:scores?|board|everything|all)\b/, /\bclear\s+(?:the\s+)?(?:scores?|board|everything|all)\b/, /\bstart\s+over\b/, /\bwipe\s+(?:the\s+)?(?:scores?|board)\b/] },
  { type: 'START_CLOCK', patterns: [/\bstart\s+(?:the\s+)?(?:clock|timer|time)\b/, /\bresume\s+(?:the\s+)?(?:clock|timer)\b/, /\bplay\s+(?:the\s+)?(?:clock|timer)\b/, /\bclock\s+on\b/, /\btime\s+in\b/] },
  { type: 'STOP_CLOCK', patterns: [/\bstop\s+(?:the\s+)?(?:clock|timer|time)\b/, /\bpause\s+(?:the\s+)?(?:clock|timer)\b/, /\bclock\s+off\b/, /\btime\s*out\b/, /\bhold\s+(?:the\s+)?clock\b/] },
  { type: 'RESET_CLOCK', patterns: [/\breset\s+(?:the\s+)?(?:clock|timer)\b/, /\bclear\s+(?:the\s+)?(?:clock|timer)\b/] },
  { type: 'NEXT_PERIOD', patterns: [/\bnext\s+(?:period|quarter|half|inning|set)\b/, /\b(?:period|quarter|half|inning|set)\s+over\b/, /\bend\s+(?:of\s+)?(?:the\s+)?(?:period|quarter|half|inning|set)\b/] },
  { type: 'HELP', patterns: [/\bwhat\s+can\s+(?:i|you)\s+say\b/, /\bshow\s+(?:me\s+)?(?:the\s+)?commands?\b/, /\bvoice\s+help\b/, /\bhelp\s+me\b/] },
];

function detectGlobalCommand(text) {
  for (const cmd of GLOBAL_COMMANDS) {
    for (const re of cmd.patterns) {
      if (re.test(text)) return cmd.type;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 5b. Questions
 *
 * Asking is not scoring — "who's on top" must never be read as an instruction.
 * Queries are matched before the scoring parser gets a look at the sentence.
 * ------------------------------------------------------------------ */

const ORDINAL_WORDS = {
  first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3,
  fourth: 4, '4th': 4, fifth: 5, '5th': 5, last: -1, bottom: -1,
};

const QUERY_RULES = [
  // Specific placings first — "who's in second" must not be read as "who's winning".
  {
    kind: 'rank',
    patterns: [
      /\bwho(?:s|se|\s+is|\s+are)?\s+(?:in\s+)?(?:the\s+)?(second|third|fourth|fifth|2nd|3rd|4th|5th)\b/,
      /\bwho(?:s|\s+is)?\s+(?:in\s+)?(?:the\s+)?(last|bottom)\s*(?:place|position)?\b/,
      /\bwho(?:s|\s+is)?\s+(?:coming\s+)?(last)\b/,
    ],
  },
  {
    kind: 'leader',
    patterns: [
      /\bwho(?:s|se|\s+is|\s+are)?\s+(?:currently\s+)?(?:winning|leading|ahead|on\s+top|out\s+in\s+front|in\s+front)\b/,
      /\bwho(?:s|\s+is)?\s+(?:in\s+)?(?:the\s+)?lead\b/,
      /\bwho(?:s|\s+is)?\s+(?:at\s+)?(?:the\s+)?top(?:\s+of\s+the\s+(?:board|leaderboard|table))?\b/,
      /\bwho(?:s|\s+is)?\s+(?:in\s+)?(?:the\s+)?first\s*(?:place|position)?\b/,
      /\bwho(?:s|\s+is)?\s+(?:the\s+)?(?:leader|winner|best|champion)\b/,
      /\bwho\s+(?:has|got)\s+(?:the\s+)?(?:most|highest|top)\b/,
      /\bwho\s+is\s+number\s+1\b/,
      /\bwhats?\s+the\s+top\s+score\b/,
    ],
  },
  {
    kind: 'loser',
    patterns: [
      /\bwho(?:s|\s+is)?\s+(?:currently\s+)?(?:losing|behind|trailing)\b/,
      /\bwho\s+(?:has|got)\s+(?:the\s+)?(?:least|lowest|fewest)\b/,
      /\bwho\s+needs?\s+to\s+catch\s+up\b/,
    ],
  },
  {
    kind: 'gap',
    patterns: [
      /\bhow\s+far\s+(?:ahead|behind|apart)\b/,
      /\bwhats?\s+the\s+(?:gap|difference|margin|spread)\b/,
      /\bby\s+how\s+(?:much|many)\b/,
      /\bhow\s+close\s+(?:is\s+it|are\s+(?:we|they))\b/,
      /\bis\s+it\s+close\b/,
    ],
  },
  {
    kind: 'clock',
    patterns: [
      /\bhow\s+(?:much|long)\s+(?:time\s+)?(?:is\s+)?(?:left|remaining|to\s+go)\b/,
      /\bwhats?\s+(?:on\s+)?the\s+(?:clock|time)\b/,
      /\btime\s+(?:left|remaining)\b/,
      /\bwhat\s+(?:quarter|period|half|inning)\b/,
    ],
  },
  {
    kind: 'round',
    patterns: [
      /\b(?:what|which)\s+round\b/,
      /\bhow\s+many\s+rounds?\b/,
      /\bwhat\s+round\s+(?:is\s+it|are\s+we)\b/,
    ],
  },
  {
    kind: 'remaining',
    patterns: [
      /\bhow\s+(?:many|much)\s+(?:more\s+)?(?:points?\s+)?(?:to|until|till)\s+(?:win|the\s+target|the\s+end)\b/,
      /\bhow\s+close\s+to\s+(?:winning|the\s+target)\b/,
      /\bwhos?\s+closest\s+to\s+winning\b/,
    ],
  },
  {
    kind: 'standings',
    patterns: [
      /\b(?:read|say|tell\s+me|give\s+me|show\s+me)\s+(?:me\s+)?(?:the\s+)?(?:scores?|standings?|board|leaderboard|results?)\b/,
      /\bwhats?\s+the\s+(?:scores?|standings?|board|leaderboard)\b/,
      /\bwhere\s+(?:are\s+we|is\s+everyone|do\s+we\s+stand)\b/,
      /\bhow\s+are\s+we\s+doing\b/,
      /\bcurrent\s+(?:scores?|standings?)\b/,
      /\bscores?\s+please\b/,
    ],
  },
  // Lowest priority: "how many points does Alice have", "what's Bob's score".
  {
    kind: 'player_score',
    patterns: [
      /\bhow\s+(?:many|much)\s+(?:points?|score|does|has)\b/,
      /\bwhats?\s+.*\bscore\b/,
      /\bhow\s+is\s+.*\bdoing\b/,
      /\bwhere\s+is\b/,
      /\bwhat\s+(?:place|rank|position)\b/,
      /\bhow\s+many\s+does\b/,
    ],
  },
];

/**
 * Recognise a question and resolve what it is asking about.
 * Returns null when the sentence isn't a question.
 */
function detectQuery(text, players, ranking) {
  for (const rule of QUERY_RULES) {
    for (const re of rule.patterns) {
      const m = text.match(re);
      if (!m) continue;

      if (rule.kind === 'rank') {
        const word = (m[1] || '').toLowerCase();
        return { kind: 'rank', rank: ORDINAL_WORDS[word] ?? 2 };
      }

      if (rule.kind === 'player_score') {
        // Needs a subject; without one, fall back to reading the whole board.
        const { refs } = findPlayerRefs(text, players, ranking);
        if (!refs.length) return { kind: 'standings' };
        return {
          kind: 'player_score',
          playerId: refs[0].player.id,
          playerName: refs[0].player.name,
        };
      }

      // "how far ahead is Alice" — carry the subject through when there is one.
      if (rule.kind === 'gap') {
        const { refs } = findPlayerRefs(text, players, ranking);
        return refs.length
          ? { kind: 'gap', playerId: refs[0].player.id, playerName: refs[0].player.name }
          : { kind: 'gap' };
      }

      return { kind: rule.kind };
    }
  }
  return null;
}

/** True when the sentence is phrased as a question at all. */
function looksLikeQuestion(text) {
  return /\b(?:who|what|whats|which|where|how|is|are|do|does|tell|read|show|give)\b/.test(text);
}

/* ------------------------------------------------------------------ *
 * 6. Player reference resolution
 * ------------------------------------------------------------------ */

const ALL_PLAYERS_RE = /\b(?:everyone|everybody|all\s+(?:players?|teams?|participants?)|each\s+(?:player|team)|all\s+of\s+(?:them|us)|the\s+whole\s+(?:table|group))\b/;

const MASK = ' ';

function maskSpan(text, start, length) {
  return text.slice(0, start) + MASK.repeat(length) + text.slice(start + length);
}

/**
 * Find every player reference in a clause.
 * Returns { refs: [{ pos, player, kind, confidence }], masked }
 * `masked` has the matched spans blanked out so their digits are not
 * mistaken for scores ("player 1" must not contribute the number 1).
 */
function findPlayerRefs(clause, players, ranking) {
  const refs = [];
  let masked = clause;

  // --- everyone ---
  const allMatch = masked.match(ALL_PLAYERS_RE);
  if (allMatch) {
    players.forEach((p) => refs.push({ pos: allMatch.index, player: p, kind: 'all', confidence: 1 }));
    masked = maskSpan(masked, allMatch.index, allMatch[0].length);
    return { refs, masked };
  }

  // --- positional: "player 1", "team two", "p3", "number 4" ---
  const posRe = /\b(?:player|participant|team|counter|competitor|contestant|number|no|p|t)\s*(\d{1,2})\b/g;
  let m;
  while ((m = posRe.exec(masked)) !== null) {
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < players.length) {
      refs.push({ pos: m.index, player: players[idx], kind: 'positional', confidence: 0.99 });
      masked = maskSpan(masked, m.index, m[0].length);
      posRe.lastIndex = m.index + m[0].length;
    }
  }

  // --- ordinal position on the board: "the leader", "last place", "second place" ---
  if (ranking && ranking.length) {
    const ordinals = [
      { re: /\b(?:the\s+)?(?:leader|winner|first\s+place|top|number\s+1|in\s+the\s+lead)\b/, rank: 1 },
      { re: /\b(?:the\s+)?second\s+place\b/, rank: 2 },
      { re: /\b(?:the\s+)?third\s+place\b/, rank: 3 },
      { re: /\b(?:the\s+)?(?:last\s+place|loser|bottom|last)\b/, rank: -1 },
    ];
    for (const o of ordinals) {
      const om = masked.match(o.re);
      if (!om) continue;
      const entry = o.rank === -1 ? ranking[ranking.length - 1] : ranking[o.rank - 1];
      const player = entry && players.find((p) => p.id === entry.playerId);
      if (player) {
        refs.push({ pos: om.index, player, kind: 'ordinal', confidence: 0.9 });
        masked = maskSpan(masked, om.index, om[0].length);
      }
    }
  }

  // --- by name ---
  // Longest names first so "Ana Maria" wins over "Ana".
  const byLength = [...players].sort((a, b) => b.name.length - a.name.length);
  for (const p of byLength) {
    if (refs.some((r) => r.player.id === p.id)) continue;
    const name = p.name.toLowerCase();

    // exact / substring hit
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRe = new RegExp(`\\b${escaped}\\b`);
    const nm = masked.match(nameRe);
    if (nm) {
      refs.push({ pos: nm.index, player: p, kind: 'name', confidence: 1 });
      masked = maskSpan(masked, nm.index, nm[0].length);
      continue;
    }

    // fuzzy: compare each surviving word (and each adjacent word pair)
    const words = masked.split(/(\s+)/);
    let cursor = 0;
    let bestHit = null;
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      if (/^\s*$/.test(w) || w.includes(MASK)) { cursor += w.length; continue; }
      if (/^\d+$/.test(w) || STOPWORDS.has(w)) { cursor += w.length; continue; }

      const hit = matchPlayerName(w, [p], 0.7);
      if (hit && (!bestHit || hit.confidence > bestHit.confidence)) {
        bestHit = { pos: cursor, len: w.length, confidence: hit.confidence };
      }
      cursor += w.length;
    }
    if (bestHit) {
      refs.push({ pos: bestHit.pos, player: p, kind: 'fuzzy', confidence: bestHit.confidence });
      masked = maskSpan(masked, bestHit.pos, bestHit.len);
    }
  }

  refs.sort((a, b) => a.pos - b.pos);
  return { refs, masked };
}

// Words that must never be fuzzy-matched to a player name.
const STOPWORDS = new Set([
  'add', 'adds', 'give', 'gives', 'gave', 'plus', 'minus', 'set', 'sets', 'to', 'from',
  'for', 'the', 'a', 'an', 'and', 'points', 'point', 'score', 'scores', 'scored', 'pts',
  'remove', 'removes', 'take', 'takes', 'away', 'subtract', 'deduct', 'get', 'gets', 'got',
  'is', 'are', 'was', 'now', 'it', 'that', 'this', 'with', 'of', 'on', 'at', 'by', 'up',
  'down', 'make', 'makes', 'change', 'put', 'goal', 'goals', 'run', 'runs', 'please',
  'ok', 'okay', 'hey', 'um', 'uh', 'let', 'lets', 'can', 'you', 'i', 'we', 'they',
  'round', 'rounds', 'game', 'team', 'player', 'players', 'more', 'another', 'each',
]);

/* ------------------------------------------------------------------ *
 * 7. Clause splitting
 * ------------------------------------------------------------------ */

const CONNECTOR_RE = /\s+(?:and\s+then|and\s+also|then|also|after\s+that|next|plus\s+also)\s+|\s*,\s*|\s+and\s+/;

/**
 * Split into independent clauses, but keep "alice and bob" together —
 * a connector only splits when both sides carry their own number.
 */
function splitClauses(text) {
  const rawParts = text.split(CONNECTOR_RE).map((s) => s.trim()).filter(Boolean);
  if (rawParts.length <= 1) return [text.trim()];

  const merged = [];
  let buffer = '';
  for (const part of rawParts) {
    const hasNumber = /\d/.test(part);
    buffer = buffer ? `${buffer} ${part}` : part;
    if (hasNumber) {
      merged.push(buffer);
      buffer = '';
    }
  }
  if (buffer) {
    if (merged.length) merged[merged.length - 1] += ` ${buffer}`;
    else merged.push(buffer);
  }
  return merged.length ? merged : [text.trim()];
}

/* ------------------------------------------------------------------ *
 * 8. Number extraction
 * ------------------------------------------------------------------ */

function extractNumbers(masked) {
  const nums = [];
  const re = /(-)?\b(\d+(?:\.\d+)?)\b/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    // Ignore anything that leaked out of a masked span.
    if (masked.slice(Math.max(0, m.index - 1), m.index).includes(MASK)) continue;
    nums.push({ pos: m.index, value: parseFloat(m[2]) * (m[1] ? -1 : 1) });
  }
  return nums;
}

/* ------------------------------------------------------------------ *
 * 9. Main entry point
 * ------------------------------------------------------------------ */

/**
 * @param {string} transcript  raw speech text
 * @param {object} ctx
 * @param {Array}  ctx.players  [{ id, name }]
 * @param {Array}  [ctx.ranking] current ranking, enables "the leader" / "last place"
 * @param {number} [ctx.defaultStep] value to use when a command has no number ("add a point to Bob")
 * @returns {{ type, actions, transcript, normalized, confidence, reason }}
 */
export function parseCommand(transcript, ctx = {}) {
  const players = ctx.players || [];
  const ranking = ctx.ranking || null;
  const defaultStep = ctx.defaultStep ?? 1;

  const cleaned = normalize(transcript);
  const text = normalizeNumbers(cleaned);

  const base = { transcript, normalized: text, actions: [], confidence: 0, reason: '' };

  if (!text) return { ...base, type: 'UNKNOWN', reason: 'Nothing heard.' };

  // Control commands win over scoring — "add a round" is not "add".
  const global = detectGlobalCommand(text);
  if (global) return { ...base, type: global, confidence: 0.95 };

  if (!players.length) {
    return { ...base, type: 'UNKNOWN', reason: 'No players on this board yet.' };
  }

  // Questions are answered, never scored — check before the scoring parser so
  // "who's on top" can't be mistaken for an instruction.
  const query = detectQuery(text, players, ranking);
  if (query) return { ...base, type: 'QUERY', query, confidence: 0.92 };

  const clauses = splitClauses(text);
  const actions = [];
  let minConfidence = 1;

  for (const clause of clauses) {
    const { refs, masked } = findPlayerRefs(clause, players, ranking);
    if (!refs.length) continue;

    const op = detectOp(clause);
    const numbers = extractNumbers(masked);

    // Implicit quantity: "add a point to Bob", "Alice scores"
    if (!numbers.length) {
      if (op === 'set') continue; // "set Bob to" with no value is meaningless
      const implicit = /\b(?:points?|goals?|runs?|marks?|one|1)\b/.test(clause) || op !== 'add';
      if (!implicit && refs.length === 1 && refs[0].kind === 'name') continue;
      refs.forEach((r) => {
        actions.push({
          playerId: r.player.id,
          playerName: r.player.name,
          op,
          value: defaultStep,
          confidence: r.confidence * 0.8,
        });
        minConfidence = Math.min(minConfidence, r.confidence * 0.8);
      });
      continue;
    }

    if (refs.length === numbers.length) {
      // Pair in reading order: "Jhanavi 25 Rahul 18"
      refs.forEach((r, i) => {
        actions.push({
          playerId: r.player.id,
          playerName: r.player.name,
          op,
          value: numbers[i].value,
          confidence: r.confidence,
        });
        minConfidence = Math.min(minConfidence, r.confidence);
      });
    } else if (numbers.length === 1) {
      // One number, many players: "give alice and bob 10"
      refs.forEach((r) => {
        actions.push({
          playerId: r.player.id,
          playerName: r.player.name,
          op,
          value: numbers[0].value,
          confidence: r.confidence,
        });
        minConfidence = Math.min(minConfidence, r.confidence);
      });
    } else {
      // Mismatch — attach each player to its nearest number.
      refs.forEach((r) => {
        let nearest = numbers[0];
        let bestDist = Infinity;
        for (const n of numbers) {
          const d = Math.abs(n.pos - r.pos);
          if (d < bestDist) { bestDist = d; nearest = n; }
        }
        actions.push({
          playerId: r.player.id,
          playerName: r.player.name,
          op,
          value: nearest.value,
          confidence: r.confidence * 0.85,
        });
        minConfidence = Math.min(minConfidence, r.confidence * 0.85);
      });
    }
  }

  if (!actions.length) {
    // Clearly a question, just not one of the shapes above, and no number in it
    // to suggest a miscommand — read the board rather than shrug.
    if (looksLikeQuestion(text) && !/\d/.test(text)) {
      return { ...base, type: 'QUERY', query: { kind: 'standings' }, confidence: 0.5 };
    }
    return {
      ...base,
      type: 'UNKNOWN',
      reason: `Couldn't match a ${players.length ? 'player' : 'command'} in "${transcript}".`,
    };
  }

  // "add -5" is a subtraction; fold the sign into the operation.
  const finalActions = actions.map((a) => {
    if (a.op !== 'set' && a.value < 0) {
      return { ...a, op: a.op === 'add' ? 'subtract' : 'add', value: Math.abs(a.value) };
    }
    return a;
  });

  return { ...base, type: 'SCORE', actions: finalActions, confidence: minConfidence };
}

/** Human-readable one-liner for a parsed action, e.g. "Alice +5". */
export function describeAction(action) {
  const sign = action.op === 'add' ? '+' : action.op === 'subtract' ? '−' : '=';
  return `${action.playerName} ${sign}${action.value}`;
}

/** Grouped example phrases, used by the in-app voice help panel. */
export const VOICE_EXAMPLES = [
  {
    group: 'Add points',
    items: ['add 5 points to player 1', 'give Rahul ten', 'Jhanavi 25', 'Alice scored 12', 'everyone gets 3'],
  },
  {
    group: 'Take points away',
    items: ['remove 3 from Alice', 'minus two for player three', 'deduct 5 from Bob', 'Alice loses 4'],
  },
  {
    group: 'Correct a score',
    items: ['set Bob to 20', 'change player 2 to 15', 'make it 40 for Alice'],
  },
  {
    group: 'Several at once',
    items: ['Jhanavi 25 Rahul 18', 'add 5 to Alice and minus 2 for Bob'],
  },
  {
    group: 'Ask a question',
    items: [
      "who's on top",
      "who's winning",
      "who's last",
      "what's the score",
      "how many points does Alice have",
      "who's in second",
      "what's the gap",
      'what round is it',
      'how much time is left',
    ],
  },
  {
    group: 'Control the board',
    items: ['next round', 'undo', 'end game', 'start the clock', 'stop the clock'],
  },
];
