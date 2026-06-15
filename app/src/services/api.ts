// API 服务 - 连接后端 Neo4j
const API_BASE = 'http://localhost:8000';

async function get(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function post(path: string, body: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  // 统计
  stats: () => get('/stats'),

  // 问题列表
  questions: (skip = 0, limit = 50) => get(`/questions?skip=${skip}&limit=${limit}`),

  // 单个问题
  question: (qid: string) => get(`/questions/${qid}`),

  // 多跳路径
  hops: (qid: string) => get(`/questions/${qid}/hops`),

  // 搜索
  search: (query: string, limit = 20) => post('/search', { query, limit }),

  // 共享实体
  sharedEntities: (limit = 20) => get(`/shared-entities?limit=${limit}`),

  // 实体相关问题
  entityQuestions: (name: string) => get(`/entity/${encodeURIComponent(name)}/questions`),

  // Cypher 查询
  cypher: (query: string) => post('/cypher', { query }),

  // 子图数据
  graph: (qid: string) => get(`/graph/${qid}`),
};
