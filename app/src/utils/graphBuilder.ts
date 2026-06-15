import type { HotpotQuestion, GraphNode, GraphEdge, GraphData, QueryPath, HopStep, ClusterGroup } from '@/types/neo4j';

let edgeIdCounter = 0;

const generateEdgeId = (): string => {
  return `rel_${edgeIdCounter++}`;
};

// Extract key entities from document titles
const extractEntities = (title: string): string[] => {
  const entities: string[] = [];
  
  // Add the full title as an entity
  entities.push(title);
  
  return [...new Set(entities)];
};

// Build a complete Neo4J-style graph from HotpotQA data
export const buildGraphFromHotpotQA = (questions: HotpotQuestion[]): GraphData => {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  
  const nodeMap = new Map<string, GraphNode>();
  const edgeSet = new Set<string>();
  
  const getOrCreateNode = (id: string, label: GraphNode['label'], properties: Record<string, any>): GraphNode => {
    if (nodeMap.has(id)) {
      const existing = nodeMap.get(id)!;
      existing.properties = { ...existing.properties, ...properties };
      return existing;
    }
    const node: GraphNode = { id, label, properties };
    nodeMap.set(id, node);
    nodes.push(node);
    return node;
  };
  
  const addEdge = (source: string, target: string, type: GraphEdge['type'], properties?: Record<string, any>) => {
    const edgeKey = `${source}-${type}-${target}`;
    if (edgeSet.has(edgeKey)) return;
    edgeSet.add(edgeKey);
    edges.push({
      id: generateEdgeId(),
      source,
      target,
      type,
      properties
    });
  };
  
  questions.forEach((q, qIndex) => {
    // 1. Create Question node
    const questionId = `question_${q.id}`;
    getOrCreateNode(questionId, 'Question', {
      text: q.question,
      type: q.type,
      level: q.level,
      originalId: q.id,
      index: qIndex
    });
    
    // 2. Create Answer node
    const answerId = `answer_${q.id}`;
    getOrCreateNode(answerId, 'Answer', {
      text: q.answer,
      questionId: q.id
    });
    
    // 3. Link Question → Answer
    addEdge(questionId, answerId, 'HAS_ANSWER', { confidence: 1.0 });
    
    // 4. Create Document nodes and link to Question
    const docIdMap = new Map<string, string>();
    q.context.title.forEach((title, docIdx) => {
      const docId = `doc_${q.id}_${docIdx}`;
      docIdMap.set(title, docId);
      getOrCreateNode(docId, 'Document', {
        title,
        questionId: q.id,
        index: docIdx,
        sentenceCount: q.context.sentences[docIdx]?.length || 0
      });
      
      // Link Question → Document (if it's a supporting fact)
      const isSupportingFact = q.supporting_facts.title.includes(title);
      if (isSupportingFact) {
        const sentIds = q.supporting_facts.sent_id.filter((_, i) => 
          q.supporting_facts.title[i] === title
        );
        addEdge(questionId, docId, 'HAS_SUPPORTING_FACT', { 
          sentenceIds: sentIds,
          isPrimary: true
        });
      } else {
        addEdge(questionId, docId, 'RELATED_TO', { 
          isContext: true
        });
      }
      
      // 5. Create Sentence nodes
      const sentences = q.context.sentences[docIdx] || [];
      sentences.forEach((sentence, sentIdx) => {
        const sentId = `sent_${q.id}_${docIdx}_${sentIdx}`;
        getOrCreateNode(sentId, 'Sentence', {
          text: sentence.trim(),
          docTitle: title,
          questionId: q.id,
          sentenceIndex: sentIdx,
          isSupportingFact: isSupportingFact && q.supporting_facts.sent_id.includes(sentIdx)
        });
        
        // Link Document → Sentence
        addEdge(docId, sentId, 'CONTAINS', { index: sentIdx });
        
        // Link Question → Sentence (if supporting fact)
        if (isSupportingFact && q.supporting_facts.sent_id.includes(sentIdx)) {
          addEdge(questionId, sentId, 'HAS_SUPPORTING_FACT', { 
            hop: q.supporting_facts.title.indexOf(title) + 1
          });
        }
      });
      
      // 6. Extract and create Entity nodes
      const entities = extractEntities(title);
      entities.forEach((entityName, entIdx) => {
        const entityId = `entity_${q.id}_${docIdx}_${entIdx}`;
        getOrCreateNode(entityId, 'Entity', {
          name: entityName,
          questionId: q.id,
          sourceDoc: title
        });
        
        // Link Document → Entity
        addEdge(docId, entityId, 'MENTIONS', { type: 'title_entity' });
        
        // Link Sentences → Entity
        sentences.forEach((sentence, sentIdx) => {
          if (sentence.toLowerCase().includes(entityName.toLowerCase())) {
            const sentId = `sent_${q.id}_${docIdx}_${sentIdx}`;
            addEdge(sentId, entityId, 'MENTIONS', { type: 'text_mention' });
          }
        });
      });
    });
    
    // 7. Create BRIDGE_BETWEEN relationships for multi-hop questions
    if (q.type === 'bridge' && q.supporting_facts.title.length >= 2) {
      const sfTitles = [...new Set(q.supporting_facts.title)];
      for (let i = 0; i < sfTitles.length - 1; i++) {
        const fromDocId = docIdMap.get(sfTitles[i]);
        const toDocId = docIdMap.get(sfTitles[i + 1]);
        if (fromDocId && toDocId) {
          addEdge(fromDocId, toDocId, 'BRIDGE_BETWEEN', { 
            hop: i + 1,
            questionId: q.id
          });
        }
      }
    }
    
    // 8. For comparison questions, link the compared entities
    if (q.type === 'comparison' && q.supporting_facts.title.length >= 2) {
      const sfTitles = [...new Set(q.supporting_facts.title)];
      for (let i = 0; i < sfTitles.length - 1; i++) {
        const fromDocId = docIdMap.get(sfTitles[i]);
        const toDocId = docIdMap.get(sfTitles[i + 1]);
        if (fromDocId && toDocId) {
          addEdge(fromDocId, toDocId, 'RELATED_TO', { 
            relationType: 'compared_with',
            questionId: q.id
          });
        }
      }
    }
  });
  
  return { nodes, edges };
};

