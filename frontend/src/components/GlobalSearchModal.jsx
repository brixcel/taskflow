import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';

function useDebounce(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}

const PRESET_CHIPS = [
  { label: 'All Tasks', query: '' },
  { label: '👤 Assigned to me', query: 'assignee:me' },
  { label: '🚨 Urgent & High', query: 'priority:urgent,high' },
  { label: '📅 Due Today', query: 'due:today' },
  { label: '⚠️ Overdue', query: 'due:overdue' },
  { label: '📋 To Do', query: 'status:todo' },
  { label: '🔄 In Progress', query: 'status:in_progress' },
];

const OPERATOR_HINTS = [
  { key: 'status:', desc: 'todo, in_progress, done', example: 'status:todo' },
  { key: 'assignee:', desc: 'me, unassigned, name', example: 'assignee:me' },
  { key: 'priority:', desc: 'urgent, high, medium, low', example: 'priority:high' },
  { key: 'due:', desc: 'today, tomorrow, overdue, this_week', example: 'due:today' },
  { key: 'project:', desc: 'project name or none', example: 'project:website' },
  { key: 'label:', desc: 'frontend, bug, docs', example: 'label:frontend' },
  { key: 'is:', desc: 'open, done, overdue, assigned', example: 'is:overdue' },
  { key: 'has:', desc: 'subtasks, comments, due', example: 'has:subtasks' },
];

