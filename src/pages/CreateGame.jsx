import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ListOrdered, Table2, LayoutGrid, Network, Timer, MousePointerClick,
  ArrowLeft, ArrowRight, Plus, X, Check, CheckCircle2,
} from 'lucide-react';
import boardTypes from '../boards/boardTypes';
import BoardPreview from '../boards/BoardPreview';
import { generateBracket } from '../boards/bracketEngine';
import { createGame, getPlayers } from '../services/storageService';

const iconMap = { ListOrdered, Table2, LayoutGrid, Network, Timer, MousePointerClick };

/**
 * Defined at module scope on purpose.
 *
 * This used to live inside renderConfig(), which gave it a brand-new component
 * identity on every render. React then unmounted and remounted the whole
 * subtree between keystrokes, so the board-name field lost focus and dropped
 * every character typed into it.
 */
function Row({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm text-text-secondary mb-2">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-text-muted mt-1.5">{hint}</p>}
    </div>
  );
}

const playerColors = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

export default function CreateGame() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [board, setBoard] = useState(null);
  const [name, setName] = useState('');
  const [config, setConfig] = useState({});
  const [players, setPlayers] = useState([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const existingPlayers = getPlayers();

  const chooseBoard = (b) => {
    setBoard(b);
    setName(`${b.name}`);
    setConfig({ ...b.defaults });
    setPlayers([]);
    setStep(2);
  };

  const setCfg = (patch) => setConfig((c) => ({ ...c, ...patch }));

  const addPlayer = (preset) => {
    const raw = preset ? preset.name : newName.trim();
    if (!raw) return;
    if (players.find((p) => p.name.toLowerCase() === raw.toLowerCase())) return;
    if (board && players.length >= board.playersMax) return;

    const player = {
      id: preset?.id || `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: raw,
      color: playerColors[players.length % playerColors.length],
    };
    setPlayers((list) => [...list, player]);
    if (!preset) setNewName('');
  };

  const removePlayer = (id) => setPlayers((list) => list.filter((p) => p.id !== id));

  const setColor = (id, color) =>
    setPlayers((list) => list.map((p) => (p.id === id ? { ...p, color } : p)));

  const enoughPlayers =
    board && players.length >= board.playersMin && players.length <= board.playersMax;

  const startGame = async () => {
    if (!board || !enoughPlayers || creating) return;

    // The backend lifecycle is SETUP -> ACTIVE: the roster can only be set
    // while in SETUP, and scores only accepted once started. createGame()
    // does all three steps, then opens Round 1.
    const boardState = {};
    if (board.id === 'bracket') boardState.bracket = generateBracket(players);
    if (board.id === 'sports') {
      boardState.sports = { running: false, startedAt: null, accumulatedMs: 0, period: 1 };
    }

    setCreating(true);
    setCreateError('');
    try {
      const game = await createGame({
        name: name.trim() || board.name,
        boardId: board.id,
        boardName: board.name,
        config,
        players,
        boardState: Object.keys(boardState).length ? boardState : undefined,
      });
      navigate(`/games/${game.id}`);
    } catch (e) {
      setCreateError(e.message || 'Could not create the board.');
      setCreating(false);
    }
  };

  /* ---------------------------------------------------------------- */

  const renderConfig = () => {
    if (!board) return null;
    const numberInput = (key, props = {}) => (
      <input
        type="number"
        value={config[key] ?? 0}
        onChange={(e) => setCfg({ [key]: Math.max(props.min ?? 0, parseInt(e.target.value) || 0) })}
        className="w-32 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-accent-blue/50 transition-all"
        {...props}
      />
    );

    const toggle = (key, offLabel, onLabel, hint) => (
      <div className="flex gap-2">
        {[
          { val: true, label: onLabel },
          { val: false, label: offLabel },
        ].map((opt) => (
          <button
            key={String(opt.val)}
            onClick={() => setCfg({ [key]: opt.val })}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
              config[key] === opt.val
                ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue'
                : 'bg-white/5 border-white/10 text-text-secondary hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );

    return (
      <div className="space-y-6">
        <Row label="Board name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={board.name}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-accent-blue/50 transition-all"
          />
        </Row>

        {board.id !== 'bracket' && board.id !== 'sports' && (
          <Row
            label={board.id === 'counter' ? 'Amount per tap' : 'Amount per button press'}
            hint="Voice commands can still name any amount — this only sets the buttons."
          >
            {numberInput('step', { min: 1 })}
          </Row>
        )}

        {board.id === 'scoresheet' && (
          <Row label="Rounds to plan for" hint="You can always add or remove rounds later.">
            {numberInput('maxRounds', { min: 1, max: 100 })}
          </Row>
        )}

        {(board.id === 'leaderboard' || board.id === 'scoresheet' || board.id === 'scoreboard') && (
          <>
            <Row label="Who wins?">
              {toggle('highestWins', 'Lowest score wins', 'Highest score wins')}
            </Row>
            <Row label="Target score" hint="Set 0 for no target. Shows a progress bar and a 'to go' count.">
              {numberInput('targetScore', { min: 0 })}
            </Row>
          </>
        )}

        {board.id === 'sports' && (
          <>
            <Row label="Period name">
              <div className="flex gap-2 flex-wrap">
                {['Quarter', 'Half', 'Period', 'Inning', 'Set'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setCfg({ periodLabel: p })}
                    className={`px-3.5 py-2 rounded-lg text-sm border transition-all ${
                      config.periodLabel === p
                        ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue'
                        : 'bg-white/5 border-white/10 text-text-secondary hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Row>
            <Row label={`Number of ${(config.periodLabel || 'Quarter').toLowerCase()}s`}>
              {numberInput('periodCount', { min: 1, max: 12 })}
            </Row>
            <Row label="Length (minutes)">
              <input
                type="number"
                min={1}
                value={Math.round((config.periodLength || 720) / 60)}
                onChange={(e) =>
                  setCfg({ periodLength: Math.max(1, parseInt(e.target.value) || 1) * 60 })
                }
                className="w-32 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-accent-blue/50 transition-all"
              />
            </Row>
            <Row label="Clock direction">
              {toggle('countDown', 'Count up', 'Count down')}
            </Row>
          </>
        )}

        {board.id === 'bracket' && (
          <p className="text-sm text-text-secondary">
            Seeding is drawn automatically from the order you add competitors, and byes are
            filled in for you. Nothing else to set up.
          </p>
        )}
      </div>
    );
  };

  /* ---------------------------------------------------------------- */

  return (
    <div className="max-w-5xl mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <button
              onClick={() => s < step && setStep(s)}
              disabled={s >= step}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                step >= s ? 'bg-accent-blue text-white' : 'bg-white/5 text-text-muted'
              } ${s < step ? 'cursor-pointer hover:bg-accent-blue/80' : ''}`}
            >
              {step > s ? <Check size={14} /> : s}
            </button>
            {s < 3 && (
              <div className={`flex-1 h-0.5 transition-all ${step > s ? 'bg-accent-blue' : 'bg-white/10'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1 — board type */}
      {step === 1 && (
        <div>
          <h2 className="font-heading text-2xl font-bold text-white mb-1 text-center">
            Choose a board type to get started
          </h2>
          <p className="text-text-secondary mb-8 text-center text-sm">
            Every board supports voice scoring.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {boardTypes.map((b) => {
              const Icon = iconMap[b.icon];
              const selected = board?.id === b.id;
              return (
                <div
                  key={b.id}
                  className={`relative rounded-xl border overflow-hidden transition-all duration-200 ${
                    selected ? 'ring-2' : 'hover:border-white/20'
                  }`}
                  style={{
                    borderColor: selected ? b.accent : 'rgba(255,255,255,0.08)',
                    boxShadow: selected ? `0 0 0 2px ${b.accent}55` : 'none',
                    backgroundColor: selected ? `${b.accent}0a` : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <button onClick={() => setBoard(b)} className="w-full text-left p-3">
                    {selected && (
                      <CheckCircle2
                        size={22}
                        className="absolute top-4 right-4 z-10"
                        style={{ color: b.accent }}
                        fill="#0f0f1a"
                      />
                    )}
                    <BoardPreview id={b.id} accent={b.accent} active={selected} />

                    <div className="px-2 pt-4 pb-1">
                      <h3
                        className="font-heading font-bold mb-1.5 flex items-center gap-2"
                        style={{ color: b.accent }}
                      >
                        {Icon && <Icon size={17} />}
                        {b.name}
                      </h3>
                      <p className="text-xs text-text-secondary leading-relaxed">{b.tagline}</p>
                    </div>
                  </button>

                  {selected && (
                    <div className="px-5 pb-5">
                      <p className="text-[11px] text-text-muted leading-relaxed mb-4">{b.blurb}</p>
                      <button
                        onClick={() => chooseBoard(b)}
                        className="w-full py-2.5 rounded-lg text-white font-medium text-sm transition-all hover:brightness-110"
                        style={{ backgroundColor: b.accent }}
                      >
                        Create
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2 — configure */}
      {step === 2 && board && (
        <div>
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-1 text-sm text-text-secondary hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={16} /> Board types
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${board.accent}22` }}
            >
              {iconMap[board.icon] &&
                React.createElement(iconMap[board.icon], { size: 20, style: { color: board.accent } })}
            </div>
            <div>
              <h2 className="font-heading text-2xl font-bold text-white">Configure</h2>
              <p className="text-text-muted text-xs">{board.name}</p>
            </div>
          </div>

          <div className="glass-card-static p-6 max-w-lg">
            {renderConfig()}

            <button
              onClick={() => setStep(3)}
              disabled={!name.trim()}
              className="mt-8 flex items-center gap-2 px-6 py-3 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all"
            >
              Next: add {board.playerNoun.toLowerCase()}s <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — participants */}
      {step === 3 && board && (
        <div>
          <button
            onClick={() => setStep(2)}
            className="flex items-center gap-1 text-sm text-text-secondary hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={16} /> Configure
          </button>

          <h2 className="font-heading text-2xl font-bold text-white mb-1">
            Add {board.playerNoun.toLowerCase()}s
          </h2>
          <p className="text-text-secondary mb-6 text-sm">
            {board.fixedPlayers
              ? `This board is exactly ${board.fixedPlayers} ${board.playerNoun.toLowerCase()}s.`
              : `${board.playersMin}–${board.playersMax} allowed.`}{' '}
            Currently {players.length}.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card-static p-6 h-fit">
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
                  placeholder={`${board.playerNoun} name`}
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-accent-blue/50 transition-all"
                />
                <button
                  onClick={() => addPlayer()}
                  disabled={!newName.trim() || players.length >= board.playersMax}
                  className="px-4 py-3 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white transition-all"
                >
                  <Plus size={18} />
                </button>
              </div>

              {existingPlayers.length > 0 && players.length < board.playersMax && (
                <div>
                  <p className="text-xs text-text-muted mb-2">Quick add:</p>
                  <div className="flex flex-wrap gap-2">
                    {existingPlayers
                      .filter((ep) => !players.find((p) => p.name.toLowerCase() === ep.name.toLowerCase()))
                      .slice(0, 10)
                      .map((ep) => (
                        <button
                          key={ep.id}
                          onClick={() => addPlayer(ep)}
                          className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-text-secondary hover:text-white hover:bg-white/10 transition-all"
                        >
                          + {ep.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-text-muted mt-4 leading-relaxed">
                Voice can refer to anyone by name or by position — “player 1” is whoever is
                first in this list.
              </p>
            </div>

            <div className="space-y-2">
              {players.map((player, index) => (
                <div key={player.id} className="glass-card-static p-3 flex items-center gap-3">
                  <span className="text-text-muted text-xs w-10 flex-shrink-0">#{index + 1}</span>
                  <div className="flex gap-1 flex-shrink-0">
                    {playerColors.slice(0, 6).map((color) => (
                      <button
                        key={color}
                        onClick={() => setColor(player.id, color)}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${
                          player.color === color
                            ? 'border-white scale-110'
                            : 'border-transparent opacity-50 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className="flex-1 text-white text-sm truncate">{player.name}</span>
                  <button
                    onClick={() => removePlayer(player.id)}
                    className="text-text-muted hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}

              {players.length === 0 && (
                <p className="text-text-muted text-sm text-center py-10">
                  No one added yet.
                </p>
              )}
            </div>
          </div>

          <div className="mt-8">
            <button
              onClick={startGame}
              disabled={!enoughPlayers || creating}
              className="flex items-center gap-2 px-8 py-4 bg-accent-green hover:bg-accent-green/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white font-semibold text-lg transition-all"
            >
              {creating ? 'Creating…' : 'Create board'} <ArrowRight size={20} />
            </button>
            {createError && <p className="text-sm text-red-400 mt-3">{createError}</p>}
            {!enoughPlayers && players.length > 0 && (
              <p className="text-xs text-red-400 mt-2">
                Needs {board.playersMin}–{board.playersMax} {board.playerNoun.toLowerCase()}s.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
