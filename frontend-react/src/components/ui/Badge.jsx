import React from 'react';

export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: "bg-slate-800 text-slate-300 border-slate-700",
    accent: "bg-accent/10 text-accent border-accent/30",
    success: "bg-green-900/30 text-green-400 border-green-500/50",
    danger: "bg-red-900/30 text-red-400 border-red-500/50",
    warning: "bg-yellow-900/30 text-yellow-400 border-yellow-500/50"
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] uppercase tracking-wider font-normal border transition-none ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}