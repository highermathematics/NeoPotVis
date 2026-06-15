import { useEffect, useRef, useCallback, useState } from 'react';
import cytoscape from 'cytoscape';
import type { GraphData, GraphNode } from '@/types/neo4j';
import { useI18n } from '@/i18n/I18nContext';
import { ZoomIn, ZoomOut, Maximize, RotateCcw, Filter } from 'lucide-react';

interface Props {
  graphData: GraphData;
  highlightedNodes?: string[];
  onNodeClick?: (node: GraphNode) => void;
  filterLabel?: string | null;
}

const getNodeColor = (label: string): string => {
  switch (label) {
    case 'Question': return '#3b82f6';
    case 'Answer': return '#10b981';
    case 'Document': return '#f59e0b';
    case 'Entity': return '#8b5cf6';
    case 'Sentence': return '#6b7280';
    default: return '#9ca3af';
  }
};

const getNodeSize = (label: string): number => {
  switch (label) {
    case 'Question': return 40;
    case 'Answer': return 35;
    case 'Document': return 30;
    case 'Entity': return 20;
    case 'Sentence': return 8;
    default: return 15;
  }
};

const getEdgeColor = (type: string): string => {
  switch (type) {
    case 'HAS_ANSWER': return '#10b981';
    case 'HAS_SUPPORTING_FACT': return '#ef4444';
    case 'CONTAINS': return '#6b7280';
    case 'MENTIONS': return '#8b5cf6';
    case 'BRIDGE_BETWEEN': return '#f97316';
    case 'RELATED_TO': return '#3b82f6';
    default: return '#d1d5db';
  }
};

