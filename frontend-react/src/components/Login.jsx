import React, { useState } from 'react';
import { Card, CardContent } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

const BASE_URL = '/api';

export default function Login({ onLoginSuccess }) {
  const [isSetup, setIsSetup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toLowerCase(), password })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Login failed');
      }

      const data = await res.json();
      
      const receivedToken = data.access_token || data.token;
      
      if (receivedToken) {
        localStorage.setItem('token', receivedToken);
        localStorage.setItem('user', data.username || 'admin');
        localStorage.setItem('role', data.role || 'admin');
        onLoginSuccess();
      } else {
        throw new Error("No token received from server");
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${BASE_URL}/cache/users/set-password?username=admin&new_password=${encodeURIComponent(password)}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to set password.');
      onLoginSuccess();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 font-sans font-normal">
      <Card className="w-full max-w-sm shadow-2xl border-slate-800">
        <CardContent className="p-8">
          
          {/* Logo Section */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 bg-accent rounded flex items-center justify-center text-slate-950 text-xl shadow-[0_0_20px_rgba(0,230,204,0.4)]">
              V
            </div>
            <h2 className="text-3xl font-normal text-white tracking-tight">Vvault</h2>
          </div>
          
          {!isSetup ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <Input 
                type="text" placeholder="Username" required
                value={username} onChange={(e) => setUsername(e.target.value)}
              />
              <Input 
                type="password" placeholder="Password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
              
              {error && (
                <div className="text-red-400 text-xs font-normal bg-red-900/20 p-3 rounded-lg border border-red-500/30">
                  {error}
                </div>
              )}
              
              <Button type="submit" variant="primary" size="lg" className="mt-2 w-full">
                Sign In
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSetup} className="flex flex-col gap-4">
              <Input 
                type="password" placeholder="New password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
              <Input 
                type="password" placeholder="Confirm password" required
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              />
              
              {error && (
                <div className="text-red-400 text-xs font-normal bg-red-900/20 p-3 rounded-lg border border-red-500/30">
                  {error}
                </div>
              )}
              
              <Button type="submit" variant="primary" size="lg" className="mt-2 w-full">
                Set Password & Continue
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}