#!/usr/bin/env python3
"""
Neo4j HotpotQA 后端 API - FastAPI
提供真正的 Neo4j 数据库查询接口

用法:
    pip install fastapi uvicorn neo4j
    uvicorn main:app --reload --port 8000
"""

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase
from pydantic import BaseModel

# Neo4j 配置（从环境变量读取，或默认值）
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "12345678")
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")

# 全局 driver
driver = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global driver
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    # 验证连接
    with driver.session(database=NEO4J_DATABASE) as s:
        s.run("RETURN 1")
    print(f"Neo4j 连接成功: {NEO4J_URI}")
    yield
    driver.close()
    print("Neo4j 连接已关闭")


app = FastAPI(title="Neo4j HotpotQA API", lifespan=lifespan)

# 允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def query(cypher: str, params: dict = None) -> list[dict]:
    """执行 Cypher 查询并返回结果"""
    with driver.session(database=NEO4J_DATABASE) as s:
        result = s.run(cypher, params or {})
        return [dict(record) for record in result]


# ============ 接口定义 ============

class SearchRequest(BaseModel):
    query: str
    limit: int = 20


class CypherRequest(BaseModel):
    query: str


# ============ API 路由 ============

@app.get("/")
def root():
    return {"message": "Neo4j HotpotQA API", "neo4j_uri": NEO4J_URI}


@app.get("/stats")
def get_stats():
    """数据库统计信息"""
    nodes = query("""
        MATCH (n) 
        RETURN labels(n)[0] AS label, count(n) AS count 
        ORDER BY count DESC
    """)
    relations = query("""
        MATCH ()-[r]->() 
        RETURN type(r) AS type, count(r) AS count 
        ORDER BY count DESC
    """)
    return {"nodes": nodes, "relations": relations}


@app.get("/questions")
def get_questions(skip: int = 0, limit: int = 50):
    """获取问题列表"""
    return query("""
        MATCH (q:Question)-[:HAS_ANSWER]->(a:Answer)
        RETURN q.id AS id, q.text AS question, q.type AS type, 
               q.level AS level, a.text AS answer
        ORDER BY q.id
        SKIP $skip LIMIT $limit
    """, {"skip": skip, "limit": limit})


@app.get("/questions/{qid}")
def get_question(qid: str):
    """获取单个问题详情"""
    result = query("""
        MATCH (q:Question {id: $qid})-[:HAS_ANSWER]->(a:Answer)
        OPTIONAL MATCH (q)-[:RELATED_TO]->(d:Document)
        OPTIONAL MATCH (q)-[:HAS_SUPPORTING_FACT]->(sd:Document)
        WITH q, a, 
             collect(DISTINCT {id: d.id, title: d.title, idx: d.idx, sf: d.sf}) AS docs,
             collect(DISTINCT {id: sd.id, title: sd.title}) AS support_docs
        RETURN q.id AS id, q.text AS question, q.type AS type, 
               q.level AS level, a.text AS answer,
               docs, support_docs
    """, {"qid": qid})
    return result[0] if result else {"error": "Not found"}


@app.get("/questions/{qid}/hops")
def get_question_hops(qid: str):
    """获取问题的多跳路径"""
    # 获取支撑事实文档，按 doc_index 排序
    docs = query("""
        MATCH (q:Question {id: $qid})-[:HAS_SUPPORTING_FACT]->(d:Document)
        RETURN d.id AS doc_id, d.title AS title, d.idx AS idx
        ORDER BY d.idx
    """, {"qid": qid})
    
    # 获取 BRIDGE_BETWEEN 关系
    bridges = query("""
        MATCH (q:Question {id: $qid})-[:HAS_SUPPORTING_FACT]->(d:Document)
        WITH q, d ORDER BY d.idx
        WITH q, collect(d) AS docs
        UNWIND range(0, size(docs)-2) AS i
        MATCH (docs[i])-[:BRIDGE_BETWEEN]->(docs[i+1])
        RETURN docs[i].title AS from_doc, docs[i+1].title AS to_doc, 
               (i+1) AS hop
    """, {"qid": qid})
    
    return {
        "question_id": qid,
        "supporting_documents": docs,
        "bridge_path": bridges
    }


@app.get("/documents/{doc_id}/sentences")
def get_document_sentences(doc_id: str):
    """获取文档的所有句子"""
    return query("""
        MATCH (d:Document {id: $doc_id})-[:CONTAINS]->(s:Sentence)
        RETURN s.id AS id, s.text AS text, s.idx AS idx, s.sf AS is_supporting
        ORDER BY s.idx
    """, {"doc_id": doc_id})


