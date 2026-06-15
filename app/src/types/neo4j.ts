// Neo4J-style Graph Types for HotpotQA

export type NodeLabel = 'Question' | 'Answer' | 'Document' | 'Entity' | 'Sentence';

export type RelationType = 
  | 'HAS_ANSWER' 
  | 'HAS_SUPPORTING_FACT' 
  | 'CONTAINS' 
  | 'MENTIONS' 
  | 'RELATED_TO'
  | 'BRIDGE_BETWEEN';

export interface GraphNode {
  id: string;
  label: NodeLabel;
  properties: Record<string, any>;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  properties?: Record<string, any>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// HotpotQA Data Types
export interface HotpotQuestion {
  id: string;
  question: string;
  answer: string;
  type: 'bridge' | 'comparison' | 'composition';
  level: 'easy' | 'medium' | 'hard';
  supporting_facts: {
    title: string[];
    sent_id: number[];
  };
  context: {
    title: string[];
    sentences: string[][];
  };
}

// Query Types
export interface QueryPath {
  questionId: string;
  question: string;
  answer: string;
  hops: HopStep[];
  type: string;
  level: string;
}

export interface HopStep {
  hop: number;
  from: string;
  to: string;
  relation: string;
  documents: string[];
  sentences: string[];
}

// Cluster Types
export interface ClusterGroup {
  id: string;
  name: string;
  count: number;
  nodes: GraphNode[];
  color: string;
}

// Search Result
export interface SearchResult {
  node: GraphNode;
  matchedProperty: string;
  matchedText: string;
  score: number;
}

// Cypher Query Simulation
export interface CypherQueryResult {
  columns: string[];
  rows: any[][];
  executionTime: number;
  graphData?: GraphData;
}
