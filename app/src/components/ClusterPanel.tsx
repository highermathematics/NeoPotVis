import { useState, useMemo } from 'react';
import type { HotpotQuestion } from '@/types/neo4j';
import { performClustering } from '@/utils/graphBuilder';
import { useI18n } from '@/i18n/I18nContext';
import { PieChart, BarChart3, FolderTree, ChevronRight, Users } from 'lucide-react';

interface Props {
  questions: HotpotQuestion[];
  onClusterSelect?: (nodeIds: string[]) => void;
}

type ClusterView = 'type' | 'level' | 'document';

export default function ClusterPanel({ questions, onClusterSelect }: Props) {
  const { t } = useI18n();
  const [activeView, setActiveView] = useState<ClusterView>('type');
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

  const { typeClusters, levelClusters, documentClusters } = useMemo(
    () => performClustering(questions),
    [questions]
  );

  const currentClusters = useMemo(() => {
    switch (activeView) {
      case 'type': return typeClusters;
      case 'level': return levelClusters;
      case 'document': return documentClusters;
    }
  }, [activeView, typeClusters, levelClusters, documentClusters]);

  const maxCount = useMemo(() => {
    return Math.max(...currentClusters.map(c => c.count));
  }, [currentClusters]);

  const toggleCluster = (clusterId: string) => {
    setExpandedCluster(expandedCluster === clusterId ? null : clusterId);
  };

  const selectClusterNodes = (cluster: typeof currentClusters[0]) => {
    const nodeIds = cluster.nodes.map(n => n.id);
    onClusterSelect?.(nodeIds);
  };

  const viewIcons = {
    type: <PieChart className="w-4 h-4" />,
    level: <BarChart3 className="w-4 h-4" />,
    document: <FolderTree className="w-4 h-4" />
  };

  const viewLabels = {
    type: t('cluster.byType'),
    level: t('cluster.byLevel'),
    document: t('cluster.byDocument')
  };

  return (
    <div className="space-y-4">
      {/* View Selector */}
      <div className="flex gap-2">
        {(Object.keys(viewLabels) as ClusterView[]).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-all ${
              activeView === view
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            {viewIcons[view]}
            {viewLabels[view]}
          </button>
        ))}
      </div>

      {/* Distribution Bar Chart */}
      <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">{t('cluster.distribution')}</h3>
        {currentClusters.map(cluster => (
          <div key={cluster.id} className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">{cluster.name}</span>
              <span className="text-xs text-gray-500">{cluster.count}</span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(cluster.count / maxCount) * 100}%`,
                  backgroundColor: cluster.color
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Cluster Detail Cards */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
        {currentClusters.map(cluster => (
          <div
            key={cluster.id}
            className={`rounded-lg border transition-all overflow-hidden ${
              expandedCluster === cluster.id
                ? 'border-blue-500/30 bg-blue-500/5'
                : 'border-gray-800 bg-gray-900/50'
            }`}
          >
            <button
              onClick={() => toggleCluster(cluster.id)}
              className="w-full p-3 flex items-center gap-3 text-left hover:bg-gray-800/30 transition-colors"
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: cluster.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-200">{cluster.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {cluster.count}
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 text-gray-500 transition-transform ${
                        expandedCluster === cluster.id ? 'rotate-90' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>
            </button>

            {expandedCluster === cluster.id && (
              <div className="px-3 pb-3">
                <button
                  onClick={() => selectClusterNodes(cluster)}
                  className="mb-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {t('cluster.highlightAll')}
                </button>
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                  {cluster.nodes.slice(0, 20).map((node, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-gray-800/50 rounded text-xs text-gray-400 truncate"
                    >
                      {node.properties.text || node.properties.name || node.properties.title || 'Untitled'}
                    </div>
                  ))}
                  {cluster.nodes.length > 20 && (
                    <div className="text-xs text-gray-600 text-center py-1">
                      {t('cluster.more', { count: cluster.nodes.length - 20 })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pie Chart Visualization */}
      <div className="flex justify-center p-4 bg-gray-900/50 rounded-lg border border-gray-800">
        <svg width="200" height="200" viewBox="0 0 200 200">
          {(() => {
            const total = currentClusters.reduce((sum, c) => sum + c.count, 0);
            let currentAngle = -90; // Start from top
            
            return currentClusters.map((cluster, idx) => {
              const sliceAngle = (cluster.count / total) * 360;
              const startAngle = currentAngle;
              const endAngle = currentAngle + sliceAngle;
              currentAngle = endAngle;
              
              const startRad = (startAngle * Math.PI) / 180;
              const endRad = (endAngle * Math.PI) / 180;
              
              const x1 = 100 + 80 * Math.cos(startRad);
              const y1 = 100 + 80 * Math.sin(startRad);
              const x2 = 100 + 80 * Math.cos(endRad);
              const y2 = 100 + 80 * Math.sin(endRad);
              
              const largeArcFlag = sliceAngle > 180 ? 1 : 0;
              
              const pathData = [
                `M 100 100`,
                `L ${x1} ${y1}`,
                `A 80 80 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                'Z'
              ].join(' ');
              
              return (
                <path
                  key={idx}
                  d={pathData}
                  fill={cluster.color}
                  stroke="#111827"
                  strokeWidth="2"
                  className="hover:opacity-80 transition-opacity cursor-pointer"
                  onClick={() => toggleCluster(cluster.id)}
                >
                  <title>{cluster.name}: {cluster.count} ({((cluster.count / total) * 100).toFixed(1)}%)</title>
                </path>
              );
            });
          })()}
          <circle cx="100" cy="100" r="40" fill="#111827" />
          <text x="100" y="95" textAnchor="middle" className="text-xs fill-gray-300 font-medium">
            {currentClusters.length}
          </text>
          <text x="100" y="110" textAnchor="middle" className="text-xs fill-gray-500">
            clusters
          </text>
        </svg>
      </div>
    </div>
  );
}
