import React from 'react';

// Added className prop and removed hardcoded max-h to allow dynamic stretching
export function TableWrapper({ children, className = '' }) {
  return (
    <div className={`border border-slate-700 rounded-xl overflow-hidden bg-slate-900 shadow-lg relative overflow-y-auto ${className}`}>
      {children}
    </div>
  );
}

export function Table({ children }) {
  return <table className="w-full text-left border-collapse">{children}</table>;
}

export function TableHeader({ children }) {
  return (
    <thead className="sticky top-0 z-10 bg-slate-950 shadow-md">
      <tr className="text-slate-400 text-[10px] font-normal uppercase tracking-widest border-b border-slate-700">
        {children}
      </tr>
    </thead>
  );
}

export function TableHead({ className = '', children }) {
  return <th className={`p-4 font-normal ${className}`}>{children}</th>;
}

export function TableBody({ children }) {
  return <tbody className="text-sm divide-y divide-slate-800/50">{children}</tbody>;
}

export function TableRow({ children, className = '' }) {
  return (
    <tr className={`hover:bg-slate-800/50 transition-none group ${className}`}>
      {children}
    </tr>
  );
}

export function TableCell({ className = '', children }) {
  return <td className={`p-4 text-slate-300 font-normal ${className}`}>{children}</td>;
}