@app.post("/search")
def search(req: SearchRequest):
    """全文搜索"""
    q = req.query.lower().strip()
    return query("""
        MATCH (q:Question)-[:HAS_ANSWER]->(a:Answer)
        WHERE toLower(q.text) CONTAINS $q 
           OR toLower(a.text) CONTAINS $q
           OR toLower(q.id) CONTAINS $q
        RETURN q.id AS id, q.text AS question, q.type AS type,
               q.level AS level, a.text AS answer
        LIMIT $limit
    """, {"q": q, "limit": req.limit})


@app.get("/entity/{name}/questions")
def get_entity_questions(name: str):
    """查找引用某个实体的所有问题"""
    return query("""
        MATCH (e:Entity {id: $name})<-[:MENTIONS]-(d:Document)<-[:RELATED_TO]-(q:Question)
        WITH q, count(DISTINCT d) AS doc_count
        RETURN q.id AS id, q.text AS question, q.type AS type, 
               q.level AS level, doc_count
        ORDER BY doc_count DESC
        LIMIT 20
    """, {"name": name})


@app.get("/shared-entities")
def get_shared_entities(limit: int = 20):
    """获取被多个问题共享的实体"""
    return query("""
        MATCH (e:Entity)<-[:MENTIONS]-(:Document)<-[:RELATED_TO]-(q:Question)
        WITH e, count(DISTINCT q) AS qcount
        WHERE qcount > 1
        RETURN e.id AS entity, e.name AS name, qcount
        ORDER BY qcount DESC
        LIMIT $limit
    """, {"limit": limit})


@app.post("/cypher")
def run_cypher(req: CypherRequest):
    """执行 Cypher 查询（只读，限制操作）"""
    q = req.query.strip().upper()
    # 安全检查：只允许读操作
    dangerous = ["DELETE", "REMOVE", "SET", "DROP", "CREATE", "MERGE"]
    if any(d in q for d in dangerous):
        return {"error": "只允许读查询 (MATCH/RETURN/WHERE/ORDER/LIMIT)"}
    
    try:
        result = query(req.query)
        return {"rows": result, "count": len(result)}
    except Exception as e:
        return {"error": str(e)}


@app.get("/graph/{qid}")
def get_graph_data(qid: str):
    """获取某个问题的子图数据（用于可视化）"""
    nodes = query("""
        MATCH (q:Question {id: $qid})
        OPTIONAL MATCH (q)-[:HAS_ANSWER]->(a:Answer)
        OPTIONAL MATCH (q)-[:RELATED_TO|HAS_SUPPORTING_FACT]->(d:Document)
        OPTIONAL MATCH (d)-[:CONTAINS]->(s:Sentence)
        OPTIONAL MATCH (d)-[:MENTIONS]->(e:Entity)
        WITH collect(DISTINCT {id: q.id, label: 'Question', text: q.text, type: q.type, level: q.level}) +
             collect(DISTINCT {id: a.id, label: 'Answer', text: a.text}) +
             collect(DISTINCT {id: d.id, label: 'Document', title: d.title, sf: d.sf}) +
             collect(DISTINCT {id: s.id, label: 'Sentence', text: s.text[:50], sf: s.sf}) +
             collect(DISTINCT {id: e.id, label: 'Entity', name: e.name}) AS nodes
        UNWIND nodes AS n
        RETURN n.id AS id, n.label AS label, n
    """, {"qid": qid})
    
    edges = query("""
        MATCH (q:Question {id: $qid})
        OPTIONAL MATCH (q)-[r1:HAS_ANSWER]->(a:Answer)
        OPTIONAL MATCH (q)-[r2:RELATED_TO|HAS_SUPPORTING_FACT]->(d:Document)
        OPTIONAL MATCH (d)-[r3:CONTAINS]->(s:Sentence)
        OPTIONAL MATCH (d)-[r4:MENTIONS]->(e:Entity)
        OPTIONAL MATCH (d)-[r5:BRIDGE_BETWEEN]->(d2:Document)
        WITH collect(DISTINCT {source: startNode(r1).id, target: endNode(r1).id, type: type(r1)}) +
             collect(DISTINCT {source: startNode(r2).id, target: endNode(r2).id, type: type(r2)}) +
             collect(DISTINCT {source: startNode(r3).id, target: endNode(r3).id, type: type(r3)}) +
             collect(DISTINCT {source: startNode(r4).id, target: endNode(r4).id, type: type(r4)}) +
             collect(DISTINCT {source: startNode(r5).id, target: endNode(r5).id, type: type(r5), hop: r5.hop}) AS edges
        UNWIND edges AS e
        RETURN e.source AS source, e.target AS target, e.type AS type, e
    """, {"qid": qid})
    
    return {"nodes": nodes, "edges": edges}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
