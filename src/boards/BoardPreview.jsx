import React from 'react';

/**
 * Small abstract previews for the board picker — they show the shape of each
 * board at a glance without needing real data.
 */
export default function BoardPreview({ id, accent, active }) {
  const on = active ? accent : '#6b7280';
  const dim = active ? `${accent}66` : '#4b5563';
  const faint = active ? `${accent}33` : '#374151';

  const wrap = (children) => (
    <div
      className="h-[130px] rounded-lg flex items-center justify-center px-5 transition-colors duration-200"
      style={{ backgroundColor: active ? `${accent}14` : 'rgba(255,255,255,0.03)' }}
    >
      {children}
    </div>
  );

  switch (id) {
    case 'leaderboard':
      return wrap(
        <div className="w-full space-y-2">
          {[on, dim, on, dim].map((c, i) => (
            <div key={i} className="h-4 rounded" style={{ backgroundColor: c }} />
          ))}
        </div>
      );

    case 'scoresheet':
      return wrap(
        <div className="w-full space-y-1.5">
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="flex gap-1.5">
              {[0, 1, 2, 3].map((c) => (
                <div
                  key={c}
                  className="h-3.5 flex-1 rounded-sm"
                  style={{ backgroundColor: r === 0 ? on : c % 2 === 0 ? dim : faint }}
                />
              ))}
            </div>
          ))}
        </div>
      );

    case 'scoreboard':
      return wrap(
        <div className="flex gap-2.5 w-full">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex-1 rounded"
              style={{ height: '64px', backgroundColor: i === 1 ? on : dim }}
            />
          ))}
        </div>
      );

    case 'bracket':
      return wrap(
        <svg viewBox="0 0 120 84" className="w-full h-[84px]">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x="2" y={4 + i * 20} width="30" height="12" rx="2" fill={dim} />
          ))}
          {[0, 1].map((i) => (
            <rect key={i} x="46" y={14 + i * 40} width="30" height="12" rx="2" fill={i === 0 ? on : dim} />
          ))}
          <rect x="88" y="34" width="30" height="12" rx="2" fill={on} />
          <g stroke={faint} strokeWidth="1.5" fill="none">
            <path d="M32 10 h6 v10 h8" />
            <path d="M32 30 h6 v-10" />
            <path d="M32 50 h6 v10 h8" />
            <path d="M32 70 h6 v-10" />
            <path d="M76 20 h6 v20 h6" />
            <path d="M76 60 h6 v-20" />
          </g>
        </svg>
      );

    case 'sports':
      return wrap(
        <div className="w-full flex flex-col items-center gap-2">
          <span
            className="font-heading font-bold text-xl tabular-nums"
            style={{ color: active ? '#fff' : '#9ca3af' }}
          >
            00:00
          </span>
          <div className="flex items-center gap-1.5 w-full">
            <div className="flex-1 h-7 rounded" style={{ backgroundColor: dim }} />
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: faint, color: active ? '#fff' : '#9ca3af' }}
            >
              0
            </div>
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: faint, color: active ? '#fff' : '#9ca3af' }}
            >
              1
            </div>
            <div className="flex-1 h-7 rounded" style={{ backgroundColor: dim }} />
          </div>
          <span
            className="text-[10px] px-2 py-0.5 rounded"
            style={{ backgroundColor: faint, color: active ? '#fff' : '#9ca3af' }}
          >
            + Scorebug display
          </span>
        </div>
      );

    case 'counter':
      return wrap(
        <div className="flex gap-2.5 items-center">
          <div
            className="w-16 h-16 rounded flex items-center justify-center font-heading font-bold text-lg relative"
            style={{ backgroundColor: on, color: '#fff' }}
          >
            +1
            <svg viewBox="0 0 24 24" className="absolute -bottom-2 -right-2 w-6 h-6" fill={active ? '#1f2937' : '#374151'} stroke="#fff" strokeWidth="1">
              <path d="M5 3 L5 18 L9 14 L12 21 L15 19.5 L12 13 L18 13 Z" />
            </svg>
          </div>
          <div className="w-16 h-16 rounded" style={{ backgroundColor: dim }} />
        </div>
      );

    default:
      return wrap(<div className="w-full h-12 rounded" style={{ backgroundColor: dim }} />);
  }
}
