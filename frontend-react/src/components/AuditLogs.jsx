import React, { useState, useEffect } from 'react';
import { TableWrapper, Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from './ui/Table';
import { Badge } from './ui/Badge';

const BASE_URL = '/api';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/cache/audit`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error("Failed to load audit logs", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      
      {/* 1. FROZEN HEADER */}
      <div className="flex-none mb-6">
        <h2 className="text-2xl text-white tracking-tight">Audit Logs</h2>
        <p className="text-slate-400 text-sm mt-1">Track all user activity, approvals, and system changes.</p>
      </div>
      
      {/* 2. SCROLLABLE TABLE SECTION */}
      <TableWrapper className="flex-1 min-h-0">
        <Table>
          <TableHeader>
            <TableHead>User</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="w-1/2">Question</TableHead>
            <TableHead>Time</TableHead>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan="4" className="text-center text-slate-500 py-12">
                  Loading audit logs...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan="4" className="text-center text-slate-500 py-12">
                  No audit logs found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log, index) => (
                <TableRow key={index}>
                  <TableCell className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-white">
                      {log.user_name.charAt(0).toUpperCase()}
                    </div>
                    {log.user_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">{log.action}</Badge>
                  </TableCell>
                  <TableCell className="truncate max-w-xs" title={log.question}>
                    {log.question}
                  </TableCell>
                  <TableCell className="text-slate-500 font-mono text-xs">
                    {new Date(log.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrapper>
      
    </div>
  );
}