function highlightMatch(text, query) {
  if (!text || !query || !query.trim()) return text;
  // Clean query of operators for text highlighting
  const cleanTerms = query
    .replace(/[a-zA-Z_-]+:(?:"[^"]+"|'[^']+'|[^\s]+)/g, '')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (cleanTerms.length === 0) return text;

  try {
    const pattern = new RegExp(`(${cleanTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts = text.split(pattern);
    return parts.map((part, i) =>
      pattern.test(part) ? (
        <mark
          key={i}
          className="bg-amber-400/30 text-[var(--color-canvas-ink,#171717)] font-semibold rounded px-0.5"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  } catch {
    return text;
  }
}

function PriorityBadge({ priority }) {
  const p = priority?.toLowerCase() || 'medium';
  const config = {
    urgent: { label: 'Urgent', color: '#e5484d', bg: 'rgba(229, 72, 77, 0.12)', border: 'rgba(229, 72, 77, 0.3)' },
    high:   { label: 'High',   color: '#f76808', bg: 'rgba(247, 104, 8, 0.12)', border: 'rgba(247, 104, 8, 0.3)' },
    medium: { label: 'Med',    color: '#0070f3', bg: 'rgba(0, 112, 243, 0.10)', border: 'rgba(0, 112, 243, 0.25)' },
    low:    { label: 'Low',    color: '#8a8f98', bg: 'rgba(138, 143, 152, 0.10)', border: 'rgba(138, 143, 152, 0.2)' },
  }[p] || { label: 'Med', color: '#0070f3', bg: 'rgba(0, 112, 243, 0.10)', border: 'rgba(0, 112, 243, 0.25)' };

  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase shrink-0"
      style={{ color: config.color, background: config.bg, border: `1px solid ${config.border}` }}
    >
      {config.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = status?.toLowerCase() || 'todo';
  const config = {
    todo:        { label: 'To Do',        color: '#6e7681', bg: 'rgba(110, 118, 129, 0.1)' },
    in_progress: { label: 'In Progress',  color: '#0070f3', bg: 'rgba(0, 112, 243, 0.12)' },
    done:        { label: 'Done',         color: '#30a46c', bg: 'rgba(48, 164, 108, 0.12)' },
  }[s] || { label: s, color: '#6e7681', bg: 'rgba(110, 118, 129, 0.1)' };

  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0"
      style={{ color: config.color, background: config.bg }}
    >
      {config.label}
    </span>
  );
}

export default function GlobalSearchModal({
  isOpen,
  onClose,
  onSelectTask,
  onSelectProject,
  initialQuery = '',
}) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, 180);
  const [results, setResults] = useState([]);
  const [parsedTokens, setParsedTokens] = useState([]);
  const [facets, setFacets] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [savedSearches, setSavedSearches] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [suggestions, setSuggestions] = useState(null);

  const [isAiMode, setIsAiMode] = useState(false);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [aiSearchExpression, setAiSearchExpression] = useState(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  const token = localStorage.getItem('token');
  const team = (() => {
    try { return JSON.parse(localStorage.getItem('team')); } catch { return null; }
  })();

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Team-Id': team?.id,
  };

  // Sync initial query if opened with one
  useEffect(() => {
    if (isOpen) {
      if (initialQuery) setQuery(initialQuery);
      setTimeout(() => inputRef.current?.focus(), 50);
      fetchSavedSearches();
      fetchRecentSearches();
      fetchSuggestions('');
    } else {
      setIsSaving(false);
    }
  }, [isOpen, initialQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch saved searches
  const fetchSavedSearches = async () => {
    if (!token || !team?.id) return;
    try {
      const res = await axios.get(`${API_URL}/search/saved`, { headers });
      setSavedSearches(res.data.savedSearches || []);
    } catch {
      // ignore
    }
  };

  // Fetch recent searches
  const fetchRecentSearches = async () => {
    if (!token || !team?.id) return;
    try {
      const res = await axios.get(`${API_URL}/search/recent`, { headers });
      setRecentSearches(res.data.recentSearches || []);
    } catch {
      // ignore
    }
  };

  // Fetch suggestions
  const fetchSuggestions = async (q) => {
    if (!token || !team?.id) return;
    try {
      const res = await axios.get(`${API_URL}/search/suggestions`, {
        headers,
        params: { q },
      });
      setSuggestions(res.data);
    } catch {
      // ignore
    }
  };

  // Record a search into recent history
  const recordRecentSearch = async (searchStr) => {
    if (!token || !team?.id || !searchStr.trim()) return;
    try {
      await axios.post(`${API_URL}/search/recent`, { query: searchStr.trim() }, { headers });
      fetchRecentSearches();
    } catch {
      // ignore
    }
  };

  // Execute search API
  const performSearch = useCallback(async (q, useAi = isAiMode) => {
    if (!token || !team?.id) return;
    setIsLoading(true);
    try {
      if (useAi && q.trim().length >= 2) {
        const res = await axios.post(
          `${API_URL}/ai/search`,
          { prompt: q.trim(), executeSearch: true },
          { headers }
        );
        setResults(res.data.results || []);
        setTotalCount(res.data.total || 0);
        setAiExplanation(res.data.explanation || null);
        setAiSearchExpression(res.data.searchExpression || null);
        setParsedTokens([]);
        setFacets(res.data.facets || null);
      } else {
        setAiExplanation(null);
        setAiSearchExpression(null);
        const res = await axios.get(`${API_URL}/search/tasks`, {
          headers,
          params: { q, pageSize: 30 },
        });
        setResults(res.data.tasks || []);
        setTotalCount(res.data.pagination?.total || 0);
        setParsedTokens(res.data.parsedQuery?.tokens || []);
        setFacets(res.data.facets || null);
      }
      setSelectedIndex(0);

      // Record to recent if non-empty query
      if (q.trim().length >= 3) {
        recordRecentSearch(q.trim());
      }
    } catch {
      setResults([]);
      setTotalCount(0);
      setAiExplanation(null);
    } finally {
      setIsLoading(false);
    }
  }, [token, team?.id, isAiMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger search on debounced query change
  useEffect(() => {
    if (isOpen) {
      performSearch(debouncedQuery, isAiMode);
      if (!isAiMode) {
        fetchSuggestions(debouncedQuery);
      }
    }
  }, [debouncedQuery, isOpen, isAiMode, performSearch]);

  // Handle keyboard shortcuts inside modal
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter' && !isSaving) {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleTaskClick(results[selectedIndex]);
      }
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleTaskClick = (task) => {
    if (query.trim()) recordRecentSearch(query.trim());
    onClose();
    onSelectTask?.(task.id);
  };

  const handleApplyPreset = (presetQuery) => {
    setQuery(presetQuery);
    inputRef.current?.focus();
  };

  const handleAppendToken = (tokenStr) => {
    setQuery((prev) => (prev.trim() ? `${prev.trim()} ${tokenStr} ` : `${tokenStr} `));
    inputRef.current?.focus();
  };

  // Save current search
  const handleSaveSearchSubmit = async (e) => {
    e.preventDefault();
    if (!saveName.trim() || !query.trim()) return;
    setSaveLoading(true);
    try {
      await axios.post(
        `${API_URL}/search/saved`,
        { name: saveName.trim(), query: query.trim() },
        { headers }
      );
      setSaveName('');
      setIsSaving(false);
      fetchSavedSearches();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save search');
    } finally {
      setSaveLoading(false);
    }
  };

  // Delete saved search
  const handleDeleteSavedSearch = async (e, id) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API_URL}/search/saved/${id}`, { headers });
      setSavedSearches((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // ignore
    }
  };

  // Clear recent searches
  const handleClearRecent = async () => {
    try {
      await axios.delete(`${API_URL}/search/recent`, { headers });
      setRecentSearches([]);
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-modal-title"
    >
      <div
        className="w-full max-w-3xl bg-[var(--color-canvas-card,#ffffff)] text-[var(--color-canvas-ink,#171717)] border border-[var(--color-canvas-hairline,#ebebeb)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh] transition-all duration-200"
        onKeyDown={handleKeyDown}
      >
        {/* ── Search Input Header ── */}
        <div className="p-4 border-b border-[var(--color-canvas-hairline,#ebebeb)] flex items-center gap-3 bg-[var(--color-canvas-main,#fafafa)]">
          <svg
            className="w-5 h-5 text-[var(--color-canvas-mute,#888888)] shrink-0"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="M15 15l4 4" />
          </svg>

          <input
            ref={inputRef}
            id="global-search-input"
            type="text"
            className="w-full bg-transparent border-0 outline-none text-[15px] font-medium placeholder:text-[var(--color-canvas-mute,#888888)]"
            placeholder="Search tasks, expressions (e.g. status:todo assignee:me due:today)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck="false"
          />

          <button
            type="button"
            onClick={() => {
              const nextMode = !isAiMode;
              setIsAiMode(nextMode);
              if (query.trim()) {
                performSearch(query, nextMode);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-all cursor-pointer border shrink-0 ${
              isAiMode
                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-transparent shadow-sm'
                : 'bg-[var(--color-canvas-card,#ffffff)] text-[var(--color-canvas-mute,#888888)] border-[var(--color-canvas-hairline,#ebebeb)] hover:text-indigo-600 hover:border-indigo-300'
            }`}
            title="Toggle Natural-Language AI Search"
          >
            <span>✨</span>
            <span className="hidden sm:inline">{isAiMode ? 'AI Search' : 'AI Search'}</span>
          </button>

          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-[var(--color-canvas-mute,#888888)] hover:text-[var(--color-canvas-ink,#171717)] hover:bg-[var(--color-canvas-hover,#ebebeb)] transition-colors cursor-pointer border-0 bg-transparent"
              title="Clear search"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          )}

          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-mono text-[var(--color-canvas-mute,#888888)] bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] rounded shadow-sm">
            ESC
          </kbd>
        </div>

        {/* ── AI Explanation Banner (when in AI search mode) ── */}
        {isAiMode && aiExplanation && (
          <div className="px-4 py-2 border-b border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-950/30 flex flex-wrap items-center justify-between gap-2 text-[12px] text-indigo-900 dark:text-indigo-200 animate-fade-in">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-base shrink-0">✨</span>
              <span className="font-medium truncate">{aiExplanation}</span>
            </div>
            {aiSearchExpression && (
              <button
                onClick={() => {
                  setIsAiMode(false);
                  setQuery(aiSearchExpression);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 font-mono text-[11px] transition-colors cursor-pointer border-0 shrink-0"
                title="Convert to standard expression"
              >
                <span>Filter: {aiSearchExpression}</span>
                <span>↗</span>
              </button>
            )}
          </div>
        )}

        {/* ── Active Token Highlight Pills (if query has operators) ── */}
        {parsedTokens.length > 0 && (
          <div className="px-4 py-2 border-b border-[var(--color-canvas-hairline,#ebebeb)] flex flex-wrap items-center gap-1.5 bg-[var(--color-canvas-hover,#f5f5f5)] text-[12px]">
            <span className="text-[var(--color-canvas-mute,#888888)] font-medium text-[11px] mr-1">Active filters:</span>
            {parsedTokens.map((t, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-medium"
              >
                <span className="opacity-75">{t.key}:</span>
                <span className="font-semibold">{t.value}</span>
              </span>
            ))}
            {query.trim() && (
              <button
                onClick={() => setIsSaving(true)}
                className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] text-[var(--color-canvas-ink,#171717)] hover:bg-[var(--color-canvas-hover,#ebebeb)] transition-colors cursor-pointer"
              >
                💾 Save filter
              </button>
            )}
          </div>
        )}

        {/* ── Inline Save Search Dialog ── */}
        {isSaving && (
          <form
            onSubmit={handleSaveSearchSubmit}
            className="px-4 py-2.5 bg-blue-50/50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800/40 flex items-center gap-2"
          >
            <span className="text-[12px] font-medium text-blue-700 dark:text-blue-300">Save query as:</span>
            <input
              type="text"
              required
              placeholder="e.g. My Urgent Tasks"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="flex-1 px-2.5 py-1 text-[13px] bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] rounded-md outline-none focus:border-blue-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={saveLoading || !saveName.trim()}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[12px] font-medium transition-colors disabled:opacity-50 cursor-pointer border-0"
            >
              {saveLoading ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setIsSaving(false)}
              className="px-2 py-1 text-[12px] text-[var(--color-canvas-mute,#888888)] hover:text-[var(--color-canvas-ink,#171717)] cursor-pointer bg-transparent border-0"
            >
              Cancel
            </button>
          </form>
        )}

        {/* ── Quick Preset Chips Toolbar ── */}
        <div className="px-4 py-2 border-b border-[var(--color-canvas-hairline,#ebebeb)] flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[12px]">
          {PRESET_CHIPS.map((chip, idx) => {
            const isActive = query === chip.query;
            return (
              <button
                key={idx}
                onClick={() => handleApplyPreset(chip.query)}
                className={`px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-colors cursor-pointer border ${
                  isActive
                    ? 'bg-[var(--color-canvas-ink,#171717)] text-[var(--color-canvas-main,#ffffff)] border-transparent'
                    : 'bg-[var(--color-canvas-card,#ffffff)] text-[var(--color-canvas-body,#4d4d4d)] border-[var(--color-canvas-hairline,#ebebeb)] hover:border-[var(--color-canvas-hairline-strong,#a1a1a1)] hover:text-[var(--color-canvas-ink,#171717)]'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* ── Modal Content: Suggestions + Results ── */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4" ref={listRef}>
          {/* Suggestions & Operators Panel when query is empty or being built */}
          {!query.trim() && (
            <div className="space-y-4 py-1">
              {/* Saved Searches */}
              {savedSearches.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-canvas-mute,#888888)] px-2 mb-1.5 flex items-center justify-between">
                    <span>Saved Filters</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {savedSearches.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => handleApplyPreset(s.query)}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--color-canvas-hairline,#ebebeb)] bg-[var(--color-canvas-main,#fafafa)] hover:bg-[var(--color-canvas-hover,#f0f0f0)] cursor-pointer group transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-[var(--color-canvas-ink,#171717)] truncate">
                            {s.name}
                          </div>
                          <div className="text-[11px] text-[var(--color-canvas-mute,#888888)] font-mono truncate">
                            {s.query}
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteSavedSearch(e, s.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-canvas-mute,#888888)] hover:text-red-500 transition-opacity cursor-pointer border-0 bg-transparent"
                          title="Delete saved filter"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-canvas-mute,#888888)] px-2 mb-1.5 flex items-center justify-between">
                    <span>Recent Searches</span>
                    <button
                      onClick={handleClearRecent}
                      className="text-[11px] text-[var(--color-canvas-mute,#888888)] hover:text-red-500 lowercase cursor-pointer bg-transparent border-0"
                    >
                      Clear history
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {recentSearches.map((rs) => (
                      <button
                        key={rs.id}
                        onClick={() => handleApplyPreset(rs.query)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] bg-[var(--color-canvas-hover,#f5f5f5)] text-[var(--color-canvas-body,#4d4d4d)] hover:text-[var(--color-canvas-ink,#171717)] hover:bg-[var(--color-canvas-hairline,#ebebeb)] transition-colors cursor-pointer border-0"
                      >
                        <span className="opacity-60">🕒</span>
                        <span>{rs.query}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Operator Cheatsheet */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-canvas-mute,#888888)] px-2 mb-1.5">
                  Search Operators (Click to insert)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {OPERATOR_HINTS.map((hint, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAppendToken(hint.example)}
                      className="text-left p-2 rounded-lg border border-[var(--color-canvas-hairline,#ebebeb)] bg-[var(--color-canvas-main,#fafafa)] hover:bg-[var(--color-canvas-hover,#f0f0f0)] transition-all cursor-pointer"
                    >
                      <div className="text-[12px] font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {hint.key}
                      </div>
                      <div className="text-[11px] text-[var(--color-canvas-mute,#888888)] truncate">
                        {hint.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-[var(--color-canvas-mute,#888888)]">
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-[12px]">Searching across tasks...</span>
            </div>
          )}

          {/* Search Results List */}
          {!isLoading && results.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-canvas-mute,#888888)] px-2 flex items-center justify-between">
                <span>Matching Tasks ({totalCount})</span>
                {facets?.status && (
                  <span className="text-[11px] lowercase opacity-75">
                    {facets.status.todo || 0} todo · {facets.status.in_progress || 0} in progress · {facets.status.done || 0} done
                  </span>
                )}
              </div>

              {results.map((task, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <div
                    key={task.id}
                    data-index={index}
                    onClick={() => handleTaskClick(task)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-blue-500/5 border-blue-500/30 shadow-sm'
                        : 'bg-[var(--color-canvas-card,#ffffff)] border-[var(--color-canvas-hairline,#ebebeb)] hover:border-[var(--color-canvas-hairline-strong,#a1a1a1)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={task.status} />
                        <PriorityBadge priority={task.priority} />

                        {task.project && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectProject?.(task.project.id);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--color-canvas-hover,#f5f5f5)] text-[var(--color-canvas-ink,#171717)] hover:bg-[var(--color-canvas-hairline,#ebebeb)] transition-colors"
                          >
                            <span>{task.project.icon || '📁'}</span>
                            <span className="truncate max-w-[120px]">{task.project.name}</span>
                          </span>
                        )}

                        <span className="text-[14px] font-semibold text-[var(--color-canvas-ink,#171717)] truncate">
                          {highlightMatch(task.title, query)}
                        </span>
                      </div>

                      {task.description && (
                        <p className="text-[12px] text-[var(--color-canvas-body,#4d4d4d)] line-clamp-1">
                          {highlightMatch(task.description, query)}
                        </p>
                      )}

                      {task.labels && task.labels.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                          {task.labels.map((lbl, lIdx) => (
                            <span
                              key={lIdx}
                              className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--color-canvas-hover,#f5f5f5)] text-[var(--color-canvas-mute,#888888)]"
                            >
                              #{lbl}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Metadata & Actions */}
                    <div className="flex items-center gap-3 shrink-0 text-[12px] text-[var(--color-canvas-mute,#888888)]">
                      {task.dueDate && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium">
                          📅 {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}

                      {task.subtasks?.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium">
                          ✓ {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
                        </span>
                      )}

                      {task.assignee && (
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--color-canvas-hover,#ebebeb)] text-[10px] font-bold font-mono text-[var(--color-canvas-ink,#171717)]"
                          title={`Assigned to ${task.assignee.name}`}
                        >
                          {task.assignee.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}

                      <span className="text-blue-600 dark:text-blue-400 font-medium text-[12px] hidden sm:inline-block">
                        Open ↗
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick matching projects (if any) */}
          {!isLoading && suggestions?.quickProjects?.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-canvas-mute,#888888)] px-2">
                Matching Projects
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestions.quickProjects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectProject?.(p.id);
                      onClose();
                    }}
                    className="p-2.5 rounded-lg border border-[var(--color-canvas-hairline,#ebebeb)] bg-[var(--color-canvas-main,#fafafa)] hover:bg-[var(--color-canvas-hover,#f0f0f0)] cursor-pointer flex items-center gap-2"
                  >
                    <span className="text-base">{p.icon || '📁'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-[var(--color-canvas-ink,#171717)] truncate">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-[var(--color-canvas-mute,#888888)] capitalize">
                        {p.status || 'active'} project
                      </div>
                    </div>
                    <span className="text-[12px] text-blue-600 dark:text-blue-400 font-medium">View</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && query.trim() && results.length === 0 && (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[var(--color-canvas-hover,#f5f5f5)] text-[var(--color-canvas-mute,#888888)] flex items-center justify-center mx-auto text-xl">
                🔍
              </div>
              <div className="space-y-1">
                <p className="text-[15px] font-semibold text-[var(--color-canvas-ink,#171717)]">
                  No tasks matched &ldquo;{query}&rdquo;
                </p>
                <p className="text-[13px] text-[var(--color-canvas-mute,#888888)] max-w-sm mx-auto">
                  Try checking for spelling errors, removing specific operator filters, or using broader terms.
                </p>
              </div>
              <div className="flex justify-center gap-2 pt-2">
                <button
                  onClick={() => setQuery('')}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-canvas-hover,#f5f5f5)] text-[var(--color-canvas-ink,#171717)] hover:bg-[var(--color-canvas-hairline,#ebebeb)] transition-colors cursor-pointer border-0"
                >
                  Clear filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer Navigation Cheatsheet ── */}
        <div className="px-4 py-2.5 border-t border-[var(--color-canvas-hairline,#ebebeb)] bg-[var(--color-canvas-main,#fafafa)] text-[11px] text-[var(--color-canvas-mute,#888888)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] font-mono mr-1">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] font-mono mr-1">
                ↓
              </kbd>
              Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] font-mono mr-1">
                ↵
              </kbd>
              Open task
            </span>
          </div>

          <span className="hidden sm:inline-block">
            Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] font-mono">/</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] font-mono">⌘K</kbd> anywhere
          </span>
        </div>
      </div>
    </div>
  );
}
