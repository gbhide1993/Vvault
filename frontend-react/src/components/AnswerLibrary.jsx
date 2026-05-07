import React, { useState, useEffect } from 'react';
import { useToast } from './ToastProvider';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Input, Label } from './ui/Input';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { TableWrapper, Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from './ui/Table';

const BASE_URL = '/api';

export default function AnswerLibrary() {
  const [libraryData, setLibraryData] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({ question: '', answer: '' });
  
  const addToast = useToast();

  useEffect(() => {
    fetchLibrary();
  }, []);

  const fetchLibrary = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const runsRes = await fetch(`${BASE_URL}/cache/runs`, { headers });
      if (!runsRes.ok) throw new Error('Failed to fetch runs');
      const runs = await runsRes.json();

      const promises = runs.map(run => 
        fetch(`${BASE_URL}/cache/all?run_id=${run.run_id}`, { headers })
          .then(res => res.json())
          .then(data => Array.isArray(data) ? data.filter(item => item.status === 'approved') : [])
          .catch(() => [])
      );

      const results = await Promise.all(promises);
      
      let allApproved = [];
      results.forEach(runItems => {
        allApproved = [...allApproved, ...runItems];
      });

      const uniqueApproved = Array.from(new Map(allApproved.map(item => [item.question, item])).values());
      setLibraryData(uniqueApproved);
    } catch (err) {
      console.error("Failed to load library", err);
      addToast("Failed to load approved answers from past sessions.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEntry = () => {
    if (!newEntry.question.trim() || !newEntry.answer.trim()) {
      addToast('Please fill out both the question and the answer.', 'error');
      return;
    }

    const newRecord = {
      id: `manual-${Date.now()}`,
      question: newEntry.question,
      answer: newEntry.answer,
      status: 'approved',
      source: 'manual'
    };

    setLibraryData(prev => [newRecord, ...prev]);
    setIsModalOpen(false);
    setNewEntry({ question: '', answer: '' });
    addToast('Manual entry added to your Answer Library!', 'success');
  };

  const filteredData = libraryData.filter(item => 
    (item.question && item.question.toLowerCase().includes(search.toLowerCase())) ||
    (item.answer && item.answer.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    // Outer container matches viewport height
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      
      {/* 1. FROZEN TOP SECTION */}
      <div className="flex-none space-y-6 mb-6">
        <div className="mb-2">
          <h2 className="text-2xl text-white tracking-tight">Answer Library</h2>
          <p className="text-slate-400 text-sm mt-1">The verified source of truth for corporate security responses.</p>
        </div>
        
        <Card>
          <CardContent className="flex justify-between items-center p-6">
            <div className="relative">
              <svg className="absolute left-3 top-2.5 text-slate-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <Input 
                type="text" 
                placeholder="Search library..." 
                className="pl-9 w-80"
                value={search} 
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button onClick={() => setIsModalOpen(true)} variant="primary" className="gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add Manual Entry
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 2. SCROLLABLE TABLE SECTION */}
      <TableWrapper className="flex-1 min-h-0">
        <Table>
          <TableHeader>
            <TableHead className="w-1/3">Standard Question</TableHead>
            <TableHead className="w-1/2">Verified Answer</TableHead>
            <TableHead className="text-center">Tags</TableHead>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan="3" className="text-center text-slate-500 py-12">
                  Aggregating approved answers from all sessions...
                </TableCell>
              </TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan="3" className="text-center text-slate-500 py-12">
                  No verified answers found. Approve some in the Answer Review tab!
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((item, index) => (
                <TableRow key={item.id || index}>
                  <TableCell className="text-slate-200">{item.question}</TableCell>
                  <TableCell className="text-slate-400">{item.answer}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={item.source === 'manual' ? 'accent' : 'success'}>
                      {item.source === 'manual' ? 'MANUAL ENTRY' : 'APPROVED'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrapper>

      {/* Modal is fixed above the layout, so it stays outside the flex flow */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Add Manual Entry"
      >
        <div className="space-y-5">
          <div>
            <Label>Standard Question</Label>
            <Input
              type="text"
              placeholder="e.g., How is data encrypted at rest?"
              value={newEntry.question}
              onChange={e => setNewEntry({...newEntry, question: e.target.value})}
            />
          </div>
          <div>
            <Label>Verified Answer</Label>
            <textarea
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 outline-none focus:border-accent font-sans font-normal transition-none placeholder:text-slate-600 h-32 resize-none"
              placeholder="Enter the official company response..."
              value={newEntry.answer}
              onChange={e => setNewEntry({...newEntry, answer: e.target.value})}
            ></textarea>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-800/50">
          <Button onClick={() => setIsModalOpen(false)} variant="ghost">
            Cancel
          </Button>
          <Button onClick={handleSaveEntry} variant="primary">
            Save to Library
          </Button>
        </div>
      </Modal>

    </div>
  );
}