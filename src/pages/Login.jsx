import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, ArrowRight, User } from 'lucide-react';
import { signIn, getBackendProblem } from '../services/storageService';

export default function Login() {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // The name is the account: sign in with the same name on another device and
  // your boards are there. Signing in offline still works — writes sync later.
  const enter = async (name) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await signIn(name);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e.message || 'Could not sign in. Is the server running?');
      setBusy(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    enter(username.trim());
  };

  const handleGuest = () => enter('Guest');

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 z-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(34,197,94,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(245,158,11,0.1) 0%, transparent 50%)',
            animation: 'pulse 8s ease-in-out infinite alternate',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass-card p-8 sm:p-10">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-blue/20 mb-4">
              <Gamepad2 size={32} className="text-accent-blue" />
            </div>
            <h1 className="font-heading text-3xl font-bold text-white">GameBoard</h1>
            <p className="text-text-secondary mt-2 text-sm">
              Track scores, celebrate victories
            </p>
            <p className="text-text-muted mt-3 text-xs leading-relaxed">
              Your name is your account. Sign in with the same name on any
              device to find your boards — and only yours.
            </p>
          </div>

          {/* Login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-2">
                Your Name
              </label>
              <div className="relative">
                <User
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/30 transition-all"
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!username.trim() || busy}
              className="w-full flex items-center justify-center gap-2 py-3 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all duration-200"
            >
              {busy ? 'Signing in…' : 'Enter GameBoard'}
              <ArrowRight size={18} />
            </button>
            {(error || getBackendProblem()) && (
              <p className="text-sm text-red-400 text-center leading-relaxed">
                {error || getBackendProblem()}
              </p>
            )}
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-text-muted">OR</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Guest */}
          <button
            onClick={handleGuest}
            className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-text-secondary hover:text-white font-medium transition-all duration-200"
          >
            Enter as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
