-- ============================================================================
-- Board Game Scorekeeper - SQLite schema
-- Owner: Person 8 (Database)
-- Consumed by: Person 5 (Core APIs), Person 6 (Validation / Rules)
-- ----------------------------------------------------------------------------
-- Design rule: the scoreboard is GAME-AGNOSTIC. It stores who played, in which
-- round, and how many points they scored. It never stores or enforces the rules
-- of the physical game being played.
--
-- Source of truth: the `scores` table. Totals are ALWAYS derived with SUM().
-- We deliberately do NOT keep a `total_score` column on `players`, so a stored
-- total can never drift away from the round-by-round history.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- scoreboards : one scorekeeping SESSION (not a game)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scoreboards (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT,
    status         TEXT     NOT NULL DEFAULT 'SETUP'
                            CHECK (status IN ('SETUP', 'ACTIVE', 'ENDED')),
    current_round  INTEGER  NOT NULL DEFAULT 0,
    winner_id      INTEGER,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at     DATETIME,
    ended_at       DATETIME,
    FOREIGN KEY (winner_id)
        REFERENCES players(id)
        ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- players : belongs to exactly one scoreboard
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    scoreboard_id  INTEGER  NOT NULL,
    name           TEXT     NOT NULL,
    joined_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scoreboard_id)
        REFERENCES scoreboards(id)
        ON DELETE CASCADE,
    -- Two players in the SAME scoreboard cannot share a name.
    -- Different scoreboards may both have an "Abhiram".
    UNIQUE (scoreboard_id, name)
);

-- ---------------------------------------------------------------------------
-- rounds : Round 1, Round 2, ... within one scoreboard
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rounds (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    scoreboard_id  INTEGER  NOT NULL,
    round_number   INTEGER  NOT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scoreboard_id)
        REFERENCES scoreboards(id)
        ON DELETE CASCADE,
    UNIQUE (scoreboard_id, round_number)
);

-- ---------------------------------------------------------------------------
-- scores : THE most important table - one row per (round, player)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scores (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id       INTEGER  NOT NULL,
    player_id      INTEGER  NOT NULL,
    points         INTEGER  NOT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (round_id)
        REFERENCES rounds(id)
        ON DELETE CASCADE,
    FOREIGN KEY (player_id)
        REFERENCES players(id)
        ON DELETE CASCADE,
    -- A player can hold only ONE score in a given round.
    -- Blocks: Round 3 -> Abhiram 20 AND Round 3 -> Abhiram 40
    UNIQUE (round_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Indexes : the hot paths are "all players of a scoreboard", "all rounds of a
-- scoreboard" and "all scores of a round / of a player" (leaderboard + history)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_players_scoreboard  ON players (scoreboard_id);
CREATE INDEX IF NOT EXISTS idx_rounds_scoreboard   ON rounds  (scoreboard_id);
CREATE INDEX IF NOT EXISTS idx_rounds_number       ON rounds  (scoreboard_id, round_number);
CREATE INDEX IF NOT EXISTS idx_scores_round        ON scores  (round_id);
CREATE INDEX IF NOT EXISTS idx_scores_player       ON scores  (player_id);
