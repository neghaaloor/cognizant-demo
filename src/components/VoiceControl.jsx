import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, HelpCircle, X, Radio, Undo2, MessageSquareQuote, Volume2 } from 'lucide-react';
import { createSpeechSession, isSpeechSupported, describeSpeechError } from '../services/speechService';
import { parseCommand, describeAction, VOICE_EXAMPLES } from '../services/voiceCommands';

/**
 * Microphone UI + command dispatch.
 *
 * Push-to-talk by default; a hands-free toggle keeps the mic open so a whole
 * game can be scored without touching the screen. Every applied command lands
 * in a feed with a one-tap undo, because mishearing a score is inevitable.
 */
export default function VoiceControl({ players, ranking, defaultStep = 1, onCommand, onUndo, disabled }) {
  const [listening, setListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [interim, setInterim] = useState('');
  const [feed, setFeed] = useState([]); // [{ id, text, detail, kind }]
  const [answer, setAnswer] = useState(null); // { question, text, rows, title }
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const sessionRef = useRef(null);
  const seqRef = useRef(0);
  // Handlers change every render; keep them in a ref so the live speech
  // session always calls the current one without being torn down.
  const ctxRef = useRef({ players, ranking, defaultStep, onCommand });
  ctxRef.current = { players, ranking, defaultStep, onCommand };

  const supported = isSpeechSupported();

  const pushFeed = useCallback((entry) => {
    const id = ++seqRef.current;
    setFeed((f) => [{ id, ...entry }, ...f].slice(0, 6));
    return id;
  }, []);

  const handleFinal = useCallback(
    (transcript) => {
      setInterim('');
      const { players: ps, ranking: rk, defaultStep: step, onCommand: cb } = ctxRef.current;

      const parsed = parseCommand(transcript, { players: ps, ranking: rk, defaultStep: step });

      if (parsed.type === 'UNKNOWN') {
        pushFeed({ text: transcript, detail: parsed.reason || 'Not understood', kind: 'miss' });
        return;
      }

      if (parsed.type === 'HELP') {
        setShowHelp(true);
        pushFeed({ text: transcript, detail: 'Showing commands', kind: 'info' });
        return;
      }

      const result = cb?.(parsed);

      // A question gets an answer card that stays put — it's the reply, not a
      // log line, and people need a moment to read it.
      if (parsed.type === 'QUERY' && result?.answer) {
        setAnswer({ question: transcript, ...result.answer });
        return;
      }

      const detail =
        parsed.type === 'SCORE'
          ? parsed.actions.map(describeAction).join('   ')
          : result?.label || parsed.type.replace(/_/g, ' ').toLowerCase();

      // Any other command supersedes the previous answer.
      setAnswer(null);
      pushFeed({
        text: transcript,
        detail,
        kind: result?.ok === false ? 'miss' : 'hit',
        undoable: result?.undoable !== false && parsed.type === 'SCORE',
      });
    },
    [pushFeed]
  );

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(
    (continuous) => {
      setError('');
      const session = createSpeechSession(
        {
          onFinal: handleFinal,
          onInterim: setInterim,
          onError: (code) => {
            setError(describeSpeechError(code));
            if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'unsupported') {
              setHandsFree(false);
              setListening(false);
            }
          },
          onStop: () => {
            setListening(false);
            setInterim('');
          },
        },
        { continuous }
      );

      if (!session) {
        setListening(false);
        setHandsFree(false);
        return;
      }
      sessionRef.current = session;
      setListening(true);
    },
    [handleFinal]
  );

  const toggleMic = () => {
    if (listening) {
      setHandsFree(false);
      stop();
    } else {
      start(false);
    }
  };

  const toggleHandsFree = () => {
    if (handsFree) {
      setHandsFree(false);
      stop();
    } else {
      stop();
      setHandsFree(true);
      start(true);
    }
  };

  // Stop the mic when the board is finished or the component unmounts.
  useEffect(() => {
    if (disabled) {
      setHandsFree(false);
      stop();
    }
  }, [disabled, stop]);

  useEffect(() => () => sessionRef.current?.stop(), []);

  // Hold Space to talk (ignored while typing in a field).
  useEffect(() => {
    if (disabled || !supported) return;
    let held = false;
    const isTyping = (el) =>
      el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

    const down = (e) => {
      if (e.code !== 'Space' || e.repeat || held || handsFree) return;
      if (isTyping(document.activeElement)) return;
      e.preventDefault();
      held = true;
      start(false);
    };
    const up = (e) => {
      if (e.code !== 'Space' || !held) return;
      held = false;
      stop();
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [disabled, supported, handsFree, start, stop]);

  if (!supported) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <MicOff size={16} />
        <span>Voice needs Chrome, Edge or Safari</span>
      </div>
    );
  }

  const active = listening || handsFree;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={toggleMic}
          disabled={disabled}
          className={`relative flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            active
              ? 'bg-red-500 text-white pulse-mic'
              : 'bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25'
          }`}
          title={active ? 'Stop listening' : 'Start listening (or hold Space)'}
        >
          {active ? <Mic size={17} /> : <MicOff size={17} />}
          {active ? 'Listening…' : 'Voice'}
        </button>

        <button
          onClick={toggleHandsFree}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            handsFree
              ? 'bg-accent-green/20 text-accent-green'
              : 'bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white'
          }`}
          title="Keep the mic open for the whole game"
        >
          <Radio size={14} />
          Hands-free
        </button>

        <button
          onClick={() => setShowHelp(true)}
          className="p-2.5 rounded-xl bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-all"
          title="What can I say?"
        >
          <HelpCircle size={16} />
        </button>

        {!active && !interim && !error && (
          <span className="text-[11px] text-text-muted hidden sm:inline">
            or hold <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10">Space</kbd>
          </span>
        )}
      </div>

      {/* Live transcript */}
      {interim && (
        <p className="mt-2 text-sm text-text-secondary italic truncate">“{interim}”</p>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {/* Answer to a spoken question */}
      {answer && (
        <div className="mt-3 rounded-xl border border-accent-blue/25 bg-accent-blue/[0.07] overflow-hidden">
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-start gap-2.5">
              <MessageSquareQuote size={15} className="text-accent-blue mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-text-muted truncate">“{answer.question}”</p>
                <p className="text-sm text-white font-medium mt-1 flex items-start gap-1.5">
                  <Volume2 size={13} className="text-accent-blue mt-0.5 flex-shrink-0" />
                  <span>{answer.text}</span>
                </p>
              </div>
              <button
                onClick={() => setAnswer(null)}
                className="text-text-muted hover:text-white transition-colors flex-shrink-0"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {answer.rows?.length > 0 && (
            <div className="px-4 pb-3 pt-1">
              <div className="space-y-1">
                {answer.rows.slice(0, 8).map((row) => (
                  <div
                    key={`${row.rank}-${row.name}`}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs ${
                      row.rank === 1 ? 'bg-white/[0.06]' : 'bg-white/[0.02]'
                    }`}
                  >
                    <span
                      className={`w-5 text-center font-bold ${
                        row.rank === 1 ? 'gold-rank'
                        : row.rank === 2 ? 'silver-rank'
                        : row.rank === 3 ? 'bronze-rank'
                        : 'text-text-muted'
                      }`}
                    >
                      {row.rank}
                    </span>
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: row.color || '#3b82f6' }}
                    />
                    <span className="flex-1 text-white truncate">{row.name}</span>
                    <span className="text-text-secondary font-medium tabular-nums">{row.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Command feed */}
      {feed.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {feed.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-opacity ${
                item.kind === 'hit'
                  ? 'bg-accent-green/[0.08] border-accent-green/20'
                  : item.kind === 'miss'
                  ? 'bg-red-500/[0.07] border-red-500/20'
                  : 'bg-white/[0.03] border-white/[0.07]'
              }`}
              style={{ opacity: i === 0 ? 1 : Math.max(0.35, 1 - i * 0.18) }}
            >
              <span className="text-text-muted truncate max-w-[45%]">“{item.text}”</span>
              <span className="text-text-muted">→</span>
              <span
                className={`font-medium truncate flex-1 ${
                  item.kind === 'hit' ? 'text-accent-green' : item.kind === 'miss' ? 'text-red-400' : 'text-text-secondary'
                }`}
              >
                {item.detail}
              </span>
              {item.undoable && i === 0 && onUndo && (
                <button
                  onClick={() => {
                    onUndo();
                    setFeed((f) => f.filter((x) => x.id !== item.id));
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-text-secondary hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
                  title="Undo this"
                >
                  <Undo2 size={11} /> Undo
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Help — portalled to <body>: the surrounding glass card uses backdrop-filter,
          which would otherwise become the containing block for a fixed overlay. */}
      {showHelp && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="glass-card-static max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-heading text-lg font-bold text-white">What can I say?</h3>
              <button onClick={() => setShowHelp(false)} className="text-text-muted hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-text-muted mb-5">
              Say it naturally — names, positions (“player 2”) and word-numbers (“twenty five”) all work.
              Everything is processed on this device.
            </p>

            <div className="space-y-4">
              {VOICE_EXAMPLES.map((group) => (
                <div key={group.group}>
                  <p className="text-[11px] uppercase tracking-wide text-accent-blue mb-2">{group.group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((ex) => (
                      <span
                        key={ex}
                        className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/[0.07] text-xs text-text-secondary"
                      >
                        “{ex}”
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {players?.length > 0 && (
              <div className="mt-5 pt-4 border-t border-white/10">
                <p className="text-[11px] uppercase tracking-wide text-text-muted mb-2">
                  On this board
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {players.map((p, i) => (
                    <span key={p.id} className="px-2.5 py-1 rounded-lg bg-white/5 text-xs text-white">
                      {p.name} <span className="text-text-muted">= player {i + 1}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
