import { useState, useMemo } from 'react';
import type { GraphData, GraphNode } from '@/types/neo4j';
import { useI18n } from '@/i18n/I18nContext';
import { Search, X, Filter, Eye } from 'lucide-react';

interface Props {
  graphData: GraphData;
  onNodeHighlight?: (nodeIds: string[]) => void;
  onNodeSelect?: (node: GraphNode) => void;
}

export default function SearchPanel({ graphData, onNodeHighlight, onNodeSelect }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const allTypes = useMemo(() => {
    return [...new Set(graphData.nodes.map(n => n.label))];
  }, [graphData]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    
    const lowerQuery = query.toLowerCase().trim();
    const matches: {
      node: GraphNode;
      property: string;
      value: string;
      matchIndex: number;
    }[] = [];
    const seen = new Set<string>();

    graphData.nodes.forEach(node => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(node.label)) {
        return;
      }

      Object.entries(node.properties).forEach(([key, value]) => {
        if (typeof value === 'string' && value.toLowerCase().includes(lowerQuery)) {
          const resultId = `${node.id}-${key}`;
          if (!seen.has(resultId)) {
            seen.add(resultId);
            matches.push({
              node,
              property: key,
              value,
              matchIndex: value.toLowerCase().indexOf(lowerQuery)
            });
          }
        }
      });
    });

    return matches.sort((a, b) => {
      const aExact = a.value.toLowerCase() === lowerQuery;
      const bExact = b.value.toLowerCase() === lowerQuery;
      if (aExact && !bExact) return -1;
      if (bExact && !aExact) return 1;
      return a.matchIndex - b.matchIndex;
    }).slice(0, 50);
  }, [query, graphData, selectedTypes]);

  const toggleType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const highlightResult = (node: GraphNode) => {
    onNodeHighlight?.([node.id]);
    onNodeSelect?.(node);
  };

  const getNodeTypeColor = (label: string) => {
    switch (label) {
      case 'Question': return 'bg-blue-500 text-blue-400';
      case 'Answer': return 'bg-emerald-500 text-emerald-400';
      case 'Document': return 'bg-amber-500 text-amber-400';
      case 'Entity': return 'bg-purple-500 text-purple-400';
      case 'Sentence': return 'bg-gray-500 text-gray-400';
      default: return 'bg-gray-500';
    }
  };

  const renderHighlightedText = (text: string, query: string) => {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const parts: { text: string; isMatch: boolean }[] = [];
    
    let lastIndex = 0;
    let index = lowerText.indexOf(lowerQuery);
    
    while (index !== -1) {
      if (index > lastIndex) {
        parts.push({ text: text.substring(lastIndex, index), isMatch: false });
      }
      parts.push({ text: text.substring(index, index + query.length), isMatch: true });
      lastIndex = index + query.length;
      index = lowerText.indexOf(lowerQuery, lastIndex);
    }
    
    if (lastIndex < text.length) {
      parts.push({ text: text.substring(lastIndex), isMatch: false });
    }

    return (
      <>
        {parts.map((part, i) => (
          <span
            key={i}
            className={part.isMatch ? 'bg-yellow-500/30 text-yellow-200 font-semibold' : ''}
          >
            {part.text}
          </span>
        ))}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('search.placeholder')}
          className="w-full pl-10 pr-10 py-2.5 bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none placeholder:text-gray-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filters Toggle */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        <Filter className="w-4 h-4" />
        {t('search.filters')} {selectedTypes.length > 0 && `(${selectedTypes.length} active)`}
      </button>

      {showFilters && (
        <div className="flex flex-wrap gap-2">
          {allTypes.map(type => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                selectedTypes.includes(type)
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {type}
            </button>
          ))}
          {selectedTypes.length > 0 && (
            <button
              onClick={() => setSelectedTypes([])}
              className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              {t('search.clearAll')}
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {query.trim() && (
        <div className="text-sm text-gray-500">
          {t('search.found', { count: results.length })}
        </div>
      )}

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
        {results.map((result, idx) => (
          <button
            key={idx}
            onClick={() => highlightResult(result.node)}
            className="w-full text-left p-3 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-blue-500/50 hover:bg-gray-800/50 transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${getNodeTypeColor(result.node.label).split(' ')[0]}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300`}>
                    {result.node.label}
                  </span>
                  <span className="text-xs text-gray-600">{result.property}</span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed truncate">
                  {renderHighlightedText(
                    result.value.length > 200 ? result.value.substring(0, 200) + '...' : result.value,
                    query
                  )}
                </p>
              </div>
              <Eye className="w-4 h-4 text-gray-600 group-hover:text-blue-400 shrink-0 opacity-0 group-hover:opacity-100 transition-all" />
            </div>
          </button>
        ))}
      </div>

      {query.trim() && results.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>{t('search.noResults', { query })}</p>
          <p className="text-xs mt-1">{t('search.tryDifferent')}</p>
        </div>
      )}
    </div>
  );
}