export default function GraphVisualization({ graphData, highlightedNodes, onNodeClick, filterLabel }: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | null>(filterLabel || null);

  // Extract unique labels
  useEffect(() => {
    const uniqueLabels = [...new Set(graphData.nodes.map(n => n.label))];
    setLabels(uniqueLabels);
  }, [graphData]);

  const initCy = useCallback(() => {
    if (!containerRef.current || graphData.nodes.length === 0) return;

    // Filter nodes if activeFilter is set
    let filteredNodes = graphData.nodes;
    let filteredEdges = graphData.edges;
    
    if (activeFilter) {
      filteredNodes = graphData.nodes.filter(n => n.label === activeFilter);
      const nodeIds = new Set(filteredNodes.map(n => n.id));
      filteredEdges = graphData.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    }

    const cyElements: any[] = [
      ...filteredNodes.map(node => ({
        data: {
          id: node.id,
          label: node.label,
          ...node.properties,
          color: getNodeColor(node.label),
          size: getNodeSize(node.label),
          isHighlighted: highlightedNodes?.includes(node.id) || false
        }
      })),
      ...filteredEdges.map(edge => ({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          relation: edge.type,
          ...edge.properties,
          color: getEdgeColor(edge.type)
        }
      }))
    ];

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: cyElements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'width': 'data(size)',
            'height': 'data(size)',
            'label': (ele: any) => {
              const label = ele.data('label');
              if (label === 'Question') return ele.data('text')?.substring(0, 30) || label;
              if (label === 'Answer') return ele.data('text')?.substring(0, 30) || label;
              if (label === 'Document') return ele.data('title')?.substring(0, 30) || label;
              if (label === 'Entity') return ele.data('name')?.substring(0, 20) || label;
              return '';
            },
            'font-size': '10px',
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            'color': '#e5e7eb',
            'border-width': 2,
            'border-color': '#1f2937',
            'transition-property': 'background-color, border-width, width, height',
            'transition-duration': 300
          }
        },
        {
          selector: 'node[?isHighlighted]',
          style: {
            'border-width': 4,
            'border-color': '#fbbf24',
            'width': (ele: any) => (ele.data('size') as number) * 1.2,
            'height': (ele: any) => (ele.data('size') as number) * 1.2
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8,
            'opacity': 0.7,
            'label': (ele: any) => {
              const rel = ele.data('relation');
              return rel && rel.length < 15 ? rel : '';
            },
            'font-size': '8px',
            'color': '#9ca3af'
          }
        },
        {
          selector: 'edge[relation = "HAS_SUPPORTING_FACT"]',
          style: {
            'width': 3,
            'line-style': 'solid'
          }
        },
        {
          selector: 'edge[relation = "BRIDGE_BETWEEN"]',
          style: {
            'width': 2.5,
            'line-style': 'dashed'
          }
        }
      ],
      layout: {
        name: 'cose',
        padding: 20,
        nodeRepulsion: 8000,
        idealEdgeLength: 100,
        animate: true,
        animationDuration: 500,
        randomize: false,
        componentSpacing: 100,
        nodeOverlap: 20,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
      } as any,
      minZoom: 0.1,
      maxZoom: 3
    });

    // Event handlers
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = filteredNodes.find(n => n.id === node.id());
      if (nodeData && onNodeClick) {
        onNodeClick(nodeData);
      }
    });

    cy.on('mouseover', 'node', (evt) => {
      evt.target.animate({
        style: {
          'border-width': 4,
          'border-color': '#fbbf24'
        }
      }, { duration: 150 });
    });

    cy.on('mouseout', 'node', (evt) => {
      const isHighlighted = evt.target.data('isHighlighted');
      evt.target.animate({
        style: {
          'border-width': isHighlighted ? 4 : 2,
          'border-color': isHighlighted ? '#fbbf24' : '#1f2937'
        }
      }, { duration: 150 });
    });

    cyRef.current = cy;
  }, [graphData, highlightedNodes, onNodeClick, activeFilter]);

  useEffect(() => {
    initCy();
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [initCy]);

  const handleZoomIn = () => {
    cyRef.current?.zoom(cyRef.current.zoom() * 1.2);
  };

  const handleZoomOut = () => {
    cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  };

  const handleFit = () => {
    cyRef.current?.fit(undefined, 50);
  };

  const handleReset = () => {
    initCy();
  };

  const toggleFilter = (label: string) => {
    setActiveFilter(prev => prev === label ? null : label);
  };

  return (
    <div className="relative w-full h-full bg-gray-950 rounded-lg overflow-hidden">
      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        <div className="flex gap-1">
          <button
            onClick={handleZoomIn}
            className="p-2 bg-gray-800/90 hover:bg-gray-700 text-white rounded-lg backdrop-blur-sm transition-colors"
            title={t('graph.zoomIn')}
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 bg-gray-800/90 hover:bg-gray-700 text-white rounded-lg backdrop-blur-sm transition-colors"
            title={t('graph.zoomOut')}
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={handleFit}
            className="p-2 bg-gray-800/90 hover:bg-gray-700 text-white rounded-lg backdrop-blur-sm transition-colors"
            title={t('graph.fit')}
          >
            <Maximize size={16} />
          </button>
          <button
            onClick={handleReset}
            className="p-2 bg-gray-800/90 hover:bg-gray-700 text-white rounded-lg backdrop-blur-sm transition-colors"
            title={t('graph.reset')}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="absolute top-3 right-3 z-10">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 px-2 py-1 bg-gray-800/90 rounded-lg backdrop-blur-sm">
            <Filter size={14} className="text-gray-400" />
            <span className="text-xs text-gray-300">{t('graph.filter')}</span>
          </div>
          {labels.map(label => (
            <button
              key={label}
              onClick={() => toggleFilter(label)}
              className={`px-3 py-1.5 text-xs rounded-lg backdrop-blur-sm transition-all flex items-center gap-2 ${
                activeFilter === label
                  ? 'bg-blue-600/90 text-white'
                  : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getNodeColor(label) }}
              />
              {label}
            </button>
          ))}
          {activeFilter && (
            <button
              onClick={() => setActiveFilter(null)}
              className="px-3 py-1.5 text-xs bg-red-600/90 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              {t('graph.clearFilter')}
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-gray-800/90 backdrop-blur-sm rounded-lg p-3">
        <h4 className="text-xs font-semibold text-gray-300 mb-2">{t('graph.legend.nodeTypes')}</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {labels.map(label => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getNodeColor(label) }}
              />
              <span className="text-xs text-gray-400">{label}</span>
            </div>
          ))}
        </div>
        <h4 className="text-xs font-semibold text-gray-300 mt-3 mb-2">{t('graph.legend.relationships')}</h4>
        <div className="space-y-1">
          {['HAS_ANSWER', 'HAS_SUPPORTING_FACT', 'CONTAINS', 'MENTIONS', 'BRIDGE_BETWEEN', 'RELATED_TO'].map(rel => (
            <div key={rel} className="flex items-center gap-2">
              <span
                className="w-4 h-0.5"
                style={{ backgroundColor: getEdgeColor(rel) }}
              />
              <span className="text-xs text-gray-400">{rel}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cytoscape Container */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ minHeight: '500px' }}
      />
    </div>
  );
}
