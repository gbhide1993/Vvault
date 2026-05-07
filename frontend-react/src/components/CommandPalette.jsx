import React, { useState, useEffect, useRef } from 'react';

export default function CommandPalette({ isOpen, onClose, onNavigate }) {
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setSearch('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 1. Grouped Action Definitions
  const actions = [
    { id: 'nav-dashboard', name: 'Go to Executive Dashboard', category: 'Navigation', icon: '📊', type: 'nav', target: 'dashboard' },
    { id: 'filter-pending', name: 'Show Pending Questions', category: 'Shortcuts', icon: '⏳', type: 'filter', target: 'review', filter: 'pending' },
    { id: 'filter-approved', name: 'Show Approved Questions', category: 'Shortcuts', icon: '✅', type: 'filter', target: 'review', filter: 'approved' },
    { id: 'filter-rejected', name: 'Show Rejected Questions', category: 'Shortcuts', icon: '❌', type: 'filter', target: 'review', filter: 'rejected' },
    { id: 'nav-audit', name: 'View Audit History', category: 'Navigation', icon: '📋', type: 'nav', target: 'audit' },
    { id: 'nav-users', name: 'User Management', category: 'Admin', icon: '👥', type: 'nav', target: 'users' },
  ];

  const filteredActions = actions.filter(action => 
    action.name.toLowerCase().includes(search.toLowerCase()) ||
    action.category.toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set(filteredActions.map(a => a.category))];

  // 2. THE UNIFIED HANDLER (Fixed the duplicate error)
  const handleAction = (item) => {
    if (item.type === 'nav') {
      onNavigate(item.target);
    } else if (item.type === 'filter') {
      onNavigate(item.target, item.filter); 
    }
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % filteredActions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + filteredActions.length) % filteredActions.length);
    } else if (e.key === 'Enter') {
      if (filteredActions[activeIndex]) handleAction(filteredActions[activeIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-enter flex flex-col">
        <div className="flex items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <input 
            ref={inputRef}
            type="text" 
            placeholder="Search commands (e.g. 'pending')..." 
            className="w-full bg-transparent border-none outline-none px-4 text-lg text-slate-800 dark:text-white"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
          />
        </div>
        
        <div className="max-h-400px overflow-y-auto p-3">
          {categories.map(cat => (
            <div key={cat} className="mb-4">
              <h4 className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{cat}</h4>
              {filteredActions.filter(a => a.category === cat).map((action) => {
                const globalIdx = filteredActions.indexOf(action);
                const isActive = globalIdx === activeIndex;
                return (
                  <button
                    key={action.id}
                    onClick={() => handleAction(action)}
                    onMouseEnter={() => setActiveIndex(globalIdx)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm rounded-xl transition-all ${
                      isActive ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span>{action.icon}</span>
                      <span className="font-semibold">{action.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}