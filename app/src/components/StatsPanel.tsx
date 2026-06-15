import type { HotpotQuestion, GraphData } from '@/types/neo4j';
import { useI18n } from '@/i18n/I18nContext';
import { getGraphStatistics } from '@/utils/graphBuilder';
import { 
  Database, 
  GitBranch, 
  HelpCircle, 
  FileText, 
  Layers, 
  ArrowRightLeft, 
  TrendingUp,
  BarChart3
} from 'lucide-react';

interface Props {
  graphData: GraphData;
  questions: HotpotQuestion[];
}

export default function StatsPanel({ graphData, questions }: Props) {
  const { t } = useI18n();
  const stats = getGraphStatistics(graphData, questions);

  const statCards = [
    {
      label: t('stats.totalQuestions'),
      value: stats.totalQuestions,
      icon: <HelpCircle className="w-5 h-5" />,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20'
    },
    {
      label: t('stats.totalNodes'),
      value: stats.totalNodes.toLocaleString(),
      icon: <Database className="w-5 h-5" />,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20'
    },
    {
      label: t('stats.totalEdges'),
      value: stats.totalEdges.toLocaleString(),
      icon: <ArrowRightLeft className="w-5 h-5" />,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20'
    },
    {
      label: t('stats.avgHops'),
      value: stats.avgHopsPerQuestion,
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20'
    }
  ];

  const questionTypeData = Object.entries(stats.questionTypeCounts).map(([type, count]) => ({
    type,
    count,
    percentage: ((count as number) / stats.totalQuestions * 100).toFixed(1)
  }));

  const questionLevelData = Object.entries(stats.questionLevelCounts).map(([level, count]) => ({
    level,
    count,
    percentage: ((count as number) / stats.totalQuestions * 100).toFixed(1),
    color: level === 'easy' ? '#22c55e' : level === 'medium' ? '#eab308' : '#ef4444'
  }));

  const nodeTypeEntries = Object.entries(stats.nodeTypeCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number));

  const relationTypeEntries = Object.entries(stats.relationTypeCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number));

  const maxNodeCount = Math.max(...nodeTypeEntries.map(([, c]) => c as number));
  const maxRelCount = Math.max(...relationTypeEntries.map(([, c]) => c as number));

  return (
    <div className="space-y-6">
      {/* Main Stat Cards */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map((card, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-lg border ${card.border} ${card.bg}`}
          >
            <div className={`${card.color} mb-2`}>{card.icon}</div>
            <div className="text-2xl font-bold text-gray-100">{card.value}</div>
            <div className="text-xs text-gray-500 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Question Type Distribution */}
      <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-300">{t('stats.questionTypes')}</h3>
        </div>
        <div className="space-y-3">
          {questionTypeData.map(item => (
            <div key={item.type} className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400 capitalize">{item.type}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{item.count}</span>
                  <span className="text-xs text-gray-600">({item.percentage}%)</span>
                </div>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Difficulty Distribution */}
      <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-gray-300">{t('stats.difficultyDistribution')}</h3>
        </div>
        <div className="flex items-end gap-3 h-32">
          {questionLevelData.map(item => (
            <div key={item.level} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs text-gray-500">{item.percentage}%</span>
              <div
                className="w-full rounded-t-lg transition-all duration-500"
                style={{
                  height: `${parseFloat(item.percentage) * 1.2}%`,
                  minHeight: '4px',
                  backgroundColor: item.color
                }}
              />
              <span className="text-xs text-gray-400 capitalize">{item.level}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Node Type Distribution */}
      <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-gray-300">{t('stats.nodeTypes')}</h3>
        </div>
        <div className="space-y-2">
          {nodeTypeEntries.map(([type, count]) => (
            <div key={type} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-20 shrink-0">{type}</span>
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-500"
                  style={{ width: `${(count as number) / maxNodeCount * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-12 text-right">{(count as number).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Relation Type Distribution */}
      <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-gray-300">{t('stats.relationshipTypes')}</h3>
        </div>
        <div className="space-y-2">
          {relationTypeEntries.map(([type, count]) => (
            <div key={type} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-28 shrink-0">{type}</span>
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${(count as number) / maxRelCount * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-12 text-right">{(count as number).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
