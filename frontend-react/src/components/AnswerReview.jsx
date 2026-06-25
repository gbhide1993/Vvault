import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Input, Select } from './ui/Input';
import { Badge } from './ui/Badge';
import { TableWrapper, Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from './ui/Table';

const BASE_URL = '/api';

// --- SUB-COMPONENT: EVIDENCE PANEL ---
function EvidencePanel({ cacheId, getAuthHeaders, onEvidenceChange }) {
  const [evidenceList, setEvidenceList] = useState([]);
  const [content, setContent] = useState('');
  const [type, setType] = useState('note');
  const [filename, setFilename] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { loadEvidence(); }, []);

  const loadEvidence = async () => {
    try {
      const res = await fetch(`${BASE_URL}/cache/evidence/${cacheId}`, { headers: getAuthHeaders() });
      if (res.ok) setEvidenceList(await res.json());
    } catch (err) {
      console.error("Failed to load evidence", err);
    }
  };

  const handleAdd = async () => {
    if (!content) return setMsg('Please enter content');
    setMsg('');
    try {
      const res = await fetch(`${BASE_URL}/cache/evidence/${cacheId}`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, evidence_type: type, filename })
      });
      if (res.ok) {
        setContent('');
        setFilename('');
        setMsg('Added successfully');
        loadEvidence();
        if (onEvidenceChange) onEvidenceChange();
        setTimeout(() => setMsg(''), 2000);
      }
    } catch (err) {
      setMsg('Error adding evidence');
    }
  };

  return (
    <div className="bg-slate-900/50 p-4 pl-14 border-b border-slate-800">
      <div className="mb-4">
        {evidenceList.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No evidence attached yet.</p>
        ) : (
          <div className="space-y-3">
            {evidenceList.map(ev => (
              <div key={ev.id} className="flex gap-3 text-sm bg-slate-950 p-3 rounded-lg border border-slate-800 shadow-sm">
                <Badge variant="accent" className="h-fit">{ev.evidence_type}</Badge>
                <div className="flex-1">
                  <p className="text-slate-200">{ev.content}</p>
                  {ev.filename && <p className="text-xs text-slate-500 mt-1 font-mono">Doc: {ev.filename}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 pt-4 flex items-center gap-3">
        <Select className="w-36" value={type} onChange={e => setType(e.target.value)}>
          <option value="note">Note</option>
          <option value="quote">Policy Quote</option>
          <option value="filename">Document Ref</option>
        </Select>
        <Input placeholder="Content/Quote..." className="flex-1" value={content} onChange={e => setContent(e.target.value)} />
        <Input placeholder="Filename (opt)" className="w-32" value={filename} onChange={e => setFilename(e.target.value)} />
        <Button onClick={handleAdd} variant="primary">Add</Button>
        {msg && <span className="text-xs text-accent">{msg}</span>}
      </div>
    </div>
  );
}

// --- SUB-COMPONENT: RELIANCE WARNING MODAL ---
function RelianceModal({ warnings, onApproveAnyway, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1a1a1a', border: '1px solid #f97316', borderRadius: 10, padding: 28, maxWidth: 520, width: '90%' }}>
        <h3 style={{ color: '#f97316', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Source Documents Changed</h3>
        <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>
          One or more source documents that grounded this answer have changed since it was generated.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ background: '#111', border: '1px solid #7c3aed33', borderLeft: '3px solid #f97316', borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13 }}>{w.source}</span>
                <span style={{
                  background: w.status === 'missing' ? '#7f1d1d' : '#431407',
                  color: w.status === 'missing' ? '#fca5a5' : '#fed7aa',
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase'
                }}>
                  {w.status === 'missing' ? 'Deleted' : 'Updated'}
                </span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>{w.message}</p>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                <span>Generated: {w.generated_at ? new Date(w.generated_at).toLocaleDateString() : '—'}</span>
                {w.updated_at && (
                  <span style={{ marginLeft: 12 }}>Re-uploaded: {new Date(w.updated_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ background: '#374151', color: '#d1d5db', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={onApproveAnyway} style={{ background: '#f97316', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Approve Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MAIN COMPONENT: ANSWER REVIEW ---
export default function AnswerReview() {
  const [runs, setRuns] = useState([]);
  const [currentRunId, setCurrentRunId] = useState(localStorage.getItem('lastRunId') || '');
  const [data, setData] = useState([]);
  
  const [search, setSearch] = useState('');
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusSortDir, setStatusSortDir] = useState(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedEvidence, setExpandedEvidence] = useState(new Set());
  const [expandedExplanation, setExpandedExplanation] = useState(new Set());
  const [expandedStale, setExpandedStale] = useState(new Set());
  const [expandedSource, setExpandedSource] = useState({});
  const [expandedConflict, setExpandedConflict] = useState(new Set());
  const [relianceModal, setRelianceModal] = useState(null);

  const userRole = localStorage.getItem('role');
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    fetchRuns();
    if (currentRunId) fetchPreviewData(currentRunId);
  }, []);

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${BASE_URL}/cache/runs`, { headers: getAuthHeaders() });
      if (res.ok) setRuns(await res.json());
    } catch (err) { console.error("Failed to load runs", err); }
  };

  const fetchPreviewData = async (runId) => {
    try {
      const res = await fetch(`${BASE_URL}/cache/all?run_id=${runId}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const result = await res.json();
        setData(Array.isArray(result) ? result : []);
        setCurrentPage(1);
        setSelectedIds(new Set());
      }
    } catch (err) { console.error("Failed to load preview data", err); }
  };

  const handleRunChange = (e) => {
    const runId = e.target.value;
    setCurrentRunId(runId);
    localStorage.setItem('lastRunId', runId);
    fetchPreviewData(runId);
  };

  const filteredData = data.filter(item => {
    const matchesSearch = item.question?.toLowerCase().includes(search.toLowerCase());
    const matchesConfidence = showLowOnly ? item.confidence < 70 : true;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesConfidence && matchesStatus;
  });

  let sortedData = [...filteredData];
  if (statusSortDir) {
    sortedData.sort((a, b) => {
      const valA = a.status || '';
      const valB = b.status || '';
      if (valA < valB) return statusSortDir === 'asc' ? -1 : 1;
      if (valA > valB) return statusSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const startIdx = (currentPage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIdx, startIdx + pageSize);

  const toggleStatusSort = () => {
    if (statusSortDir === null) setStatusSortDir('asc');
    else if (statusSortDir === 'asc') setStatusSortDir('desc');
    else setStatusSortDir(null);
  };

  const toggleSelect = (id) => {
    const newSet = new Set(selectedIds);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAll = (e) => {
    if (e.target.checked) setSelectedIds(new Set(paginatedData.map(d => d.id)));
    else setSelectedIds(new Set());
  };

  const toggleEvidence = (id) => {
    const newSet = new Set(expandedEvidence);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setExpandedEvidence(newSet);
  };

  const toggleExplanation = (id) => {
    const newSet = new Set(expandedExplanation);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setExpandedExplanation(newSet);
  };

  const toggleStale = (id) => {
    const newSet = new Set(expandedStale);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setExpandedStale(newSet);
  };

  const toggleConflict = (id) => {
    const newSet = new Set(expandedConflict);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setExpandedConflict(newSet);
  };

  const doApprove = async (cacheId) => {
    await fetch(`${BASE_URL}/cache/approve/${cacheId}`, { method: 'POST', headers: getAuthHeaders() });
    fetchPreviewData(currentRunId);
  };

  const handleApprove = async (cacheId) => {
    if (userRole !== 'admin') return alert('Only admins can approve.');
    try {
      const res = await fetch(`${BASE_URL}/cache/check-reliance/${cacheId}`, { method: 'POST', headers: getAuthHeaders() });
      if (!res.ok) { await doApprove(cacheId); return; }
      const result = await res.json();
      if (result.reliance_ok) {
        await doApprove(cacheId);
      } else {
        setRelianceModal({ cacheId, warnings: result.warnings });
      }
    } catch {
      await doApprove(cacheId);
    }
  };

  const handleBulkAction = async (action) => {
    if (userRole !== 'admin') return alert('Only admins can perform this action.');
    if (selectedIds.size === 0) return alert('Select items first.');
    const promises = [...selectedIds].map(id => fetch(`${BASE_URL}/cache/${action}/${id}`, { method: 'POST', headers: getAuthHeaders() }));
    await Promise.all(promises);
    setSelectedIds(new Set());
    fetchPreviewData(currentRunId);
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(`${BASE_URL}/cache/upload/download/${currentRunId}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("File not ready");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vvault_output.xlsx";
      a.click();
    } catch (err) { alert("Error downloading file."); }
  };

  const stats = {
    total: data.length,
    approved: data.filter(d => d.status === 'approved').length,
    pending: data.filter(d => d.status === 'pending').length,
    rejected: data.filter(d => d.status === 'rejected').length,
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {relianceModal && (
        <RelianceModal
          warnings={relianceModal.warnings}
          onCancel={() => setRelianceModal(null)}
          onApproveAnyway={async () => {
            await doApprove(relianceModal.cacheId);
            setRelianceModal(null);
          }}
        />
      )}
      
      {/* 1. FROZEN TOP SECTION */}
      <div className="flex-none space-y-6 mb-6">
        <div className="mb-2">
          <h2 className="text-2xl text-white tracking-tight">Answer Review</h2>
          <p className="text-slate-400 text-sm mt-1">Review, refine, and approve automated questionnaire responses.</p>
        </div>

        <Card>
          <CardContent className="flex justify-between items-end p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 uppercase tracking-widest font-normal">Session Archive</span>
                <Select value={currentRunId} onChange={handleRunChange} className="w-64">
                  <option value="" disabled>Select a run...</option>
                  {runs.map(r => (
                    <option key={r.run_id} value={r.run_id}>
                      {new Date(r.created_at).toLocaleDateString()} - {r.question_count} Qs
                    </option>
                  ))}
                </Select>
              </div>
              
              <div className="flex gap-3">
                <Input 
                  placeholder="Search questions..." 
                  className="w-64"
                  value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                />
                <Button 
                  onClick={() => { setShowLowOnly(!showLowOnly); setCurrentPage(1); }}
                  variant={showLowOnly ? "primary" : "secondary"}
                >
                  {showLowOnly ? 'Show All' : 'Show Low Confidence'}
                </Button>
                <Button onClick={handleDownload} variant="primary">Export Excel</Button>
              </div>
            </div>

            <div className="text-right space-y-4">
              <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 inline-flex items-center gap-1">
                <button onClick={() => { setStatusFilter('all'); setCurrentPage(1); }} className={`px-4 py-2 rounded-lg text-xs font-normal transition-none border ${statusFilter === 'all' ? 'bg-slate-800 border-slate-600 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                  Total: {stats.total}
                </button>
                <button onClick={() => { setStatusFilter('approved'); setCurrentPage(1); }} className={`px-4 py-2 rounded-lg text-xs font-normal transition-none border ${statusFilter === 'approved' ? 'bg-green-900/30 border-green-500/50 text-green-400' : 'border-transparent text-slate-500 hover:text-green-500'}`}>
                  Appr: {stats.approved}
                </button>
                <button onClick={() => { setStatusFilter('pending'); setCurrentPage(1); }} className={`px-4 py-2 rounded-lg text-xs font-normal transition-none border ${statusFilter === 'pending' ? 'bg-yellow-900/30 border-yellow-500/50 text-yellow-400' : 'border-transparent text-slate-500 hover:text-yellow-500'}`}>
                  Pend: {stats.pending}
                </button>
                <button onClick={() => { setStatusFilter('rejected'); setCurrentPage(1); }} className={`px-4 py-2 rounded-lg text-xs font-normal transition-none border ${statusFilter === 'rejected' ? 'bg-red-900/30 border-red-500/50 text-red-400' : 'border-transparent text-slate-500 hover:text-red-500'}`}>
                  Rej: {stats.rejected}
                </button>
              </div>
              
              <div className="flex gap-3 justify-end">
                <Button onClick={() => handleBulkAction('approve')} variant="success">Approve Selected</Button>
                <Button onClick={() => handleBulkAction('reject')} variant="danger">Reject Selected</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. SCROLLABLE TABLE SECTION */}
      <TableWrapper className="flex-1 min-h-0">
        <Table>
          <TableHeader>
            <TableHead className="w-12 text-center border-r border-slate-800">
              <input type="checkbox" onChange={toggleAll} checked={paginatedData.length > 0 && selectedIds.size === paginatedData.length} className="cursor-pointer accent-accent" />
            </TableHead>
            <TableHead className="w-1/4">Question</TableHead>
            <TableHead className="w-1/3">Answer</TableHead>
            <TableHead className="text-center">Confidence</TableHead>
            <TableHead className="text-center">Sources</TableHead>
            <TableHead className="text-center cursor-pointer hover:bg-slate-800 transition-none select-none group" onClick={toggleStatusSort} title="Sort by status">
              <div className="flex items-center justify-center gap-2">
                Status <span className="text-slate-600 group-hover:text-slate-400">{statusSortDir === 'asc' ? '↑' : statusSortDir === 'desc' ? '↓' : '↕'}</span>
              </div>
            </TableHead>
            <TableHead className="text-center">Evidence</TableHead>
          </TableHeader>
          
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan="7" className="p-12 text-center text-slate-500">No data found matching your filters.</TableCell>
              </TableRow>
            ) : (
              paginatedData.map(item => {
                return (<React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell className="text-center border-r border-slate-800/50">
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} className="cursor-pointer accent-accent" />
                    </TableCell>
                    <TableCell className="text-slate-200">{item.question || "-"}</TableCell>
                    <TableCell className="text-slate-400">
                      <div>{item.answer || "No relevant information available."}</div>
                      {item.source === 'llm' && item.source_text && (
                        <div className="mt-3">
                          <button onClick={() => toggleExplanation(item.id)} className="text-[10px] uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700 px-2 py-1 rounded hover:bg-slate-700 transition-none">
                            + AI Explanation
                          </button>
                          {expandedExplanation.has(item.id) && (
                            <div className="mt-2 text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed">
                              Based on: {item.source_text.substring(0, 150)}...
                              {item.has_stale_sources && Array.isArray(item.stale_sources) && item.stale_sources.length > 0 && (
                                <div className="mt-3">
                                  <p style={{ color: '#fb923c', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>Stale Sources Detected</p>
                                  {item.stale_sources.map((s, si) => (
                                    <div key={si} style={{ borderLeft: '2px solid #f97316', paddingLeft: 8, marginBottom: 4 }}>
                                      <p style={{ color: '#888', fontSize: 11, fontStyle: 'italic', margin: 0 }}>
                                        {s.source} — uploaded {s.age_days} days ago
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={item.confidence >= 80 ? 'success' : item.confidence >= 60 ? 'warning' : 'danger'}>
                        {item.confidence}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.conflict_detected && (
                        <button
                          onClick={() => toggleConflict(item.id)}
                          style={{ background: '#854d0e', color: '#fef08a', fontSize: 10, borderRadius: 4, padding: '2px 6px', display: 'inline-block', marginBottom: 4, cursor: 'pointer', border: '1px solid #a16207' }}
                        >
                          ⚠ Conflict {expandedConflict.has(item.id) ? '▲' : '▼'}
                        </button>
                      )}
                      {item.has_stale_sources && (
                        <button
                          onClick={() => toggleStale(item.id)}
                          style={{ background: '#92400e', color: '#fef3c7', fontSize: 10, borderRadius: 4, padding: '2px 6px', display: 'inline-block', marginBottom: 4, marginLeft: 4, cursor: 'pointer', border: '1px solid #b45309' }}
                        >
                          ⏰ Stale {expandedStale.has(item.id) ? '▲' : '▼'}
                        </button>
                      )}
                      {(() => {
                        const docs = Array.isArray(item.documents)
                          ? item.documents
                          : typeof item.documents === 'string' && item.documents
                            ? item.documents.replace(/^\{|\}$/g, '').split(',').filter(Boolean)
                            : [];
                        if (docs.length === 0) return null;
                        const contextChunks = (item.raw_context || '').split('\n\n').filter(Boolean);
                        const expandedIdx = expandedSource[item.id];
                        return (
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex flex-wrap gap-1 justify-center">
                              {docs.map((doc, i) => {
                                const isExpanded = expandedIdx === i;
                                return (
                                  <span
                                    key={i}
                                    onClick={() => setExpandedSource(prev => ({ ...prev, [item.id]: isExpanded ? null : i }))}
                                    className="inline-block max-w-30 truncate text-[10px] bg-slate-700 text-slate-300 border border-slate-600 rounded px-2 py-0.5 cursor-pointer hover:bg-slate-600"
                                  >
                                    {doc}
                                  </span>
                                );
                              })}
                            </div>
                            {expandedIdx != null && docs[expandedIdx] && (() => {
                              const rawChunk = contextChunks[expandedIdx] || '';
                              const excerpt = rawChunk ? rawChunk.split('. ').slice(0, 2).join('. ').trim() : null;
                              if (!excerpt) return null;
                              return (
                                <div style={{ borderLeft: '2px solid #22c55e', paddingLeft: 8, marginTop: 4, textAlign: 'left' }}>
                                  <p style={{ color: '#888', fontSize: 11, fontStyle: 'italic', margin: 0 }}>{excerpt}</p>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Badge variant={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}>
                          {item.status || "pending"}
                        </Badge>
                        {item.status === 'pending' && userRole === 'admin' && (
                          <button
                            onClick={() => handleApprove(item.id)}
                            style={{ fontSize: 10, background: '#166534', color: '#bbf7d0', border: '1px solid #15803d', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', marginTop: 2 }}
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button onClick={() => toggleEvidence(item.id)} variant="secondary" size="sm">
                        Evidence {item.evidence_count > 0 ? `(${item.evidence_count})` : '+'}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedEvidence.has(item.id) && (
                    <tr className="bg-slate-900/30">
                      <td colSpan="7" className="p-0">
                        <EvidencePanel cacheId={item.id} getAuthHeaders={getAuthHeaders} onEvidenceChange={() => fetchPreviewData(currentRunId)} />
                      </td>
                    </tr>
                  )}
                  {expandedConflict.has(item.id) && Array.isArray(item.conflicting_pairs) && item.conflicting_pairs.length > 0 && (
                    <tr className="bg-yellow-950/20">
                      <td colSpan="7" className="p-0">
                        <div className="px-6 py-4 border-b border-yellow-900/40">
                          <p style={{ color: '#fef08a', fontSize: 11, fontWeight: 600, marginBottom: 10 }}>⚠ Source Conflicts Detected</p>
                          {item.conflicting_pairs.map((pair, pi) => (
                            <div key={pi} className="mb-4">
                              <p style={{ color: '#aaa', fontSize: 11, marginBottom: 6 }}>
                                <span style={{ color: '#fef08a' }}>{pair.source_a}</span>
                                <span style={{ color: '#ef4444', margin: '0 8px' }}>vs</span>
                                <span style={{ color: '#fef08a' }}>{pair.source_b}</span>
                              </p>
                              <div style={{ borderLeft: '2px solid #ef4444', paddingLeft: 10, marginBottom: 6 }}>
                                <p style={{ color: '#ccc', fontSize: 11, fontStyle: 'italic', margin: 0 }}>{pair.excerpt_a}</p>
                              </div>
                              <div style={{ borderLeft: '2px solid #ef4444', paddingLeft: 10 }}>
                                <p style={{ color: '#ccc', fontSize: 11, fontStyle: 'italic', margin: 0 }}>{pair.excerpt_b}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  {expandedStale.has(item.id) && Array.isArray(item.stale_sources) && item.stale_sources.length > 0 && (
                    <tr className="bg-amber-950/20">
                      <td colSpan="7" className="p-0">
                        <div className="px-6 py-4 border-b border-amber-900/40">
                          <p style={{ color: '#fb923c', fontSize: 11, fontWeight: 600, marginBottom: 10 }}>⏰ Stale Sources Detected</p>
                          {item.stale_sources.map((s, si) => (
                            <div key={si} style={{ borderLeft: '2px solid #f97316', paddingLeft: 10, marginBottom: 6 }}>
                              <p style={{ color: '#ccc', fontSize: 11, fontStyle: 'italic', margin: 0 }}>
                                <span style={{ color: '#fef3c7' }}>{s.source}</span> — uploaded {s.age_days} days ago
                              </p>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>);
              })
            )}
          </TableBody>
        </Table>
      </TableWrapper>

      {/* 3. FROZEN PAGINATION AT BOTTOM */}
      <div className="flex-none flex justify-end items-center mt-4">
        <div className="flex items-center gap-4 bg-slate-900 p-2 rounded-lg border border-slate-800 shadow-lg">
          <Button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} variant="secondary" size="sm">
            Previous
          </Button>
          <span className="text-sm text-slate-500">Page <span className="text-white">{currentPage}</span> of {totalPages}</span>
          <Button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} variant="secondary" size="sm">
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}