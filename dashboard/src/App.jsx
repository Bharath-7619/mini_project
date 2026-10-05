import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield, Lock, Key, Activity, Server, Globe, Zap,
  AlertTriangle, CheckCircle, XCircle, RefreshCw, Send, Clock,
  LogIn, LogOut, LayoutDashboard, Cpu, Bell, Radio, ShieldCheck,
  Copy, Check, Search, Filter, Eye, ChevronRight, Terminal, Info
} from 'lucide-react';

export default function App() {
  // Navigation: 'dashboard' | 'nodes' | 'alarms' | 'events' | 'token' | 'security'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Auth State
  const [clientId, setClientId] = useState('nms-client-id');
  const [clientSecret, setClientSecret] = useState('nms-client-secret');
  const [scope, setScope] = useState('nms-read');
  const [token, setToken] = useState(null);
  const [tokenType, setTokenType] = useState('');
  const [expiresIn, setExpiresIn] = useState(3600);
  const [tokenCreatedAt, setTokenCreatedAt] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Live NMS Data State
  const [systemInfo, setSystemInfo] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [alarms, setAlarms] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Rate Limit & Gateway State
  const [rateLimit, setRateLimit] = useState({
    limitMinute: 100,
    remainingMinute: 100,
    limitHour: 1000,
    remainingHour: 1000,
    latency: null
  });

  // Security Tests State
  const [testResults, setTestResults] = useState({
    noToken: null,
    invalidToken: null,
    rateLimit: null
  });
  const [testLoading, setTestLoading] = useState({
    noToken: false,
    invalidToken: false,
    rateLimit: false
  });

  // Filters
  const [eventSearch, setEventSearch] = useState('');
  const [nodeSearch, setNodeSearch] = useState('');

  // Countdown timer for active token
  useEffect(() => {
    if (!tokenCreatedAt || !expiresIn) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - tokenCreatedAt) / 1000);
      const remaining = Math.max(0, expiresIn - elapsed);
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        setToken(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [tokenCreatedAt, expiresIn]);

  // Request OAuth2 Token (Login)
  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch('/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: scope
        })
      });
      const data = await response.json();
      if (response.ok && data.access_token) {
        setToken(data.access_token);
        setTokenType(data.token_type || 'bearer');
        setExpiresIn(data.expires_in || 3600);
        setTokenCreatedAt(Date.now());
        setSecondsRemaining(data.expires_in || 3600);
        fetchDashboardData(data.access_token);
      } else {
        setAuthError(data.error_description || data.error || 'Authentication failed. Please verify client credentials.');
      }
    } catch (err) {
      setAuthError('Connection error: Unable to communicate with Kong Gateway.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setTokenCreatedAt(null);
    setSystemInfo(null);
    setNodes([]);
    setAlarms([]);
    setEvents([]);
  };

  // Fetch all NMS data through Kong Gateway
  const fetchDashboardData = async (activeAuthToken = token) => {
    if (!activeAuthToken) return;
    setLoadingData(true);
    const headers = {
      'Authorization': `Bearer ${activeAuthToken}`,
      'Accept': 'application/json'
    };

    try {
      // 1. Fetch Info
      const start = Date.now();
      const infoRes = await fetch('/api/rest/info', { headers });
      const latency = Date.now() - start;

      const rlm = infoRes.headers.get('X-RateLimit-Limit-Minute');
      const rrm = infoRes.headers.get('X-RateLimit-Remaining-Minute');
      const rlh = infoRes.headers.get('X-RateLimit-Limit-Hour');
      const rrh = infoRes.headers.get('X-RateLimit-Remaining-Hour');

      if (rlm) {
        setRateLimit({
          limitMinute: parseInt(rlm, 10),
          remainingMinute: parseInt(rrm, 10),
          limitHour: parseInt(rlh, 10),
          remainingHour: parseInt(rrh, 10),
          latency
        });
      }

      if (infoRes.ok) {
        const infoData = await infoRes.json();
        setSystemInfo(infoData);
      }

      // 2. Fetch Nodes
      const nodesRes = await fetch('/api/rest/nodes', { headers });
      if (nodesRes.ok) {
        const nodesData = await nodesRes.json();
        setNodes(nodesData.node || []);
      }

      // 3. Fetch Alarms
      const alarmsRes = await fetch('/api/rest/alarms', { headers });
      if (alarmsRes.ok) {
        const alarmsData = await alarmsRes.json();
        setAlarms(alarmsData.alarm || []);
      }

      // 4. Fetch Events
      const eventsRes = await fetch('/api/rest/events', { headers });
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setEvents(eventsData.event || []);
      }
    } catch (err) {
      console.error('Error fetching NMS resources:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  // Security Test Runners
  const runTestNoToken = async () => {
    setTestLoading(prev => ({ ...prev, noToken: true }));
    try {
      const res = await fetch('/api/rest/info', {
        headers: { 'Accept': 'application/json' }
      });
      setTestResults(prev => ({
        ...prev,
        noToken: res.status === 401 ? { pass: true, status: res.status, msg: 'Blocked with 401 Unauthorized as expected' } : { pass: false, status: res.status, msg: 'Unexpected response' }
      }));
    } catch (e) {
      setTestResults(prev => ({ ...prev, noToken: { pass: false, msg: e.message } }));
    } finally {
      setTestLoading(prev => ({ ...prev, noToken: false }));
    }
  };

  const runTestInvalidToken = async () => {
    setTestLoading(prev => ({ ...prev, invalidToken: true }));
    try {
      const res = await fetch('/api/rest/info', {
        headers: {
          'Authorization': 'Bearer fake_invalid_jwt_token_xyz987',
          'Accept': 'application/json'
        }
      });
      setTestResults(prev => ({
        ...prev,
        invalidToken: res.status === 401 ? { pass: true, status: res.status, msg: 'Blocked with 401 Unauthorized (Invalid Token)' } : { pass: false, status: res.status, msg: 'Unexpected response' }
      }));
    } catch (e) {
      setTestResults(prev => ({ ...prev, invalidToken: { pass: false, msg: e.message } }));
    } finally {
      setTestLoading(prev => ({ ...prev, invalidToken: false }));
    }
  };

  const runTestRateLimit = async () => {
    setTestLoading(prev => ({ ...prev, rateLimit: true }));
    let rateLimitHit = false;
    let hitCount = 0;
    try {
      for (let i = 1; i <= 110; i++) {
        const res = await fetch('/api/rest/info', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        if (res.status === 429) {
          rateLimitHit = true;
          hitCount = i;
          break;
        }
      }
      setTestResults(prev => ({
        ...prev,
        rateLimit: rateLimitHit
          ? { pass: true, msg: `Rate Limit triggered on request #${hitCount} (HTTP 429 Too Many Requests)` }
          : { pass: false, msg: 'Rate limit not exceeded within batch' }
      }));
      fetchDashboardData(token);
    } catch (e) {
      setTestResults(prev => ({ ...prev, rateLimit: { pass: false, msg: e.message } }));
    } finally {
      setTestLoading(prev => ({ ...prev, rateLimit: false }));
    }
  };

  // Filtered views
  const filteredEvents = useMemo(() => {
    if (!eventSearch) return events;
    return events.filter(e =>
      (e.uei && e.uei.toLowerCase().includes(eventSearch.toLowerCase())) ||
      (e.logMessage && e.logMessage.toLowerCase().includes(eventSearch.toLowerCase())) ||
      (e.severity && e.severity.toLowerCase().includes(eventSearch.toLowerCase()))
    );
  }, [events, eventSearch]);

  const filteredNodes = useMemo(() => {
    if (!nodeSearch) return nodes;
    return nodes.filter(n =>
      (n.label && n.label.toLowerCase().includes(nodeSearch.toLowerCase())) ||
      (n.foreignSource && n.foreignSource.toLowerCase().includes(nodeSearch.toLowerCase()))
    );
  }, [nodes, nodeSearch]);

  // ==========================================
  // VIEW: 🔐 LOGIN PAGE (Unauthenticated)
  // ==========================================
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 relative overflow-hidden font-sans">
        {/* Background glow effects */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
              <Shield className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">OpenNMS API Gateway</h1>
            <p className="text-sm text-slate-400 mt-1">Project 18 • Secure Northbound REST Interface</p>
            <div className="flex items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-800/60 font-medium">
                <Lock className="w-3 h-3" /> OAuth2 / TLS
              </span>
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-medium">
                <Server className="w-3 h-3" /> Kong 3.9
              </span>
            </div>
          </div>

          {authError && (
            <div className="mb-6 p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl flex items-start gap-3 text-red-200 text-sm">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                OAuth2 Client ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                  placeholder="nms-client-id"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                OAuth2 Client Secret
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                  placeholder="••••••••••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Requested Scope
              </label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
              >
                <option value="nms-read">nms-read (Read Only)</option>
                <option value="nms-read nms-write">nms-read nms-write (Full Access)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              {authLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Validating Credentials...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Authenticate via Gateway</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-500">
              Flow: Client Credentials Grant (RFC 6749) <br />
              Secure Gateway terminates OAuth2 & injects Upstream Auth
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: 🚀 MAIN APPLICATION (Authenticated)
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <span className="font-bold text-white text-base">OpenNMS API Gateway</span>
            <span className="hidden md:inline-block text-xs text-slate-400 ml-2 border-l border-slate-700 pl-2">
              Northbound Secure Interface
            </span>
          </div>
        </div>

        {/* Global Live Indicators & Logout */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 text-xs bg-slate-950 px-3 py-1.5 rounded-full border border-slate-800">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Kong: TLS 8443
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              Token: {Math.floor(secondsRemaining / 60)}m {secondsRemaining % 60}s
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              RL: {rateLimit.remainingMinute}/{rateLimit.limitMinute}
            </span>
          </div>

          <button
            onClick={() => fetchDashboardData()}
            disabled={loadingData}
            title="Refresh Data"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-medium bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800/60 px-3 py-1.5 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-4 shrink-0 flex flex-col justify-between hidden md:flex">
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>📊 Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('nodes')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'nodes'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Cpu className="w-4 h-4" />
                <span>🖥️ Nodes</span>
              </div>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-300">
                {nodes.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('alarms')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'alarms'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4" />
                <span>🚨 Alarms</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${alarms.length > 0 ? 'bg-red-500 text-white font-bold' : 'bg-slate-800 text-slate-400'}`}>
                {alarms.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('events')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'events'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Radio className="w-4 h-4" />
                <span>📡 Events</span>
              </div>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-300">
                {events.length}
              </span>
            </button>

            <div className="pt-4 mt-4 border-t border-slate-800">
              <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Gateway Security
              </span>
            </div>

            <button
              onClick={() => setActiveTab('token')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'token'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>🔑 API Token</span>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'security'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>🛡️ Security Status</span>
            </button>
          </nav>

          {/* Upstream status footer */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>NMS Horizon</span>
              <span className="text-emerald-400 font-medium">36.0.4</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Upstream Auth</span>
              <span className="text-slate-200 font-mono">Basic Auth</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {/* Mobile Tab Pills */}
          <div className="flex md:hidden overflow-x-auto gap-2 pb-2">
            {[
              { id: 'dashboard', label: '📊 Dashboard' },
              { id: 'nodes', label: `🖥️ Nodes (${nodes.length})` },
              { id: 'alarms', label: `🚨 Alarms (${alarms.length})` },
              { id: 'events', label: `📡 Events (${events.length})` },
              { id: 'token', label: '🔑 API Token' },
              { id: 'security', label: '🛡️ Security' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-medium ${
                  activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ==================================================== */}
          {/* TAB 1: 📊 DASHBOARD                                  */}
          {/* ==================================================== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider">NMS System</span>
                    <Server className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {systemInfo ? systemInfo.version : 'Online'}
                  </div>
                  <div className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>OpenNMS Horizon Active</span>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider">Monitored Nodes</span>
                    <Cpu className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{nodes.length}</div>
                  <div className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                    <span>Devices monitored in topology</span>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider">Active Alarms</span>
                    <Bell className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className={`text-2xl font-bold ${alarms.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {alarms.length}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                    <span>{alarms.length === 0 ? 'No active network alarms' : 'Requires operator attention'}</span>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider">Rate Limit Budget</span>
                    <Zap className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {rateLimit.remainingMinute} <span className="text-sm font-normal text-slate-400">/ {rateLimit.limitMinute}</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 mt-2 overflow-hidden border border-slate-800">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all"
                      style={{ width: `${(rateLimit.remainingMinute / rateLimit.limitMinute) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* System Details & Daemons */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-400" />
                      OpenNMS Core Services & Daemons
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                      All Daemons Operational
                    </span>
                  </div>

                  {systemInfo && systemInfo.services ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                      {Object.entries(systemInfo.services).map(([svc, status]) => (
                        <div
                          key={svc}
                          className="bg-slate-950 border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-between text-xs"
                        >
                          <span className="font-mono text-slate-300 truncate mr-2">{svc}</span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 text-[10px] font-bold">
                            {status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-500 text-sm">Loading services status...</div>
                  )}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-400" />
                    Gateway Configuration
                  </h3>

                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between py-2 border-b border-slate-800">
                      <span className="text-slate-400">Gateway URL</span>
                      <span className="font-mono text-white">https://localhost:8443</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-800">
                      <span className="text-slate-400">Backend NMS</span>
                      <span className="font-mono text-white">http://opennms:8980</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-800">
                      <span className="text-slate-400">Auth Method</span>
                      <span className="text-emerald-400 font-medium">OAuth2 Bearer Token</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-800">
                      <span className="text-slate-400">Upstream Auth</span>
                      <span className="text-slate-300">Basic (admin:admin)</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-400">Timezone</span>
                      <span className="text-slate-300">{systemInfo?.datetimeformatConfig?.zoneId || 'Asia/Kolkata'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 2: 🖥️ NODES                                       */}
          {/* ==================================================== */}
          {activeTab === 'nodes' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Network Nodes</h2>
                  <p className="text-xs text-slate-400">Monitored infrastructure inventory queried via `/nms/rest/nodes`</p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={nodeSearch}
                    onChange={(e) => setNodeSearch(e.target.value)}
                    placeholder="Search node label..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                      <tr>
                        <th className="px-5 py-3.5">ID</th>
                        <th className="px-5 py-3.5">Label</th>
                        <th className="px-5 py-3.5">Foreign Source</th>
                        <th className="px-5 py-3.5">Location</th>
                        <th className="px-5 py-3.5">Created Date</th>
                        <th className="px-5 py-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredNodes.length > 0 ? (
                        filteredNodes.map(node => (
                          <tr key={node.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-5 py-4 font-mono text-slate-300">#{node.id}</td>
                            <td className="px-5 py-4 font-medium text-white flex items-center gap-2">
                              <Cpu className="w-4 h-4 text-blue-400" />
                              <span>{node.label}</span>
                            </td>
                            <td className="px-5 py-4 font-mono text-slate-400">{node.foreignSource || 'N/A'}</td>
                            <td className="px-5 py-4 text-slate-300">{node.location || 'Default'}</td>
                            <td className="px-5 py-4 text-slate-400">
                              {node.createTime ? new Date(node.createTime).toLocaleString() : 'N/A'}
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                            No nodes found matching your query.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 3: 🚨 ALARMS                                      */}
          {/* ==================================================== */}
          {activeTab === 'alarms' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Active Alarms</h2>
                  <p className="text-xs text-slate-400">Real-time alerts and incident status queried via `/nms/rest/alarms`</p>
                </div>
                <span className="text-xs px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">
                  Total Active: <strong className="text-white">{alarms.length}</strong>
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                {alarms.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 flex items-center justify-center mx-auto">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-bold text-white">All Clear! No Active Alarms</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Network devices and monitored interfaces are currently healthy.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                        <tr>
                          <th className="px-5 py-3.5">Severity</th>
                          <th className="px-5 py-3.5">Node</th>
                          <th className="px-5 py-3.5">Description</th>
                          <th className="px-5 py-3.5">Last Event</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {alarms.map((alarm, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-5 py-4 font-bold text-red-400">{alarm.severity}</td>
                            <td className="px-5 py-4 text-white font-medium">{alarm.nodeLabel || 'N/A'}</td>
                            <td className="px-5 py-4 text-slate-300">{alarm.description}</td>
                            <td className="px-5 py-4 text-slate-400">{alarm.lastEventTime}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 4: 📡 EVENTS                                      */}
          {/* ==================================================== */}
          {activeTab === 'events' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Network Events</h2>
                  <p className="text-xs text-slate-400">Event log feed queried via `/nms/rest/events`</p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    placeholder="Search UEI or log message..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                      <tr>
                        <th className="px-5 py-3.5">ID</th>
                        <th className="px-5 py-3.5">Severity</th>
                        <th className="px-5 py-3.5">UEI / Identifier</th>
                        <th className="px-5 py-3.5">IP / Source</th>
                        <th className="px-5 py-3.5">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredEvents.length > 0 ? (
                        filteredEvents.map(event => (
                          <tr key={event.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-5 py-3.5 font-mono text-slate-400">#{event.id}</td>
                            <td className="px-5 py-3.5">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                  event.severity === 'WARNING'
                                    ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                                    : event.severity === 'NORMAL'
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                                    : 'bg-blue-950 text-blue-400 border border-blue-800/60'
                                }`}
                              >
                                {event.severity}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 font-mono text-slate-200">
                              <div className="max-w-md truncate" title={event.uei}>
                                {event.uei}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-slate-300">
                              {event.ipAddress || event.source || 'Local'}
                            </td>
                            <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">
                              {event.time ? new Date(event.time).toLocaleTimeString() : 'N/A'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                            No events found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 5: 🔑 API TOKEN MANAGEMENT                        */}
          {/* ==================================================== */}
          {activeTab === 'token' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h2 className="text-xl font-bold text-white">OAuth2 Bearer Token</h2>
                <p className="text-xs text-slate-400">Current authentication session credentials validated by Kong Gateway</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Active Access Token
                    </label>
                    <button
                      onClick={() => copyToClipboard(token)}
                      className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-950/60 border border-blue-800/60 px-3 py-1 rounded-lg transition-colors"
                    >
                      {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedToken ? 'Copied!' : 'Copy Token'}</span>
                    </button>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-sm text-emerald-400 break-all select-all">
                    {token}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider block mb-1">
                      Token Type
                    </span>
                    <span className="text-base font-bold text-white font-mono uppercase">{tokenType || 'Bearer'}</span>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider block mb-1">
                      Time Remaining
                    </span>
                    <span className="text-base font-bold text-emerald-400 font-mono">
                      {Math.floor(secondsRemaining / 60)}m {secondsRemaining % 60}s
                    </span>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider block mb-1">
                      Granted Scope
                    </span>
                    <span className="text-base font-bold text-indigo-400 font-mono">{scope}</span>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider block mb-1">
                      Client ID
                    </span>
                    <span className="text-base font-bold text-white font-mono truncate block">{clientId}</span>
                  </div>
                </div>

                {/* cURL usage snippet */}
                <div className="pt-4 border-t border-slate-800 space-y-2">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-blue-400" />
                    CLI Usage Example (cURL over HTTPS)
                  </span>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
                    <code>
                      curl -k https://localhost:8443/nms/rest/info \<br />
                      &nbsp;&nbsp;-H "Authorization: Bearer {token}"
                    </code>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 6: 🛡️ SECURITY STATUS & TESTS                    */}
          {/* ==================================================== */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Security Controls & Validation</h2>
                <p className="text-xs text-slate-400">Gateway layer security policies, encryption and real-time defense testing</p>
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <CheckCircle className="w-5 h-5" />
                    <span>HTTPS / TLS Encryption</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    TLS 1.3 enabled on port 8443 with self-signed certificate. All data in transit is encrypted.
                  </p>
                  <span className="inline-block text-[10px] font-mono bg-slate-950 px-2 py-1 rounded text-slate-300 border border-slate-800">
                    PORT 8443 (SSL)
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <CheckCircle className="w-5 h-5" />
                    <span>OAuth2 Authentication</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Kong OAuth2 plugin enforces Bearer Token validation. Unauthenticated calls are blocked with 401.
                  </p>
                  <span className="inline-block text-[10px] font-mono bg-slate-950 px-2 py-1 rounded text-slate-300 border border-slate-800">
                    PLUGIN: oauth2 (Active)
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <CheckCircle className="w-5 h-5" />
                    <span>Rate Limiting Protection</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Max 100 req/min and 1,000 req/hour per client. Prevents DoS attacks and resource exhaustion.
                  </p>
                  <span className="inline-block text-[10px] font-mono bg-slate-950 px-2 py-1 rounded text-slate-300 border border-slate-800">
                    POLICY: 100/min, 1000/hr
                  </span>
                </div>
              </div>

              {/* Interactive Security Tests */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-400" />
                  Interactive Security Test Suite
                </h3>
                <p className="text-xs text-slate-400">
                  Simulate attack scenarios directly against the live gateway to verify defensive enforcement:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  {/* Test 1: No Token */}
                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <h4 className="font-semibold text-white text-sm">1. Unauthenticated Request</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Send GET request without Authorization header.
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80">
                      <button
                        onClick={runTestNoToken}
                        disabled={testLoading.noToken}
                        className="w-full text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        {testLoading.noToken ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlayIcon />}
                        <span>Run Test</span>
                      </button>

                      {testResults.noToken && (
                        <div className={`mt-2 p-2 rounded text-[11px] font-medium flex items-center gap-1.5 ${testResults.noToken.pass ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60' : 'bg-red-950/80 text-red-400 border border-red-800/60'}`}>
                          {testResults.noToken.pass ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                          <span>{testResults.noToken.msg}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Test 2: Invalid Token */}
                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <h4 className="font-semibold text-white text-sm">2. Invalid Bearer Token</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Send request with forged/corrupted token.
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80">
                      <button
                        onClick={runTestInvalidToken}
                        disabled={testLoading.invalidToken}
                        className="w-full text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        {testLoading.invalidToken ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlayIcon />}
                        <span>Run Test</span>
                      </button>

                      {testResults.invalidToken && (
                        <div className={`mt-2 p-2 rounded text-[11px] font-medium flex items-center gap-1.5 ${testResults.invalidToken.pass ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60' : 'bg-red-950/80 text-red-400 border border-red-800/60'}`}>
                          {testResults.invalidToken.pass ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                          <span>{testResults.invalidToken.msg}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Test 3: Rate Limiting Burst */}
                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <h4 className="font-semibold text-white text-sm">3. Rate Limit Flood (DoS)</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Send 110 requests in rapid succession to trigger 429 throttling.
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80">
                      <button
                        onClick={runTestRateLimit}
                        disabled={testLoading.rateLimit}
                        className="w-full text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        {testLoading.rateLimit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlayIcon />}
                        <span>Run Flood Test</span>
                      </button>

                      {testResults.rateLimit && (
                        <div className={`mt-2 p-2 rounded text-[11px] font-medium flex items-center gap-1.5 ${testResults.rateLimit.pass ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60' : 'bg-red-950/80 text-red-400 border border-red-800/60'}`}>
                          {testResults.rateLimit.pass ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                          <span>{testResults.rateLimit.msg}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
