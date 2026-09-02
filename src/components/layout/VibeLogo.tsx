import React from 'react';

interface VibeLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export const VibeLogo: React.FC<VibeLogoProps> = ({
  className = '',
  size = 36,
  showText = false,
}) => {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        style={{ width: size, height: size }}
        className="relative flex items-center justify-center rounded-2xl bg-black overflow-hidden shadow-lg shadow-black/40 shrink-0 hover:scale-105 transition-transform"
      >
        <img
          src="/logo.png"
          alt="mAI Vibe Logo"
          className="w-full h-full object-contain filter drop-shadow-md"
        />
      </div>
      {showText && (
        <span className="font-extrabold text-xl tracking-tight text-white flex items-center gap-1">
          <span>Vibe</span>
          <span className="text-[10px] font-mono font-normal px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">mAI</span>
        </span>
      )}
    </div>
  );
};
