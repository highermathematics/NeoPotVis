export type Language = 'zh' | 'en';

interface TranslationSet {
  [key: string]: string;
}

export const translations: Record<Language, TranslationSet> = {
  zh: {
    // Header
    'app.title': 'Neo4J HotpotQA 可视化',
    'app.subtitle': '多跳问答知识图谱可视化系统',
    'app.questionsLoaded': '个问题已加载',
    'app.nodes': '个节点',
    'app.edges': '条边',

    // Tabs
    'tab.graph': '图谱',
    'tab.multihop': '多跳查询',
    'tab.search': '搜索',
    'tab.cluster': '聚类',
    'tab.cypher': 'Cypher查询',
    'tab.stats': '统计',

    // Sidebar footer
    'sidebar.footer.graph': 'Neo4J 风格图数据库',
    'sidebar.footer.dataset': 'HotpotQA 数据集',

    // Graph tab
    'graph.filter': '筛选',
    'graph.legend.nodeTypes': '节点类型',
    'graph.legend.relationships': '关系类型',
    'graph.clearFilter': '清除筛选',
    'graph.nodeDetails': '节点详情',
    'graph.id': 'ID',
    'graph.label': '标签',
    'graph.properties': '属性',

    // Zoom controls
    'graph.zoomIn': '放大',
    'graph.zoomOut': '缩小',
    'graph.fit': '适应屏幕',
    'graph.reset': '重置布局',

    // Multi-hop tab
    'multihop.title': '多跳查询路径',
    'multihop.type': '类型',
    'multihop.level': '难度',
    'multihop.allTypes': '全部类型',
    'multihop.allLevels': '全部难度',
    'multihop.showing': '显示 {filtered} / {total} 条路径',
    'multihop.hops': '跳',
    'multihop.supportingSentences': '支撑句子',
    'multihop.searchPlaceholder': '搜索 Question ID 或问题内容...',
    'multihop.noResults': '未找到匹配的多跳路径',
    'multihop.trySearch': '尝试搜索',
    'multihop.answer': '答案',

    // Question types
    'type.bridge': '桥接',
    'type.comparison': '比较',
    'type.composition': '组合',

    // Difficulty levels
    'level.easy': '简单',
    'level.medium': '中等',
    'level.hard': '困难',

    // Search tab
    'search.title': '搜索与检索',
    'search.placeholder': '搜索问题、答案、文档、实体...',
    'search.found': '找到 {count} 个结果',
    'search.noResults': '未找到 "{query}" 的结果',
    'search.tryDifferent': '尝试不同的搜索词',
    'search.filters': '筛选',
    'search.clearAll': '清除全部',

    // Cluster tab
    'cluster.title': '聚类分析',
    'cluster.byType': '按问题类型',
    'cluster.byLevel': '按难度',
    'cluster.byDocument': '按文档',
    'cluster.distribution': '分布',
    'cluster.highlightAll': '在图谱中高亮显示 →',
    'cluster.more': '+{count} 更多',

    // Cypher tab
    'cypher.title': 'Cypher 查询控制台',
    'cypher.subtitle': 'Cypher 查询（模拟）',
    'cypher.execute': '执行',
    'cypher.history': '最近查询',
    'cypher.exampleQueries': '示例查询',
    'cypher.cmdEnter': '按 Cmd+Enter 执行',
    'cypher.invalid': '无效的查询语法。尝试：MATCH (n:Question) RETURN n LIMIT 10',

    // Stats tab
    'stats.title': '数据统计',
    'stats.totalQuestions': '总问题数',
    'stats.totalNodes': '总节点数',
    'stats.totalEdges': '总边数',
    'stats.avgHops': '平均跳数',
    'stats.questionTypes': '问题类型',
    'stats.difficultyDistribution': '难度分布',
    'stats.nodeTypes': '节点类型',
    'stats.relationshipTypes': '关系类型',

    // Language switcher
    'lang.zh': '中文',
    'lang.en': 'English',
    'lang.switch': '切换语言',

    // Loading
    'loading': '正在加载 Neo4J 图谱数据...',
  },

  en: {
    // Header
    'app.title': 'Neo4J HotpotQA Visualizer',
    'app.subtitle': 'Multi-Hop Question Answering Knowledge Graph',
    'app.questionsLoaded': 'questions loaded',
    'app.nodes': 'nodes',
    'app.edges': 'edges',

    // Tabs
    'tab.graph': 'Graph',
    'tab.multihop': 'Multi-Hop',
    'tab.search': 'Search',
    'tab.cluster': 'Cluster',
    'tab.cypher': 'Cypher',
    'tab.stats': 'Stats',

    // Sidebar footer
    'sidebar.footer.graph': 'Neo4J-style Graph DB',
    'sidebar.footer.dataset': 'HotpotQA Dataset',

    // Graph tab
    'graph.filter': 'Filter',
    'graph.legend.nodeTypes': 'Node Types',
    'graph.legend.relationships': 'Relationships',
    'graph.clearFilter': 'Clear Filter',
    'graph.nodeDetails': 'Node Details',
    'graph.id': 'ID',
    'graph.label': 'Label',
    'graph.properties': 'Properties',

    // Zoom controls
    'graph.zoomIn': 'Zoom In',
    'graph.zoomOut': 'Zoom Out',
    'graph.fit': 'Fit to Screen',
    'graph.reset': 'Reset Layout',

    // Multi-hop tab
    'multihop.title': 'Multi-Hop Query Paths',
    'multihop.type': 'Type',
    'multihop.level': 'Level',
    'multihop.allTypes': 'All Types',
    'multihop.allLevels': 'All Levels',
    'multihop.showing': 'Showing {filtered} / {total} paths',
    'multihop.hops': 'hop(s)',
    'multihop.supportingSentences': 'Supporting Sentences',
    'multihop.searchPlaceholder': 'Search Question ID or question text...',
    'multihop.noResults': 'No matching multi-hop paths found',
    'multihop.trySearch': 'Try searching',
    'multihop.answer': 'Answer',

    // Question types
    'type.bridge': 'Bridge',
    'type.comparison': 'Comparison',
    'type.composition': 'Composition',

    // Difficulty levels
    'level.easy': 'Easy',
    'level.medium': 'Medium',
    'level.hard': 'Hard',

    // Search tab
    'search.title': 'Search & Retrieval',
    'search.placeholder': 'Search questions, answers, documents, entities...',
    'search.found': 'Found {count} result(s)',
    'search.noResults': 'No results found for "{query}"',
    'search.tryDifferent': 'Try a different search term',
    'search.filters': 'Filters',
    'search.clearAll': 'Clear All',

    // Cluster tab
    'cluster.title': 'Cluster Analysis',
    'cluster.byType': 'By Question Type',
    'cluster.byLevel': 'By Difficulty',
    'cluster.byDocument': 'By Document',
    'cluster.distribution': 'Distribution',
    'cluster.highlightAll': 'Highlight all in graph →',
    'cluster.more': '+{count} more',

    // Cypher tab
    'cypher.title': 'Cypher Query Console',
    'cypher.subtitle': 'Cypher Query (Simulated)',
    'cypher.execute': 'Run',
    'cypher.history': 'Recent Queries',
    'cypher.exampleQueries': 'Example Queries',
    'cypher.cmdEnter': 'Press Cmd+Enter to execute',
    'cypher.invalid': 'Invalid query syntax. Try: MATCH (n:Question) RETURN n LIMIT 10',

    // Stats tab
    'stats.title': 'Statistics',
    'stats.totalQuestions': 'Total Questions',
    'stats.totalNodes': 'Total Nodes',
    'stats.totalEdges': 'Total Edges',
    'stats.avgHops': 'Avg Hops',
    'stats.questionTypes': 'Question Types',
    'stats.difficultyDistribution': 'Difficulty Distribution',
    'stats.nodeTypes': 'Node Types',
    'stats.relationshipTypes': 'Relationship Types',

    // Language switcher
    'lang.zh': '中文',
    'lang.en': 'English',
    'lang.switch': 'Switch Language',

    // Loading
    'loading': 'Loading Neo4J Graph Data...',
  }
};
