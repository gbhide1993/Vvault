import React from 'react';

export function Input({ className = '', ...props }) {
  return (
    <input 
      className={`w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 outline-none focus:border-accent font-sans font-normal transition-none placeholder:text-slate-600 ${className}`} 
      {...props} 
    />
  );
}

export function Select({ className = '', children, ...props }) {
  return (
    <select 
      className={`w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 outline-none focus:border-accent cursor-pointer font-sans font-normal transition-none ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className = '', children, ...props }) {
  return (
    <label className={`block text-xs font-normal text-slate-400 mb-1 tracking-wide uppercase ${className}`} {...props}>
      {children}
    </label>
  );
}