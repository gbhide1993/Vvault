import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Input, Select } from './ui/Input';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { TableWrapper, Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from './ui/Table';

const BASE_URL = '/api';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [msg, setMsg] = useState({ text: '', type: '' });

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${BASE_URL}/cache/users`, { headers: getAuthHeaders() });
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error("Failed to load users", err);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername || newPassword.length < 8) {
      return setMsg({ text: 'Username required & password must be 8+ chars.', type: 'error' });
    }

    try {
      const res = await fetch(
        `${BASE_URL}/cache/users/create?username=${newUsername.toLowerCase()}&role=${newRole}&password=${encodeURIComponent(newPassword)}`,
        { method: 'POST', headers: getAuthHeaders() }
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to create user');
      setMsg({ text: `User ${newUsername} created successfully.`, type: 'success' });
      setNewUsername('');
      setNewPassword('');
      fetchUsers();
      setTimeout(() => setMsg({ text: '', type: '' }), 3000);
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
  };

  const handleDeleteUser = async (username) => {
    if (!window.confirm(`Are you sure you want to delete user: ${username}?`)) return;
    try {
      const res = await fetch(`${BASE_URL}/cache/users/delete?username=${username}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) fetchUsers();
    } catch (err) {
      alert("Failed to delete user.");
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      
      {/* 1. FROZEN HEADER & CONTROLS */}
      <div className="flex-none space-y-6 mb-6">
        <div>
          <h2 className="text-2xl text-white tracking-tight">User Management</h2>
          <p className="text-slate-400 text-sm mt-1">Control access to the Vvault platform.</p>
        </div>

        {/* Creation Card */}
        <Card>
          <CardHeader>
            <CardTitle>Create New User</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateUser} className="flex items-center gap-4">
              <Input 
                type="text" placeholder="Username" className="w-48" 
                value={newUsername} onChange={e => setNewUsername(e.target.value)} 
              />
              <Input 
                type="password" placeholder="Password" className="w-48" 
                value={newPassword} onChange={e => setNewPassword(e.target.value)} 
              />
              <Select className="w-32" value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </Select>
              <Button type="submit" variant="primary">Create User</Button>
            </form>
            {msg.text && (
              <div className={`mt-4 text-sm font-normal ${msg.type === 'error' ? 'text-red-400' : 'text-accent'}`}>
                {msg.text}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 2. SCROLLABLE TABLE SECTION */}
      <TableWrapper className="flex-1 min-h-0">
        <Table>
          <TableHeader>
            <TableHead className="w-1/3">Username</TableHead>
            <TableHead className="w-1/3">Role</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.username}>
                <TableCell className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-white">
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  {u.username}
                </TableCell>
                <TableCell>
                  <Badge variant="default">{u.role}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {u.username !== 'admin' && (
                    <Button onClick={() => handleDeleteUser(u.username)} variant="ghost" className="text-red-400 hover:text-red-300 ml-auto h-8 px-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      Delete
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>

    </div>
  );
}