import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export default function CommentaryToggle({ enabled, onToggle }) {
  return (
    <button
      onClick={() => onToggle?.(!enabled)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 text-sm ${
        enabled
          ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
          : 'bg-white/5 text-text-muted border border-white/10 hover:bg-white/10'
      }`}
      title={enabled ? 'Disable commentary' : 'Enable commentary'}
    >
      {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
      <span className="hidden sm:inline">{enabled ? 'Commentary ON' : 'Commentary OFF'}</span>
    </button>
  );
}
