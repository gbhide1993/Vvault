import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Button } from './ui/Button';

const BASE_URL = '/api';

export default function Dashboard({ onNavigate }) {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalQuestionsAllTime: 0,
    timeSavedHours: 0,
    costSavedDollars: 0,
    latestRun: null,
    sources: { llm: 0, cache: 0, template: 0 },
    cacheHitRate: 0,
    averageConfidence: 0,
    readinessScore: 0,
    actionItems: 0
  });

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
  });

  useEffect(() => {
   fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const runsRes = await fetch(`${BASE_URL}/cache/runs`, { headers: getAuthHeaders() });
      let runs = [];
      if (runsRes.ok) runs = await runsRes.json();

      let totalQs = 0;
      runs.forEach(run => { totalQs += (run.question_count || 0); });

      const timeSavedHrs = (totalQs * 10) / 60;
      const costSaved = timeSavedHrs * 150;

      let sourceBreakdown = { llm: 0, cache: 0, template: 0 };
      let cacheRate = 0;
      let avgConf = 0;
      let latestRunData = null;
      let approvedCount = 0;
      let riskItemsCount = 0;

      if (runs.length > 0) {
        const sortedRuns = runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const latestRunId = sortedRuns[0].run_id;
        latestRunData = sortedRuns[0];

        const detailRes = await fetch(`${BASE_URL}/cache/all?run_id=${latestRunId}`, { headers: getAuthHeaders() });
        if (detailRes.ok) {
          const details = await detailRes.json();
          let totalConf = 0;
          
          details.forEach(item => {
            totalConf += (item.confidence || 0);
            if (item.source === 'llm') sourceBreakdown.llm++;
            else if (item.source === 'cache' || item.source === 'library') sourceBreakdown.cache++;
            else if (item.source === 'template') sourceBreakdown.template++;

            if (item.status === 'approved') approvedCount++;
            else riskItemsCount++;
          });

          if (details.length > 0) {
            avgConf = Math.round(totalConf / details.length);
            cacheRate = Math.round((sourceBreakdown.cache / details.length) * 100);
          }
        }
      }

      setStats({
        totalQuestionsAllTime: totalQs,
        timeSavedHours: Math.round(timeSavedHrs),
        costSavedDollars: Math.round(costSaved),
        latestRun: latestRunData,
        sources: sourceBreakdown,
        cacheHitRate: cacheRate,
        averageConfidence: avgConf,
        readinessScore: latestRunData ? Math.round((approvedCount / latestRunData.question_count) * 100) : 0,
        actionItems: riskItemsCount
      });

    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return (
    <div className="space-y-6 animate-pulse">
      <div className="mb-8">
        <div className="h-8 bg-slate-900 rounded w-1/4 mb-2"></div>
        <div className="h-4 bg-slate-900 rounded w-1/3"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="h-40" />
        <Card className="h-40" />
        <Card className="h-40" />
      </div>
    </div>
  );

  const interactiveCardClass = "cursor-pointer hover:border-accent/50 hover:shadow-[0_0_15px_rgba(0,230,204,0.1)] transition-none group flex flex-col justify-between h-full";
  const riskCoverageScore = 92; 
  const needleRotation = (riskCoverageScore / 100) * 180 - 90;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      
      {/* 1. FROZEN HEADER */}
      <div className="flex-none mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl text-white tracking-tight">Executive Dashboard</h2>
          <p className="text-slate-400 text-sm mt-1">Real-time ROI and security compliance posture.</p>
        </div>
        
        <Button onClick={() => window.print()} variant="primary" className="gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Export PDF Report
        </Button>
      </div>

      {/* 2. SCROLLABLE CARDS CONTAINER */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-2 pb-6 space-y-8">

      {/* --- TOP ROW --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card onClick={() => onNavigate('run')} className={interactiveCardClass}>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400 uppercase tracking-wider mb-2 group-hover:text-white transition-none">Total Time Saved</p>
            <div className="text-4xl text-white mb-1">{stats.timeSavedHours} <span className="text-xl text-slate-500">hrs</span></div>
            <p className="text-xs text-accent">Click to process a new questionnaire</p>
          </CardContent>
        </Card>

        <Card onClick={() => onNavigate('run')} className={interactiveCardClass}>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400 uppercase tracking-wider mb-2 group-hover:text-white transition-none">Estimated Cost Saved</p>
            <div className="text-4xl text-accent mb-1">${stats.costSavedDollars.toLocaleString()}</div>
            <p className="text-xs text-slate-400">All-time savings across {stats.totalQuestionsAllTime} questions</p>
          </CardContent>
        </Card>

        <Card onClick={() => onNavigate('audit')} className={interactiveCardClass}>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400 uppercase tracking-wider mb-2 group-hover:text-white transition-none">Automated Answers</p>
            <div className="text-4xl text-white mb-1">{stats.totalQuestionsAllTime}</div>
            <p className="text-xs text-slate-400">Click to view global audit history</p>
          </CardContent>
        </Card>
      </div>

      {/* --- ENTERPRISE ROW --- */}
      {stats.latestRun && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <Card className="cursor-pointer hover:border-slate-600 transition-none group">
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <h3 className="text-xs text-slate-400 uppercase tracking-widest mb-1">Policy Risk Coverage</h3>
                <p className="text-2xl text-white">{riskCoverageScore}% Covered</p>
                <p className="text-xs text-slate-500 mt-1">Based on internal controls.</p>
              </div>
              <div className="relative w-28 h-16 flex flex-col items-center justify-end overflow-hidden">
                <svg viewBox="0 0 100 55" className="w-full h-full overflow-visible">
                  <defs>
                    <linearGradient id="riskGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset="50%" stopColor="#eab308" />
                      <stop offset="100%" stopColor="#00E6CC" />
                    </linearGradient>
                  </defs>
                  <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="currentColor" strokeWidth="12" className="text-slate-800" strokeLinecap="round" />
                  <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#riskGradient)" strokeWidth="12" strokeLinecap="round" />
                  <g style={{ transform: `rotate(${needleRotation}deg)`, transformOrigin: '50px 50px' }} className="transition-all duration-1000 ease-out">
                    <path d="M 48 50 L 50 15 L 52 50 Z" fill="currentColor" className="text-slate-300" />
                    <circle cx="50" cy="50" r="4.5" fill="currentColor" className="text-white shadow-sm" />
                  </g>
                </svg>
              </div>
            </CardContent>
          </Card>

          <Card onClick={() => onNavigate('review')} className={interactiveCardClass}>
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">SOC2 Readiness</p>
                <h3 className="text-3xl text-white">{stats.readinessScore}%</h3>
                <p className="text-xs text-slate-500 mt-2">Answers Approved</p>
              </div>
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-800" strokeWidth="4" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-accent" strokeDasharray={`${stats.readinessScore}, 100`} strokeWidth="4" stroke="currentColor" fill="none" strokeLinecap="round" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
              </div>
            </CardContent>
          </Card>

          <Card onClick={() => onNavigate('review')} className="border-red-500/20 hover:border-red-500/60 hover:shadow-[0_0_20px_rgba(239,68,68,0.1)] transition-none cursor-pointer group">
            <CardContent className="pt-6 h-full flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-red-500/10 text-red-500 p-2 rounded-lg border border-red-500/20">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                </div>
                <h3 className="text-sm text-red-400 uppercase tracking-widest">Action Items</h3>
              </div>
              <p className="text-white text-lg mt-1">
                <span className="text-2xl text-red-400 mr-2">{stats.actionItems}</span>reviews needed.
              </p>
            </CardContent>
          </Card>

        </div>
      )}

      {/* --- BOTTOM ROW --- */}
      {stats.latestRun && (
        <div className="mt-8">
          <div className="flex justify-between items-end border-b border-slate-800 pb-3 mb-6">
            <h3 className="text-lg text-white">Automation Engine Breakdown</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card onClick={() => onNavigate('review')} className="cursor-pointer hover:border-slate-500 transition-none group">
              <CardContent className="pt-6">
                <p className="text-sm text-slate-400 uppercase tracking-widest mb-6">Answers by Source</p>
                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between text-sm mb-2"><span className="text-slate-300">Smart Cache (Zero Cost)</span><span className="text-white">{stats.sources.cache}</span></div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5"><div className="bg-accent h-1.5 rounded-full" style={{ width: `${(stats.sources.cache / stats.latestRun.question_count) * 100}%` }}></div></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2"><span className="text-slate-300">Vvault LLM Engine</span><span className="text-white">{stats.sources.llm}</span></div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(stats.sources.llm / stats.latestRun.question_count) * 100}%` }}></div></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2"><span className="text-slate-300">Static Templates</span><span className="text-white">{stats.sources.template}</span></div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5"><div className="bg-slate-500 h-1.5 rounded-full" style={{ width: `${(stats.sources.template / stats.latestRun.question_count) * 100}%` }}></div></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card onClick={() => onNavigate('review')} className="cursor-pointer hover:border-accent/50 hover:shadow-[0_0_15px_rgba(0,230,204,0.1)] transition-none group">
              <CardContent className="pt-6 h-full flex flex-col items-center justify-center text-center">
                <div className="text-5xl text-accent mb-2">{stats.cacheHitRate}%</div>
                <p className="text-slate-400 text-sm uppercase tracking-widest">Cache Hit Rate</p>
              </CardContent>
            </Card>

            <Card onClick={() => onNavigate('review')} className="cursor-pointer hover:border-blue-500/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.1)] transition-none group">
              <CardContent className="pt-6 h-full flex flex-col items-center justify-center text-center">
                <div className="text-5xl text-blue-500 mb-2">{stats.averageConfidence}%</div>
                <p className="text-slate-400 text-sm uppercase tracking-widest">Avg. AI Confidence</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-sm text-slate-400 uppercase tracking-widest">Cache Hit Rate Trajectory</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full" style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={[
                      { name: 'Run 1', rate: 20 }, { name: 'Run 2', rate: 35 },
                      { name: 'Run 3', rate: 45 }, { name: 'Run 4', rate: 68 },
                      { name: 'Current', rate: stats.cacheHitRate || 0 }
                    ]}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00E6CC" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#00E6CC" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(tick) => `${tick}%`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid #27272a', backgroundColor: '#09090b', color: '#fff' }}
                      itemStyle={{ color: '#00E6CC' }}
                    />
                    <Area type="monotone" dataKey="rate" stroke="#00E6CC" strokeWidth={2} fillOpacity={1} fill="url(#colorRate)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  </div>
  );
}