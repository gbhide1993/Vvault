import React from 'react';

export function NavItem({ isActive, onClick, children }) {
  const activeStyle = "bg-accent/10 text-accent border border-accent/30 shadow-[0_0_15px_rgba(0,230,204,0.1)]";
  const inactiveStyle = "text-slate-400 hover:text-slate-200 border border-transparent hover:bg-slate-800/50";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center px-4 py-2.5 rounded-lg text-sm transition-none font-normal ${isActive ? activeStyle : inactiveStyle}`}
    >
      {children}
    </button>
  );
}