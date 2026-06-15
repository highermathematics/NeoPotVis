import { useState, useCallback } from 'react';
import type { GraphData } from '@/types/neo4j';
import { useI18n } from '@/i18n/I18nContext';
import { executeCypherQuery } from '@/utils/graphBuilder';
import { Play, Terminal, Clock, Table2, AlertCircle, History } from 'lucide-react';

interface Props {
  graphData: GraphData;
  onQueryResult?: (nodeIds: string[]) => void;
}

const EXAMPLE_QUERIES = [
  'MATCH (q:Question) RETURN q LIMIT 10',
  'MATCH (q:Question) WHERE q.type = "bridge" RETURN q LIMIT 5',
  'MATCH (d:Document) RETURN d LIMIT 10',
  'MATCH (q:Question) WHERE q.level = "hard" RETURN q LIMIT 5',
  'MATCH (a:Answer) RETURN a LIMIT 10',
  'MATCH (e:Entity) RETURN e LIMIT 10'
];

export default function CypherPanel({ graphData, onQueryResult }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{
    columns: string[];
    rows: any[][];
    executionTime: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const executeQuery = useCallback(() => {
    setError(null);
    
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    const result = executeCypherQuery(graphData, query);
    
    if (result) {
      setResult(result);
      setHistory(prev => [query, ...prev.filter(h => h !== query).slice(0, 9)]);
      
      // Extract node IDs for highlighting
      const nodeIds: string[] = [];
      result.rows.forEach(row => {
        row.forEach(cell => {
          if (cell && typeof cell === 'object' && cell.id) {
            nodeIds.push(cell.id);
          }
        });
      });
      onQueryResult?.(nodeIds);
    } else {
      setError(t('cypher.invalid'));
    }
  }, [query, graphData, onQueryResult]);

  const runExample = (example: string) => {
    setQuery(example);
    setTimeout(() => executeQuery(), 50);
  };

  return (
    <div className="space-y-4">
      {/* Query Input */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Terminal className="w-4 h-4" />
          <span>{t('cypher.subtitle')}</span>
        </div>
        <div className="relative">
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.metaKey) {
                executeQuery();
              }
            }}
            placeholder="MATCH (q:Question) RETURN q LIMIT 10"
            className="w-full h-28 p-3 bg-gray-900 border border-gray-700 text-gray-200 text-sm font-mono rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none placeholder:text-gray-600"
            spellCheck={false}
          />
          <div className="absolute bottom-2 right-2 flex gap-1">
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="p-1.5 bg-gray-800 text-gray-400 hover:text-gray-200 rounded transition-colors"
                title="Query History"
              >
                <History className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={executeQuery}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              {t('cypher.execute')}
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {t('cypher.cmdEnter')}
        </div>
      </div>

      {/* History Dropdown */}
      {showHistory && history.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
          <div className="p-2 border-b border-gray-800 text-xs text-gray-500 font-medium">
            {t('cypher.history')}
          </div>
          {history.map((h, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuery(h);
                setShowHistory(false);
              }}
              className="w-full text-left px-3 py-2 text-xs font-mono text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors border-b border-gray-800/50 last:border-0"
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Example Queries */}
      <div className="space-y-2">
        <span className="text-xs text-gray-500 font-medium">{t('cypher.exampleQueries')}</span>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((example, idx) => (
            <button
              key={idx}
              onClick={() => runExample(example)}
              className="px-3 py-1.5 text-xs font-mono bg-gray-800 border border-gray-700 text-gray-400 rounded-lg hover:border-blue-500/50 hover:text-blue-300 transition-all"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Query Result */}
      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Table2 className="w-4 h-4" />
            <span>{t('cypher.title')}</span>
            <span className="text-gray-600">·</span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              {result.executionTime.toFixed(2)}ms
            </span>
            <span className="text-gray-600">·</span>
            <span className="text-xs text-gray-500">{result.rows.length} rows</span>
          </div>

          <div className="overflow-x-auto border border-gray-800 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/50">
                  {result.columns.map((col, idx) => (
                    <th key={idx} className="px-3 py-2 text-left text-xs font-medium text-gray-400 border-b border-gray-700">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 50).map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-gray-800/30 transition-colors">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="px-3 py-2 text-xs text-gray-300 border-b border-gray-800/50">
                        {typeof cell === 'object' && cell !== null ? (
                          <div className="space-y-1">
                            <span className="px-1.5 py-0.5 text-xs rounded bg-gray-700 text-gray-300">
                              {cell.label}
                            </span>
                            <div className="text-gray-400">
                              {cell.properties?.text?.substring(0, 60) || 
                               cell.properties?.name?.substring(0, 60) ||
                               cell.properties?.title?.substring(0, 60) ||
                               JSON.stringify(cell.properties).substring(0, 60)}...
                            </div>
                          </div>
                        ) : (
                          String(cell)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
