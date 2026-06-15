import { useEffect, useState, useCallback } from 'react';
import type { HotpotQuestion, GraphNode, GraphData } from '@/types/neo4j';
import { buildGraphFromHotpotQA } from '@/utils/graphBuilder';
import { useI18n } from '@/i18n/I18nContext';
import { api } from '@/services/api';
import GraphVisualization from '@/components/GraphVisualization';
import MultiHopPanel from '@/components/MultiHopPanel';
import SearchPanel from '@/components/SearchPanel';
import ClusterPanel from '@/components/ClusterPanel';
import CypherPanel from '@/components/CypherPanel';
import StatsPanel from '@/components/StatsPanel';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import {
  Database,
  GitBranch,
  Search,
  PieChart,
  Terminal,
  BarChart3,
  X,
  ChevronRight,
  Network,
  Loader2,
  AlertCircle
} from 'lucide-react';

type Tab = 'graph' | 'multihop' | 'search' | 'cluster' | 'cypher' | 'stats';

// 数据源切换：true=从Neo4j API, false=从本地JSON
const USE_API = true;

export default function App() {
  const { t } = useI18n();
  const [questions, setQuestions] = useState<HotpotQuestion[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('graph');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 从 Neo4j API 加载数据
  useEffect(() => {
    const loadFromApi = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. 获取统计信息
        const stats = await api.stats();
        eprint('Neo4j 统计:', stats);

        // 2. 获取问题列表
        const qs = await api.questions(0, 50);

        // 3. 转换为 HotpotQuestion 格式
        const formatted: HotpotQuestion[] = qs.map((q: any) => ({
          id: q.id,
          question: q.question,
          answer: q.answer,
          type: q.type,
          level: q.level,
          supporting_facts: { title: [], sent_id: [] },
          context: { title: [], sentences: [] }
        }));

        setQuestions(formatted);

        // 4. 获取每个问题的子图数据
        const allNodes: any[] = [];
        const allEdges: any[] = [];

        for (const q of formatted.slice(0, 30)) {
          try {
            const g = await api.graph(q.id);
            if (g.nodes) {
              for (const n of g.nodes) {
                if (!allNodes.find(x => x.id === n.id)) {
                  allNodes.push({
                    id: n.id,
                    label: n.label,
                    properties: n.n || {}
                  });
                }
              }
            }
            if (g.edges) {
              for (const e of g.edges) {
                if (e.source && e.target) {
                  allEdges.push({
                    id: `${e.source}-${e.type}-${e.target}`,
                    source: e.source,
                    target: e.target,
                    type: e.type,
                    properties: e.e || {}
                  });
                }
              }
            }
          } catch (e) {
            // 单个问题失败不影响整体
          }
        }

        setGraphData({ nodes: allNodes, edges: allEdges });

      } catch (err: any) {
        console.error('API 加载失败:', err);
        setError(err.message || '连接 Neo4j 后端失败');
        // 回退到本地 JSON
        await loadFromLocal();
      } finally {
        setLoading(false);
      }
    };

    const loadFromLocal = async () => {
      try {
        const response = await fetch('/data/validation.json');
        const data: HotpotQuestion[] = await response.json();
        const limitedData = data.slice(0, 30);
        setQuestions(limitedData);
        const graph = buildGraphFromHotpotQA(limitedData);
        setGraphData(graph);
      } catch (error) {
        console.error('本地加载也失败:', error);
        setError('无法连接到 Neo4j 后端，且本地数据也无法加载');
      }
    };

    if (USE_API) {
      loadFromApi();
    } else {
      loadFromLocal().then(() => setLoading(false));
    }
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, []);

  const handleNodeHighlight = useCallback((nodeIds: string[]) => {
    setHighlightedNodes(nodeIds);
    setActiveTab('graph');
  }, []);

  const handleClusterSelect = useCallback((nodeIds: string[]) => {
    setHighlightedNodes(nodeIds);
    setActiveTab('graph');
  }, []);

  const handleQueryResult = useCallback((nodeIds: string[]) => {
    setHighlightedNodes(nodeIds);
  }, []);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'graph', label: t('tab.graph'), icon: <Network className="w-4 h-4" /> },
    { id: 'multihop', label: t('tab.multihop'), icon: <GitBranch className="w-4 h-4" /> },
    { id: 'search', label: t('tab.search'), icon: <Search className="w-4 h-4" /> },
    { id: 'cluster', label: t('tab.cluster'), icon: <PieChart className="w-4 h-4" /> },
    { id: 'cypher', label: t('tab.cypher'), icon: <Terminal className="w-4 h-4" /> },
    { id: 'stats', label: t('tab.stats'), icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <p className="text-sm">{USE_API ? t('loading') + ' (Neo4j API)' : t('loading')}</p>
        </div>
      );
    }

    if (error && questions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-red-400">
          <AlertCircle className="w-10 h-10 mb-3" />
          <p className="text-lg font-medium">{t('loading')} 失败</p>
          <p className="text-sm text-gray-500 mt-2 max-w-md text-center">{error}</p>
          <p className="text-xs text-gray-600 mt-4">
            请确保后端服务已启动: <code className="bg-gray-800 px-2 py-1 rounded">uvicorn main:app --port 8000</code>
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case 'graph':
        return (
          <div className="h-full flex">
            <div className="flex-1">
              <GraphVisualization
                graphData={graphData}
                highlightedNodes={highlightedNodes}
                onNodeClick={handleNodeClick}
              />
            </div>
            {selectedNode && (
              <div className="w-80 border-l border-gray-800 bg-gray-900/95 p-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-300">{t('graph.nodeDetails')}</h3>
                  <button onClick={() => setSelectedNode(null)} className="p-1 hover:bg-gray-800 rounded transition-colors">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider">{t('graph.id')}</span>
                    <p className="text-sm text-gray-300 font-mono break-all">{selectedNode.id}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider">{t('graph.label')}</span>
                    <span className="ml-2 px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-300">{selectedNode.label}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider">{t('graph.properties')}</span>
                    <div className="mt-2 space-y-2">
                      {Object.entries(selectedNode.properties).map(([key, value]) => (
                        <div key={key} className="p-2 bg-gray-800/50 rounded">
                          <span className="text-xs text-gray-500">{key}</span>
                          <p className="text-sm text-gray-300 break-all">{typeof value === 'string' ? value : JSON.stringify(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'multihop':
        return (
          <div className="p-4 overflow-y-auto h-full">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">{t('multihop.title')}</h2>
              <MultiHopPanel questions={questions} onQuestionSelect={(id) => setHighlightedNodes([`question_${id}`])} />
            </div>
          </div>
        );

      case 'search':
        return (
          <div className="p-4 overflow-y-auto h-full">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">{t('search.title')}</h2>
              <SearchPanel graphData={graphData} onNodeHighlight={handleNodeHighlight} onNodeSelect={handleNodeClick} />
            </div>
          </div>
        );

      case 'cluster':
        return (
          <div className="p-4 overflow-y-auto h-full">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">{t('cluster.title')}</h2>
              <ClusterPanel questions={questions} onClusterSelect={handleClusterSelect} />
            </div>
          </div>
        );

      case 'cypher':
        return (
          <div className="p-4 overflow-y-auto h-full">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">{t('cypher.title')}</h2>
              <CypherPanel graphData={graphData} onQueryResult={handleQueryResult} />
            </div>
          </div>
        );

      case 'stats':
        return (
          <div className="p-4 overflow-y-auto h-full">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">{t('stats.title')}</h2>
              <StatsPanel graphData={graphData} questions={questions} />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-screen bg-gray-950 text-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-gray-800 bg-gray-900/50 flex items-center px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-sm font-bold text-gray-100 leading-tight">{t('app.title')}</h1>
            <p className="text-xs text-gray-500">
              {USE_API ? 'Neo4j API Mode' : t('app.subtitle')}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {questions.length} {t('app.questionsLoaded')}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            {graphData.nodes.length.toLocaleString()} {t('app.nodes')}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            {graphData.edges.length.toLocaleString()} {t('app.edges')}
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <nav className={`shrink-0 bg-gray-900/80 border-r border-gray-800 flex flex-col transition-all duration-200 ${sidebarOpen ? 'w-48' : 'w-12'}`}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-3 hover:bg-gray-800/50 transition-colors self-end">
            <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
          </button>

          <div className="flex-1 px-2 space-y-1">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${activeTab === tab.id ? 'bg-blue-600/20 text-blue-300' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-300'}`}>
                {tab.icon}
                {sidebarOpen && <span>{tab.label}</span>}
              </button>
            ))}
          </div>

          {sidebarOpen && (
            <div className="p-3 border-t border-gray-800 text-xs text-gray-600">
              <p>{t('sidebar.footer.graph')}</p>
              <p>{USE_API ? 'Neo4j API Backend' : t('sidebar.footer.dataset')}</p>
            </div>
          )}
        </nav>

        {/* Content Area */}
        <main className="flex-1 overflow-hidden">{renderContent()}</main>
      </div>
    </div>
  );
}

function eprint(...args: any[]) {
  // eslint-disable-next-line no-console
  console.log(...args);
}
