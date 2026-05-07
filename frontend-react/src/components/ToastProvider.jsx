import React, { createContext, useContext, useState, useCallback } from 'react';

// 1. Create the Context
const ToastContext = createContext();

// 2. Create a custom hook so other components can easily use it
export const useToast = () => useContext(ToastContext);

// 3. The Provider Component
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      {/* Toast UI Container - Fixed to bottom right */}
      <div className="fixed bottom-6 right-6 z-100 flex flex-col gap-3">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`animate-enter px-4 py-3 rounded-lg shadow-lg border text-sm font-medium flex items-center gap-2 transition-all ${
              toast.type === 'success' 
                ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300' 
                : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300'
            }`}
          >
            {toast.type === 'success' ? '✅' : '⚠️'} {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
