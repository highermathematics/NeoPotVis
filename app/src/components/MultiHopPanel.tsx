import { useState, useMemo } from 'react';
import type { HotpotQuestion } from '@/types/neo4j';
import { useI18n } from '@/i18n/I18nContext';
import { buildQueryPaths } from '@/utils/graphBuilder';
import { ArrowRight, FileText, HelpCircle, CheckCircle2, ChevronDown, ChevronUp, Search, X } from 'lucide-react';

interface Props {
  questions: HotpotQuestion[];
  onQuestionSelect?: (questionId: string) => void;
}

export default function MultiHopPanel({ questions, onQuestionSelect }: Props) {
  const { t } = useI18n();
  const queryPaths = useMemo(() => buildQueryPaths(questions), [questions]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedHops, setExpandedHops] = useState<Set<number>>(new Set());
  const [filterType, setFilterType] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Search + filter
  const filteredPaths = useMemo(() => {
    return queryPaths.filter(path => {
      // Type filter
      if (filterType !== 'all' && path.type !== filterType) return false;
      // Level filter
      if (filterLevel !== 'all' && path.level !== filterLevel) return false;
      // Search by questionId or question text
      if (searchQuery.trim()) {
        const sq = searchQuery.toLowerCase().trim();
        const matchId = path.questionId.toLowerCase().includes(sq);
        const matchQuestion = path.question.toLowerCase().includes(sq);
        const matchAnswer = path.answer.toLowerCase().includes(sq);
        // Also search in hop documents
        const matchDocs = path.hops.some(h =>
          h.from.toLowerCase().includes(sq) || h.to.toLowerCase().includes(sq)
        );
        if (!matchId && !matchQuestion && !matchAnswer && !matchDocs) return false;
      }
      return true;
    });
  }, [queryPaths, filterType, filterLevel, searchQuery]);

  const toggleHop = (hopIndex: number) => {
    setExpandedHops(prev => {
      const next = new Set(prev);
      if (next.has(hopIndex)) next.delete(hopIndex);
      else next.add(hopIndex);
      return next;
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'bridge': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'comparison': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      default: return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'easy': return 'text-green-400';
      case 'medium': return 'text-yellow-400';
      case 'hard': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getHopColor = (hop: number) => {
    const colors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];
    return colors[(hop - 1) % colors.length];
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'bridge': return t('type.bridge');
      case 'comparison': return t('type.comparison');
      case 'composition': return t('type.composition');
      default: return type;
    }
  };

  const getLevelLabel = (level: string) => {
    switch (level) {
      case 'easy': return t('level.easy');
      case 'medium': return t('level.medium');
      case 'hard': return t('level.hard');
      default: return level;
    }
  };

  // Highlight matched text
  const renderMatchedText = (text: string, query: string) => {
    if (!query.trim()) return <span>{text}</span>;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) return <span>{text}</span>;
    return (
      <span>
        {text.substring(0, idx)}
        <mark className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">
          {text.substring(idx, idx + query.length)}
        </mark>
        {text.substring(idx + query.length)}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t('multihop.searchPlaceholder')}
          className="w-full pl-10 pr-10 py-2.5 bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none placeholder:text-gray-500"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{t('multihop.type')}:</span>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="all">{t('multihop.allTypes')}</option>
            <option value="bridge">{t('type.bridge')}</option>
            <option value="comparison">{t('type.comparison')}</option>
            <option value="composition">{t('type.composition')}</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{t('multihop.level')}:</span>
          <select
            value={filterLevel}
            onChange={e => setFilterLevel(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="all">{t('multihop.allLevels')}</option>
            <option value="easy">{t('level.easy')}</option>
            <option value="medium">{t('level.medium')}</option>
            <option value="hard">{t('level.hard')}</option>
          </select>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          {t('multihop.showing', { filtered: filteredPaths.length, total: queryPaths.length })}
        </div>
      </div>

      {/* Query Path Cards */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {filteredPaths.map((path) => (
          <div
            key={path.questionId}
            className={`bg-gray-900/70 rounded-lg border transition-all overflow-hidden ${
              selectedPath === path.questionId
                ? 'border-blue-500/50 shadow-lg shadow-blue-500/10'
                : 'border-gray-800 hover:border-gray-700'
            }`}
          >
            {/* Question Header */}
            <button
              onClick={() => {
                setSelectedPath(selectedPath === path.questionId ? null : path.questionId);
                onQuestionSelect?.(path.questionId);
              }}
              className="w-full p-4 flex items-start gap-3 text-left hover:bg-gray-800/50 transition-colors"
            >
              <HelpCircle className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${getTypeColor(path.type)}`}>
                    {getTypeLabel(path.type)}
                  </span>
                  <span className={`text-xs font-medium ${getLevelColor(path.level)}`}>
                    {getLevelLabel(path.level)}
                  </span>
                  <span className="text-xs text-gray-600">
                    {path.hops.length - 1} {t('multihop.hops')}
                  </span>
                  {/* Question ID badge */}
                  <span className="text-xs font-mono text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                    {path.questionId.substring(0, 8)}...
                  </span>
                </div>
                <p className="text-sm text-gray-200 font-medium leading-relaxed">
                  {renderMatchedText(path.question, searchQuery)}
                </p>
                {searchQuery && path.answer.toLowerCase().includes(searchQuery.toLowerCase()) && (
                  <p className="text-xs text-emerald-400 mt-1">
                    {t('multihop.answer')}: {renderMatchedText(path.answer, searchQuery)}
                  </p>
                )}
              </div>
              {selectedPath === path.questionId ? (
                <ChevronUp className="w-4 h-4 text-gray-500 shrink-0 mt-1" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500 shrink-0 mt-1" />
              )}
            </button>

            {/* Expanded Path Visualization */}
            {selectedPath === path.questionId && (
              <div className="px-4 pb-4 border-t border-gray-800 pt-3">
                {/* Question ID */}
                <div className="mb-3 p-2 bg-gray-800/50 rounded border border-gray-700/50">
                  <span className="text-xs text-gray-500">Question ID: </span>
                  <span className="text-xs font-mono text-blue-300">{path.questionId}</span>
                </div>

                {/* Multi-hop flow */}
                <div className="space-y-2">
                  {path.hops.map((hop, hopIdx) => (
                    <div key={hopIdx}>
                      <button
                        onClick={() => toggleHop(hopIdx)}
                        className="w-full flex items-center gap-3 py-2 group"
                      >
                        {/* Hop indicator */}
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: getHopColor(hop.hop) }}
                        >
                          {hop.hop}
                        </div>

                        {/* Connection line */}
                        {hopIdx > 0 && (
                          <div className="absolute left-7 w-0.5 h-6 bg-gray-700 -translate-y-5" />
                        )}

                        {/* Hop content */}
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-gray-400 truncate max-w-[200px]">
                              {hop.from.length > 40 ? hop.from.substring(0, 40) + '...' : hop.from}
                            </span>
                            <ArrowRight className="w-3 h-3 text-gray-600 shrink-0" />
                            <span className="text-sm font-medium truncate max-w-[200px]" style={{ color: getHopColor(hop.hop) }}>
                              {hop.to.length > 40 ? hop.to.substring(0, 40) + '...' : hop.to}
                            </span>
                          </div>
                        </div>

                        {/* Relation badge */}
                        <span
                          className="px-2 py-0.5 text-xs rounded-full text-white shrink-0"
                          style={{ backgroundColor: getHopColor(hop.hop) + '80' }}
                        >
                          {hop.relation}
                        </span>

                        {hop.sentences.length > 0 && (
                          expandedHops.has(hopIdx) ? (
                            <ChevronUp className="w-3 h-3 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-gray-500" />
                          )
                        )}
                      </button>

                      {/* Expanded sentences */}
                      {expandedHops.has(hopIdx) && hop.sentences.length > 0 && (
                        <div className="ml-11 mb-3 space-y-2">
                          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {t('multihop.supportingSentences')}
                          </div>
                          {hop.sentences.map((sent, sIdx) => (
                            <div
                              key={sIdx}
                              className="p-2.5 bg-gray-800/70 rounded-lg border border-gray-700/50"
                            >
                              <p className="text-sm text-gray-300 leading-relaxed">{sent}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Answer */}
                <div className="mt-4 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-xs text-emerald-400 font-medium uppercase tracking-wider">{t('multihop.answer')}</span>
                    <p className="text-lg font-semibold text-emerald-300">{path.answer}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Empty state */}
        {filteredPaths.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('multihop.noResults')}</p>
            {searchQuery && (
              <p className="text-xs mt-1 text-gray-600">
                {t('multihop.trySearch')} &quot;{searchQuery}&quot;
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