// Build multi-hop query paths
export const buildQueryPaths = (questions: HotpotQuestion[]): QueryPath[] => {
  return questions.map(q => {
    const hops: HopStep[] = [];
    const uniqueTitles = [...new Set(q.supporting_facts.title)];
    
    uniqueTitles.forEach((title, idx) => {
      const sentIds = q.supporting_facts.sent_id.filter((_, i) => 
        q.supporting_facts.title[i] === title
      );
      
      const docIdx = q.context.title.indexOf(title);
      const sentences = docIdx >= 0 ? sentIds.map(sid => q.context.sentences[docIdx]?.[sid]).filter(Boolean) : [];
      
      const prevTitle = idx > 0 ? uniqueTitles[idx - 1] : q.question;
      
      hops.push({
        hop: idx + 1,
        from: prevTitle,
        to: title,
        relation: idx === 0 ? 'INITIAL_RETRIEVAL' : 'BRIDGE',
        documents: [title],
        sentences
      });
    });
    
    // Final hop to answer
    hops.push({
      hop: uniqueTitles.length + 1,
      from: uniqueTitles[uniqueTitles.length - 1] || q.question,
      to: q.answer,
      relation: 'ANSWER_INFERENCE',
      documents: uniqueTitles,
      sentences: []
    });
    
    return {
      questionId: q.id,
      question: q.question,
      answer: q.answer,
      hops,
      type: q.type,
      level: q.level
    };
  });
};

