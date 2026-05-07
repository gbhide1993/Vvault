import React from 'react';

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  ...props 
}) {
  // Added whitespace-nowrap here to prevent two-line text
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-sans font-normal transition-none disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
  
  const variants = {
    primary: "bg-accent hover:bg-accent/90 text-slate-950 shadow-[0_0_15px_rgba(0,230,204,0.3)]",
    secondary: "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700",
    danger: "bg-red-600 hover:bg-red-700 text-white shadow-sm",
    success: "bg-green-600 hover:bg-green-700 text-white shadow-sm",
    ghost: "bg-transparent hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
  };

  const sizes = {
    sm: "h-8 px-4 text-xs",
    // Increased horizontal padding (px-6 to px-8) to give more breathing room
    md: "h-9 px-8 text-sm", 
    lg: "h-11 px-8 text-base"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}