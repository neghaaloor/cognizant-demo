/**
 * Web Speech API wrapper.
 *
 * Wraps SpeechRecognition in a small session object so callers get:
 *  - live interim transcripts (what the user is saying right now)
 *  - final transcripts (what they finished saying)
 *  - optional hands-free mode that survives the engine's automatic timeouts
 */

export function isSpeechSupported() {
  return typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Start a recognition session.
 *
 * @param {object} handlers
 * @param {(text:string)=>void}   handlers.onFinal    a completed utterance
 * @param {(text:string)=>void}   [handlers.onInterim] live partial text
 * @param {(err:string)=>void}    [handlers.onError]
 * @param {()=>void}              [handlers.onStop]   session fully stopped
 * @param {object} [options]
 * @param {boolean} [options.continuous=false] keep listening until stopped
 * @param {string}  [options.lang='en-US']
 * @returns {{ stop: ()=>void, isRunning: ()=>boolean }|null}
 */
export function createSpeechSession(handlers = {}, options = {}) {
  const SpeechRecognition =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  if (!SpeechRecognition) {
    handlers.onError?.('unsupported');
    return null;
  }

  const { continuous = false, lang = 'en-US' } = options;

  let recognition = null;
  let stopped = false;
  let restartTimer = null;

  const build = () => {
    const rec = new SpeechRecognition();
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 3;

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (!text) continue;
        if (result.isFinal) {
          handlers.onFinal?.(text);
        } else {
          interim += `${text} `;
        }
      }
      if (interim.trim()) handlers.onInterim?.(interim.trim());
    };

    rec.onerror = (event) => {
      // 'no-speech' and 'aborted' are routine in hands-free mode — the engine
      // simply timed out. Only surface errors the user can act on.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      handlers.onError?.(event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stopped = true;
      }
    };

    rec.onend = () => {
      if (stopped || !continuous) {
        recognition = null;
        handlers.onStop?.();
        return;
      }
      // Chrome ends the session every ~60s; restart to stay hands-free.
      restartTimer = setTimeout(() => {
        if (stopped) return;
        try {
          recognition = build();
          recognition.start();
        } catch {
          stopped = true;
          handlers.onStop?.();
        }
      }, 150);
    };

    return rec;
  };

  try {
    recognition = build();
    recognition.start();
  } catch (e) {
    handlers.onError?.(e?.message || 'start-failed');
    return null;
  }

  return {
    stop() {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      try {
        recognition?.stop();
      } catch {
        /* already stopped */
      }
      recognition = null;
    },
    isRunning() {
      return !stopped;
    },
  };
}

/** Friendly text for the error codes the API hands back. */
export function describeSpeechError(code) {
  switch (code) {
    case 'unsupported':
      return 'Voice input needs Chrome, Edge or Safari.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone blocked. Allow mic access in your browser settings.';
    case 'audio-capture':
      return 'No microphone found.';
    case 'network':
      return 'Speech service unreachable. Check your connection.';
    default:
      return `Microphone error: ${code}`;
  }
}
