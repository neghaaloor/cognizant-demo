import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Gamepad2,
  Trophy,
  Users,
  History,
  Menu,
  X,
  LogOut,
  Cloud,
  CloudOff,
  RefreshCw,
} from 'lucide-react';
import {
  getUser,
  signOut,
  getSyncStatus,
  refresh,
} from '../services/storageService';
import useStore from '../hooks/useStore';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/games/new', label: 'New Board', icon: Gamepad2 },
  { to: '/tournaments', label: 'Tournaments', icon: Trophy },
  { to: '/players', label: 'Players', icon: Users },
  { to: '/history', label: 'History', icon: History },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useStore();
  const user = getUser();
  const status = getSyncStatus();

  const handleLogout = () => {
    // Wipes this account's cached boards as well as the session, so the next
    // person to sign in on this browser starts from their own history.
    signOut();
  };

  const linkClasses = (isActive) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-sm font-medium ${
      isActive
        ? 'bg-accent-blue/20 text-accent-blue'
        : 'text-text-secondary hover:bg-white/5 hover:text-white'
    }`;

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-dark-card border border-dark-border text-white"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-full w-64 bg-[#0a0a14] border-r border-dark-border flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-dark-border">
          <h1 className="font-heading text-2xl font-bold text-white flex items-center gap-2">
            <Gamepad2 className="text-accent-blue" size={28} />
            GameBoard
          </h1>
          <p className="text-text-muted text-xs mt-1">Score Keeper Platform</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => linkClasses(isActive)}
              onClick={() => setOpen(false)}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Sync status */}
        <div className="px-4 pb-2">
          {(() => {
            const online = status === 'online';
            const trying = status === 'connecting';
            const label = online
              ? 'Synced across devices'
              : trying
              ? 'Connecting…'
              : 'Server unreachable';

            return (
              <button
                onClick={refresh}
                title="Retry sync now"
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] transition-all ${
                  online
                    ? 'bg-accent-green/10 text-accent-green hover:bg-accent-green/15'
                    : trying
                    ? 'bg-accent-amber/10 text-accent-amber hover:bg-accent-amber/15'
                    : 'bg-white/5 text-text-muted hover:bg-white/10'
                }`}
              >
                {trying ? (
                  <RefreshCw size={13} className="animate-spin flex-shrink-0" />
                ) : online ? (
                  <Cloud size={13} className="flex-shrink-0" />
                ) : (
                  <CloudOff size={13} className="flex-shrink-0" />
                )}
                <span className="truncate">{label}</span>
              </button>
            );
          })()}
        </div>

        {/* User */}
        <div className="p-4 border-t border-dark-border">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center text-accent-blue font-bold text-sm">
                  {user.name?.charAt(0)?.toUpperCase() || 'G'}
                </div>
                <span className="text-sm text-white truncate max-w-[120px]">
                  {user.name || 'Guest'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="text-text-muted hover:text-red-400 transition-colors"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <NavLink
              to="/login"
              className="text-sm text-accent-blue hover:underline"
            >
              Sign In
            </NavLink>
          )}
        </div>
      </aside>
    </>
  );
}