// Cluster analysis
export const performClustering = (
  questions: HotpotQuestion[]
): { typeClusters: ClusterGroup[]; levelClusters: ClusterGroup[]; documentClusters: ClusterGroup[] } => {
  const colors = {
    bridge: '#3b82f6',
    comparison: '#10b981',
    composition: '#f59e0b',
    easy: '#22c55e',
    medium: '#eab308',
    hard: '#ef4444'
  };
  
  // 1. Cluster by question type
  const typeMap = new Map<string, { name: string; color: string; questions: HotpotQuestion[] }>();
  
  questions.forEach(q => {
    if (!typeMap.has(q.type)) {
      typeMap.set(q.type, { 
        name: q.type.charAt(0).toUpperCase() + q.type.slice(1),
        color: colors[q.type] || '#6b7280',
        questions: []
      });
    }
    typeMap.get(q.type)!.questions.push(q);
  });
  
  const typeClusters: ClusterGroup[] = Array.from(typeMap.entries()).map(([, val], idx) => ({
    id: `cluster_type_${idx}`,
    name: val.name,
    count: val.questions.length,
    color: val.color,
    nodes: val.questions.map(q => ({
      id: `question_${q.id}`,
      label: 'Question' as const,
      properties: { text: q.question, type: q.type, level: q.level }
    }))
  }));
  
  // 2. Cluster by difficulty level
  const levelMap = new Map<string, { name: string; color: string; questions: HotpotQuestion[] }>();
  
  questions.forEach(q => {
    if (!levelMap.has(q.level)) {
      levelMap.set(q.level, { 
        name: q.level.charAt(0).toUpperCase() + q.level.slice(1),
        color: colors[q.level] || '#6b7280',
        questions: []
      });
    }
    levelMap.get(q.level)!.questions.push(q);
  });
  
  const levelClusters: ClusterGroup[] = Array.from(levelMap.entries()).map(([, val], idx) => ({
    id: `cluster_level_${idx}`,
    name: val.name,
    count: val.questions.length,
    color: val.color,
    nodes: val.questions.map(q => ({
      id: `question_${q.id}`,
      label: 'Question' as const,
      properties: { text: q.question, type: q.type, level: q.level }
    }))
  }));
  
  // 3. Cluster by most referenced documents
  const docCount = new Map<string, number>();
  questions.forEach(q => {
    q.context.title.forEach(title => {
      docCount.set(title, (docCount.get(title) || 0) + 1);
    });
  });
  
  const sortedDocs = Array.from(docCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const docClusters: ClusterGroup[] = sortedDocs.map(([doc, count], idx) => {
    const relatedQuestions = questions.filter(q => q.context.title.includes(doc));
    const hue = (idx * 36) % 360;
    return {
      id: `cluster_doc_${idx}`,
      name: doc.length > 30 ? doc.substring(0, 30) + '...' : doc,
      count,
      color: `hsl(${hue}, 70%, 50%)`,
      nodes: relatedQuestions.map(q => ({
        id: `question_${q.id}`,
        label: 'Question' as const,
        properties: { text: q.question, type: q.type, level: q.level }
      }))
    };
  });
  
  return { typeClusters, levelClusters, documentClusters: docClusters };
};

// Search functionality
export const searchGraph = (
  graphData: GraphData,
  query: string,
  nodeTypes?: string[]
): any[] => {
  if (!query.trim()) return [];
  
  const lowerQuery = query.toLowerCase().trim();
  const results: any[] = [];
  const seen = new Set<string>();
  
  graphData.nodes.forEach(node => {
    // Filter by node type if specified
    if (nodeTypes && nodeTypes.length > 0 && !nodeTypes.includes(node.label)) {
      return;
    }
    
    // Search in all text properties
    Object.entries(node.properties).forEach(([key, value]) => {
      if (typeof value === 'string' && value.toLowerCase().includes(lowerQuery)) {
        const resultId = `${node.id}-${key}`;
        if (!seen.has(resultId)) {
          seen.add(resultId);
          results.push({
            node,
            property: key,
            value: value,
            matchIndex: value.toLowerCase().indexOf(lowerQuery)
          });
        }
      }
    });
  });
  
  // Sort by relevance (exact matches first)
  return results.sort((a, b) => {
    const aExact = a.value.toLowerCase() === lowerQuery;
    const bExact = b.value.toLowerCase() === lowerQuery;
    if (aExact && !bExact) return -1;
    if (bExact && !aExact) return 1;
    return a.matchIndex - b.matchIndex;
  });
};

// Simulate Cypher query execution
export const executeCypherQuery = (
  graphData: GraphData,
  query: string
): { columns: string[]; rows: any[][]; executionTime: number } | null => {
  const startTime = performance.now();
  
  // Parse simple MATCH queries
  const matchPattern = /MATCH\s+\((\w+):?(\w+)?\)\s*(?:WHERE\s+(.+?))?\s*(?:RETURN\s+(.+?))?\s*(?:LIMIT\s+(\d+))?/i;
  const match = query.match(matchPattern);
  
  if (!match) return null;
  
  const [, , nodeLabel, whereClause, returnClause, limitStr] = match;
  
  let filteredNodes = graphData.nodes;
  
  // Filter by label
  if (nodeLabel) {
    filteredNodes = filteredNodes.filter(n => 
      n.label.toLowerCase() === nodeLabel.toLowerCase()
    );
  }
  
  // Apply WHERE clause (simple property filtering)
  if (whereClause) {
    const wherePattern = /(\w+)\.?(\w+)?\s*(=|CONTAINS)\s*['"](.+)['"]/i;
    const whereMatch = whereClause.match(wherePattern);
    if (whereMatch) {
      const [, , propName, operator, propValue] = whereMatch;
      filteredNodes = filteredNodes.filter(n => {
        const val = n.properties[propName];
        if (!val) return false;
        const valStr = String(val).toLowerCase();
        const compareStr = propValue.toLowerCase();
        if (operator === '=') return valStr === compareStr;
        if (operator === 'CONTAINS') return valStr.includes(compareStr);
        return false;
      });
    }
  }
  
  // Apply LIMIT
  const limit = limitStr ? parseInt(limitStr) : Infinity;
  filteredNodes = filteredNodes.slice(0, limit);
  
  // Build result
  const columns = returnClause ? 
    returnClause.split(',').map(c => c.trim()) : 
    ['node'];
  
  const rows = filteredNodes.map(node => {
    if (!returnClause || returnClause.includes('node')) {
      return [node];
    }
    return columns.map(col => {
      if (col.includes('.')) {
        const [, prop] = col.split('.');
        return node.properties[prop] || null;
      }
      return node.properties[col] || null;
    });
  });
  
  const executionTime = performance.now() - startTime;
  
  return { columns, rows, executionTime };
};

// Get statistics
export const getGraphStatistics = (graphData: GraphData, questions: HotpotQuestion[]) => {
  const totalNodes = graphData.nodes.length;
  const totalEdges = graphData.edges.length;
  
  const nodeTypeCounts: Record<string, number> = {};
  graphData.nodes.forEach(n => {
    nodeTypeCounts[n.label] = (nodeTypeCounts[n.label] || 0) + 1;
  });
  
  const relationTypeCounts: Record<string, number> = {};
  graphData.edges.forEach(e => {
    relationTypeCounts[e.type] = (relationTypeCounts[e.type] || 0) + 1;
  });
  
  const questionTypeCounts: Record<string, number> = {};
  const questionLevelCounts: Record<string, number> = {};
  questions.forEach(q => {
    questionTypeCounts[q.type] = (questionTypeCounts[q.type] || 0) + 1;
    questionLevelCounts[q.level] = (questionLevelCounts[q.level] || 0) + 1;
  });
  
  const avgHops = questions.reduce((sum, q) => {
    return sum + new Set(q.supporting_facts.title).size;
  }, 0) / questions.length;
  
  return {
    totalNodes,
    totalEdges,
    nodeTypeCounts,
    relationTypeCounts,
    questionTypeCounts,
    questionLevelCounts,
    totalQuestions: questions.length,
    avgHopsPerQuestion: avgHops.toFixed(2)
  };
};
