import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import {
  TableWrapper,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from './ui/Table';

const BASE_URL = '/api';

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysAgo(isoStr) {
  if (!isoStr) return null;
  const diff = Date.now() - new Date(isoStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function KnowledgeBase() {
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // null | {type:'success'|'error'|'duplicate', msg, source, file}
  const [confirmDelete, setConfirmDelete] = useState(null); // source string or null
  const [pendingFile, setPendingFile] = useState(null); // File object awaiting replace decision
  const fileInputRef = useRef(null);

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  });

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/knowledge/sources`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFiles(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch knowledge sources', err);
    } finally {
      setIsLoading(false);
    }
  };

  const doUpload = async (file, replace = false) => {
    setIsUploading(true);
    setUploadStatus(null);
    const formData = new FormData();
    formData.append('file', file);
    const url = `${BASE_URL}/knowledge/upload${replace ? '?replace=true' : ''}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      const body = await res.json();
      if (res.status === 409 && body.detail === 'duplicate') {
        setUploadStatus({ type: 'duplicate', source: body.source, file });
        setPendingFile(file);
        return;
      }
      if (!res.ok) {
        setUploadStatus({ type: 'error', msg: body.detail || 'Upload failed' });
        return;
      }
      setUploadStatus({ type: 'success', msg: body.message });
      fetchFiles();
    } catch (err) {
      setUploadStatus({ type: 'error', msg: err.message || 'Upload failed' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadStatus(null);
    setPendingFile(null);
    doUpload(file, false);
  };

  const handleReplace = () => {
    if (!pendingFile) return;
    const file = pendingFile;
    setPendingFile(null);
    setUploadStatus(null);
    doUpload(file, true);
  };

  const handleCancelReplace = () => {
    setPendingFile(null);
    setUploadStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = null;
  };

  const handleDelete = async (sourceName) => {
    try {
      const res = await fetch(
        `${BASE_URL}/knowledge/sources/${encodeURIComponent(sourceName)}`,
        { method: 'DELETE', headers: getAuthHeaders() }
      );
      if (!res.ok) {
        const body = await res.json();
        console.error('Delete failed', body);
      }
      fetchFiles();
    } catch (err) {
      console.error('Delete error', err);
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* PAGE HEADER */}
      <div>
        <h2 className="text-2xl text-white tracking-tight">Knowledge Base</h2>
        <p className="text-slate-400 text-sm mt-1">
          Manage policy documents and reference files used to answer questionnaires.
        </p>
      </div>

      {/* UPLOAD SECTION */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
          <p className="text-sm text-slate-400 mt-1">
            Supported formats: PDF, TXT, DOCX
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex-1 min-w-[200px]">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.docx"
                onChange={handleFileChange}
                disabled={isUploading}
                className="block w-full text-sm text-slate-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-normal
                  file:bg-slate-800 file:text-slate-200
                  file:cursor-pointer
                  hover:file:bg-slate-700
                  disabled:opacity-50 disabled:cursor-not-allowed
                  cursor-pointer"
              />
            </label>
            {isUploading && (
              <span className="text-sm text-accent animate-pulse">Uploading…</span>
            )}
          </div>

          {/* Status messages */}
          {uploadStatus?.type === 'success' && (
            <div className="mt-4 text-sm text-accent">
              {uploadStatus.msg}
            </div>
          )}
          {uploadStatus?.type === 'error' && (
            <div className="mt-4 text-sm text-red-400">
              Error: {uploadStatus.msg}
            </div>
          )}

          {/* Duplicate warning */}
          {uploadStatus?.type === 'duplicate' && (
            <div className="mt-4 p-4 rounded-lg border border-amber-500/40 bg-amber-500/10">
              <p className="text-sm text-amber-300">
                A file named <span className="font-semibold text-white">{uploadStatus.source}</span> already
                exists. Replace it with the new version?
              </p>
              <div className="flex gap-3 mt-3">
                <Button variant="danger" size="sm" onClick={handleReplace}>
                  Replace
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCancelReplace}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* FILES TABLE */}
      <Card>
        <CardHeader>
          <CardTitle>Uploaded Files</CardTitle>
          <p className="text-sm text-slate-400 mt-1">
            {files.length} {files.length === 1 ? 'file' : 'files'} in knowledge base
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 bg-slate-800 rounded" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-slate-500 italic py-4">
              No files uploaded yet. Upload a document above to get started.
            </p>
          ) : (
            <TableWrapper className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableHead>Filename</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableHeader>
                <TableBody>
                  {files.map((f) => {
                    const age = daysAgo(f.uploaded_at);
                    const isStale = age !== null && age > 90;
                    return (
                      <TableRow key={f.source}>
                        <TableCell className="max-w-xs">
                          <span className="truncate block text-white">{f.source}</span>
                        </TableCell>
                        <TableCell className="text-slate-400 whitespace-nowrap">
                          {formatDate(f.uploaded_at)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {age !== null ? (
                            <span className={isStale ? 'text-amber-400' : 'text-slate-400'}>
                              {isStale ? '⚠ ' : ''}{age} days ago
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-400">
                          {f.chunk_count ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={() => setConfirmDelete(f.source)}
                            className="text-slate-500 hover:text-red-400 transition-colors"
                            title="Delete source"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="w-4 h-4 inline"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>

      {/* DELETE CONFIRM MODAL */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-normal text-lg mb-2">Delete source?</h3>
            <p className="text-slate-400 text-sm mb-5">
              Delete <span className="text-white font-medium">{confirmDelete}</span> and all its chunks? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <Button variant="danger" size="sm" onClick={() => handleDelete(confirmDelete)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
