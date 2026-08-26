import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

import { init, isSignedIn, getBackendProblem, checkBackend } from './services/storageService';
import useStore from './hooks/useStore';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import CreateGame from './pages/CreateGame';
import ActiveGame from './pages/ActiveGame';
import Analysis from './pages/Analysis';
import History from './pages/History';
import Players from './pages/Players';
import Tournaments from './pages/Tournaments';

/** One clear explanation, instead of an unexplained failure on the next click. */
function BackendBanner({ message }) {
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="sticky top-0 z-50 bg-red-500/15 border-b border-red-500/30 px-4 py-2.5">
      <div className="max-w-5xl mx-auto flex items-start gap-2.5">
        <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-red-200 flex-1 leading-relaxed">{message}</p>
        <button
          onClick={async () => {
            setRetrying(true);
            await checkBackend();
            setRetrying(false);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-red-100 text-xs flex-shrink-0 transition-colors"
        >
          <RefreshCw size={12} className={retrying ? 'animate-spin' : ''} /> Retry
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  useStore();

  // `booting` covers the moment between "we have a remembered session" and
  // "the server has confirmed it". Without it the guard would bounce a
  // signed-in user to /login for a frame on every refresh.
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    init().finally(() => setBooting(false));
  }, []);

  const signedIn = isSignedIn();
  const onLoginPage = location.pathname === '/login';
  const backendProblem = getBackendProblem();

  if (booting) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <Loader2 size={18} className="animate-spin" /> Starting GameBoard…
        </div>
      </div>
    );
  }

  // Sign in first. Every board belongs to an account, so there is nothing
  // meaningful to show before we know who is asking.
  if (!signedIn && !onLoginPage) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (signedIn && onLoginPage) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      {backendProblem && <BackendBanner message={backendProblem} />}
      {!onLoginPage && <Sidebar />}
      <main className={onLoginPage ? '' : 'lg:ml-64 min-h-screen'}>
        <div className={onLoginPage ? '' : 'p-4 sm:p-6 lg:p-8 pt-16 lg:pt-8'}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/games/new" element={<CreateGame />} />
            <Route path="/games/:id" element={<ActiveGame />} />
            <Route path="/games/:id/analysis" element={<Analysis />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/tournaments/new" element={<Tournaments />} />
            <Route path="/players" element={<Players />} />
            <Route path="/history" element={<History />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
