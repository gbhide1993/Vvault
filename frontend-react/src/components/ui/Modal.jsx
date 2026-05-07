import React from 'react';

export function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-slate-900 w-full max-w-lg rounded-xl shadow-2xl border border-slate-700 p-6 flex flex-col font-sans">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg text-white font-normal tracking-tight">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-none text-xl">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}