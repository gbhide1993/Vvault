import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import SetupRun from './components/SetupRun';
import AnswerLibrary from './components/AnswerLibrary';
import AnswerReview from './components/AnswerReview';
import AuditLogs from './components/AuditLogs';
import UserManagement from './components/UserManagement';
import KnowledgeBase from './components/KnowledgeBase';
import CommandPalette from './components/CommandPalette';
import Login from './components/Login';
import { ToastProvider } from './components/ToastProvider';

export default function App() {
  // --- GATEKEEPER ---
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem('token') && localStorage.getItem('token') !== 'null'
  );
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);

  // User Data from Storage
  const userName = localStorage.getItem('user') || 'Girish Bhide';
  const userRole = localStorage.getItem('role') || 'Senior Business Analyst';

  // --- SHORTCUTS (Ctrl+K) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCmdPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    window.location.reload(); 
  };

  if (!isAuthenticated) return <Login onLoginSuccess={handleLoginSuccess} />;

  return (
    <ToastProvider>
      <div className="flex h-screen bg-slate-950 text-slate-200 font-sans font-normal overflow-hidden selection:bg-accent/30">
        
        {/* SIDEBAR: Obsidian Glassmorphism */}
        <aside className="w-64 border-r border-slate-800 flex flex-col bg-slate-900/50 backdrop-blur-xl">
          <div className="p-6 flex items-center gap-3">
            {/* Vvault Logo with Neon Shadow */}
            <div className="w-8 h-8 bg-accent rounded flex items-center justify-center text-slate-950 text-lg shadow-[0_0_20px_rgba(0,230,204,0.4)]">
              V
            </div>
            <h1 className="text-xl text-white tracking-tight font-normal">Vvault</h1>
          </div>

          <nav className="flex-1 px-4 space-y-1 mt-4">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'run', label: 'Setup & Run' },
              { id: 'knowledge', label: 'Knowledge Base' },
              { id: 'review', label: 'Answer Review' },
              { id: 'library', label: 'Answer Library' },
              { id: 'audit', label: 'Audit Logs' },
              { id: 'users', label: 'User Management' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center px-4 py-2.5 rounded-lg text-sm transition-none font-normal ${
                  activeTab === item.id 
                    ? 'bg-accent/10 text-accent border border-accent/30 shadow-[0_0_15px_rgba(0,230,204,0.1)]' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* PROFILE SECTION: Bottom-Left Enterprise Card */}
          <div className="p-4 border-t border-slate-800/50">
            <div className="mb-4 px-3 py-3 bg-slate-950/40 rounded-xl border border-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-[10px] font-normal text-accent">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs text-white truncate font-normal tracking-wide">{userName}</p>
                <p className="text-[10px] text-slate-500 truncate font-normal uppercase tracking-tighter">{userRole}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full text-left px-4 py-1 text-[10px] text-slate-500 hover:text-red-400 font-normal transition-none uppercase tracking-widest"
            >
              Secure Logout
            </button>
          </div>
        </aside>

        {/* MAIN AREA: Obsidian Gradient[cite: 5] */}
        <main className="flex-1 overflow-y-auto p-8 bg-[radial-gradient(circle_at_top_right,var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
          <div className="max-w-6xl mx-auto">
            {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
            {activeTab === 'run' && <SetupRun onNavigate={setActiveTab}/>}
            {activeTab === 'knowledge' && <KnowledgeBase />}
            {activeTab === 'library' && <AnswerLibrary />}
            {activeTab === 'review' && <AnswerReview />}
            {activeTab === 'audit' && <AuditLogs />}
            {activeTab === 'users' && <UserManagement />}
          </div>
        </main>

        <CommandPalette 
          isOpen={isCmdPaletteOpen} 
          onClose={() => setIsCmdPaletteOpen(false)} 
          onNavigate={(tab) => { setActiveTab(tab); setIsCmdPaletteOpen(false); }}
        />
      </div>
    </ToastProvider>
  );
}