#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Neo4j HotpotQA 数据导入脚本
支持导入 train-00000-of-00002.json, train-00001-of-00002.json, validation-00000-of-00001.json

使用方法:
    1. 安装依赖: pip install neo4j
    2. 确保 Neo4j 数据库已运行
    3. 修改 CONFIG 配置
    4. 运行: python import_to_neo4j.py

作者: Assistant
"""

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from neo4j import GraphDatabase

# ==================== 配置区域 ====================

CONFIG = {
    # Neo4j 连接配置
    "uri": "bolt://localhost:7687",       # Neo4j Bolt 地址
    "username": "neo4j",                   # 用户名
    "password": "your_password",           # 密码（请修改）
    
    # 数据库名称（Neo4j 4.0+ 支持多数据库，默认使用 "neo4j"）
    "database": "neo4j",
    
    # JSON 文件路径列表
    "json_files": [
        # "./data/train-00000-of-00002.json",
        # "./data/train-00001-of-00002.json",
        "./data/validation-00000-of-00001.json",  # 目前只有这个文件可用
    ],
    
    # 批次大小（每批导入的记录数，内存大可以调大）
    "batch_size": 50,
    
    # 是否清空已有数据（重建模式）
    "clear_existing": True,
    
    # 是否创建约束和索引
    "create_indexes": True,
    
    # 是否打印详细日志
    "verbose": True,
}

# ==================== 工具函数 ====================

class Timer:
    """计时器上下文管理器"""
    def __init__(self, name: str):
        self.name = name
        self.start = 0
    
    def __enter__(self):
        self.start = time.time()
        print(f"\n{'='*60}")
        print(f"开始: {self.name}")
        print(f"{'='*60}")
        return self
    
    def __exit__(self, *args):
        elapsed = time.time() - self.start
        print(f"{'='*60}")
        print(f"完成: {self.name} | 耗时: {elapsed:.2f}s ({elapsed/60:.2f}min)")
        print(f"{'='*60}\n")


def log(msg: str, level: str = "INFO"):
    """打印日志"""
    if CONFIG["verbose"]:
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] [{level}] {msg}")


def load_json_file(filepath: str) -> list[dict]:
    """加载 JSON 文件"""
    path = Path(filepath)
    if not path.exists():
        log(f"文件不存在: {filepath}", "ERROR")
        sys.exit(1)
    
    log(f"加载文件: {filepath} ({path.stat().st_size / 1024 / 1024:.1f} MB)")
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    log(f"加载完成: {len(data)} 条记录")
    return data


# ==================== Neo4j 导入类 ====================

class Neo4jImporter:
    def __init__(self, uri: str, username: str, password: str, database: str = "neo4j"):
        self.driver = GraphDatabase.driver(uri, auth=(username, password))
        self.database = database
        self.stats = {
            "questions": 0,
            "answers": 0,
            "documents": 0,
            "sentences": 0,
            "entities": 0,
            "relationships": 0,
        }
        
        # 验证连接
        try:
            with self.driver.session(database=database) as session:
                result = session.run("RETURN 1 AS connected")
                result.single()
                log(f"Neo4j 连接成功: {uri} (database: {database})")
        except Exception as e:
            log(f"Neo4j 连接失败: {e}", "ERROR")
            sys.exit(1)
    
    def close(self):
        """关闭驱动连接"""
        self.driver.close()
        log("Neo4j 连接已关闭")
    
    def clear_database(self):
        """清空数据库所有节点和关系"""
        with Timer("清空数据库"):
            with self.driver.session(database=self.database) as session:
                # 删除所有关系和节点
                session.run("MATCH ()-[r]->() DELETE r")
                log("已删除所有关系")
                session.run("MATCH (n) DELETE n")
                log("已删除所有节点")
        
        # 重置统计
        for key in self.stats:
            self.stats[key] = 0
    
    def create_indexes_and_constraints(self):
        """创建索引和约束以提高查询性能"""
        with Timer("创建索引和约束"):
            with self.driver.session(database=self.database) as session:
                indexes = [
                    # 约束：Question 的 id 唯一
                    "CREATE CONSTRAINT question_id IF NOT EXISTS FOR (q:Question) REQUIRE q.id IS UNIQUE",
                    # 约束：Answer 的 id 唯一
                    "CREATE CONSTRAINT answer_id IF NOT EXISTS FOR (a:Answer) REQUIRE a.id IS UNIQUE",
                    # 约束：Document 的 composite_id 唯一
                    "CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.composite_id IS UNIQUE",
                    # 索引：节点标签
                    "CREATE INDEX question_type IF NOT EXISTS FOR (q:Question) ON (q.type)",
                    "CREATE INDEX question_level IF NOT EXISTS FOR (q:Question) ON (q.level)",
                    "CREATE INDEX document_title IF NOT EXISTS FOR (d:Document) ON (d.title)",
                ]
                
                for i, cypher in enumerate(indexes):
                    try:
                        session.run(cypher)
                        log(f"索引/约束 {i+1}/{len(indexes)} 创建成功")
                    except Exception as e:
                        log(f"索引/约束 {i+1} 已存在或失败: {e}", "WARN")
    
    def import_questions_batch(self, questions: list[dict]):
        """批量导入 Question 和 Answer 节点"""
        cypher = """
        UNWIND $questions AS q
        MERGE (question:Question {id: q._id})
        ON CREATE SET
            question.text = q.question,
            question.type = q.type,
            question.level = q.level,
            question.source_file = q._source_file
        ON MATCH SET
            question.text = q.question,
            question.type = q.type,
            question.level = q.level,
            question.source_file = q._source_file
        
        MERGE (answer:Answer {id: q._answer_id})
        ON CREATE SET answer.text = q.answer
        ON MATCH SET answer.text = q.answer
        
        MERGE (question)-[r:HAS_ANSWER]->(answer)
        
        RETURN count(question) AS questions, count(answer) AS answers
        """
        
        with self.driver.session(database=self.database) as session:
            result = session.run(cypher, questions=questions)
            record = result.single()
            self.stats["questions"] += record["questions"]
            self.stats["answers"] += record["answers"]
    
    def import_documents_batch(self, docs_batch: list[dict]):
        """批量导入 Document 和 Sentence 节点"""
        cypher = """
        UNWIND $docs AS doc
        // 创建或合并 Question 节点
        MERGE (question:Question {id: doc.question_id})
        
        // 创建 Document 节点
        MERGE (document:Document {composite_id: doc.composite_id})
        ON CREATE SET
            document.title = doc.title,
            document.question_id = doc.question_id,
            document.doc_index = doc.doc_index,
            document.sentence_count = doc.sentence_count,
            document.is_supporting_fact = doc.is_supporting_fact
        ON MATCH SET
            document.title = doc.title,
            document.question_id = doc.question_id,
            document.doc_index = doc.doc_index,
            document.sentence_count = doc.sentence_count,
            document.is_supporting_fact = doc.is_supporting_fact
        
        // Document 连接到 Question
        MERGE (question)-[r1:RELATED_TO]->(document)
        ON CREATE SET r1.is_supporting_fact = doc.is_supporting_fact
        
        // 如果是支撑事实，添加额外标记
        FOREACH (_ IN CASE WHEN doc.is_supporting_fact THEN [1] ELSE [] END |
            MERGE (question)-[r2:HAS_SUPPORTING_FACT]->(document)
            ON CREATE SET r2.sentence_ids = doc.supporting_sent_ids
        )
        
        // 创建 Sentence 节点
        FOREACH (sent_data IN doc.sentences |
            MERGE (sentence:Sentence {composite_id: sent_data.composite_id})
            ON CREATE SET
                sentence.text = sent_data.text,
                sentence.sentence_index = sent_data.sentence_index,
                sentence.doc_title = sent_data.doc_title,
                sentence.question_id = sent_data.question_id,
                sentence.is_supporting_fact = sent_data.is_supporting_fact
            ON MATCH SET
                sentence.text = sent_data.text,
                sentence.sentence_index = sent_data.sentence_index,
                sentence.doc_title = sent_data.doc_title,
                sentence.question_id = sent_data.question_id,
                sentence.is_supporting_fact = sent_data.is_supporting_fact
            
            MERGE (document)-[r3:CONTAINS {index: sent_data.sentence_index}]->(sentence)
            
            FOREACH (_ IN CASE WHEN sent_data.is_supporting_fact THEN [1] ELSE [] END |
                MERGE (question)-[r4:HAS_SUPPORTING_FACT {hop: sent_data.hop}]->(sentence)
            )
        )
        
        RETURN count(document) AS documents
        """
        
        with self.driver.session(database=self.database) as session:
            result = session.run(cypher, docs=docs_batch)
            record = result.single()
            self.stats["documents"] += record["documents"]
    
    def import_bridge_relationships_batch(self, bridges_batch: list[dict]):
        """批量导入桥接关系 (BRIDGE_BETWEEN)"""
        cypher = """
        UNWIND $bridges AS bridge
        MATCH (from_doc:Document {composite_id: bridge.from_composite_id})
        MATCH (to_doc:Document {composite_id: bridge.to_composite_id})
        MERGE (from_doc)-[r:BRIDGE_BETWEEN]->(to_doc)
        ON CREATE SET
            r.hop = bridge.hop,
            r.question_id = bridge.question_id
        ON MATCH SET
            r.hop = bridge.hop,
            r.question_id = bridge.question_id
        RETURN count(r) AS rels
        """
        
        with self.driver.session(database=self.database) as session:
            result = session.run(cypher, bridges=bridges_batch)
            record = result.single()
            self.stats["relationships"] += record["rels"]
    
    def import_comparison_relationships_batch(self, comparisons_batch: list[dict]):
        """批量导入比较关系 (RELATED_TO compared_with)"""
        cypher = """
        UNWIND $comparisons AS comp
        MATCH (from_doc:Document {composite_id: comp.from_composite_id})
        MATCH (to_doc:Document {composite_id: comp.to_composite_id})
        MERGE (from_doc)-[r:RELATED_TO]->(to_doc)
        ON CREATE SET
            r.relation_type = 'compared_with',
            r.question_id = comp.question_id
        ON MATCH SET
            r.relation_type = 'compared_with',
            r.question_id = comp.question_id
        RETURN count(r) AS rels
        """
        
        with self.driver.session(database=self.database) as session:
            result = session.run(cypher, comparisons=comparisons_batch)
            record = result.single()
            self.stats["relationships"] += record["rels"]
    
    def import_entities_batch(self, entities_batch: list[dict]):
        """批量导入 Entity 节点和 MENTIONS 关系"""
        cypher = """
        UNWIND $entities AS ent
        MERGE (entity:Entity {id: ent.entity_id})
        ON CREATE SET
            entity.name = ent.name,
            entity.question_id = ent.question_id,
            entity.source_doc = ent.source_doc
        ON MATCH SET
            entity.name = ent.name,
            entity.question_id = ent.question_id,
            entity.source_doc = ent.source_doc
        
        WITH entity, ent
        MATCH (doc:Document {composite_id: ent.doc_composite_id})
        MERGE (doc)-[r:MENTIONS {type: 'title_entity'}]->(entity)
        
        RETURN count(entity) AS entities
        """
        
        with self.driver.session(database=self.database) as session:
            result = session.run(cypher, entities=entities_batch)
            record = result.single()
            self.stats["entities"] += record["entities"]
    
    def import_sentences_to_entities_batch(self, sent_mentions_batch: list[dict]):
        """批量导入 Sentence 到 Entity 的 MENTIONS 关系"""
        cypher = """
        UNWIND $mentions AS m
        MATCH (sent:Sentence {composite_id: m.sent_composite_id})
        MATCH (entity:Entity {id: m.entity_id})
        MERGE (sent)-[r:MENTIONS {type: 'text_mention'}]->(entity)
        RETURN count(r) AS rels
        """
        
        with self.driver.session(database=self.database) as session:
            result = session.run(cypher, mentions=sent_mentions_batch)
            record = result.single()
            self.stats["relationships"] += record["rels"]

    def process_questions(self, questions: list[dict], source_file: str):
        """处理一批问题数据并导入 Neo4j"""
        
        # Step 1: 导入 Question 和 Answer 节点
        log("=" * 60)
        log("步骤 1/6: 导入 Question 和 Answer 节点")
        log("=" * 60)
        
        question_batch = []
        for i, q in enumerate(questions):
            question_batch.append({
                "_id": q["id"],
                "_answer_id": f"answer_{q['id']}",
                "_source_file": source_file,
                "question": q["question"],
                "answer": q["answer"],
                "type": q["type"],
                "level": q["level"],
            })
            
            if len(question_batch) >= CONFIG["batch_size"]:
                self.import_questions_batch(question_batch)
                question_batch = []
                if (i + 1) % 100 == 0:
                    log(f"  Question/Answer 进度: {i+1}/{len(questions)}")
        
        if question_batch:
            self.import_questions_batch(question_batch)
        
        log(f"累计 Question 节点: {self.stats['questions']}")
        log(f"累计 Answer 节点: {self.stats['answers']}")
        
        # Step 2: 导入 Document 和 Sentence 节点
        log("\n" + "=" * 60)
        log("步骤 2/6: 导入 Document 和 Sentence 节点")
        log("=" * 60)
        
        doc_batch = []
        for i, q in enumerate(questions):
            for doc_idx, title in enumerate(q["context"]["title"]):
                sentences = q["context"]["sentences"][doc_idx] if doc_idx < len(q["context"]["sentences"]) else []
                
                # 判断是否是支撑事实
                is_supporting = title in q["supporting_facts"]["title"]
                supporting_sent_ids = []
                if is_supporting:
                    supporting_sent_ids = [
                        q["supporting_facts"]["sent_id"][j]
                        for j, t in enumerate(q["supporting_facts"]["title"])
                        if t == title
                    ]
                
                # 构建 sentences 列表
                sent_list = []
                for s_idx, sent_text in enumerate(sentences):
                    sent_is_supporting = is_supporting and s_idx in supporting_sent_ids
                    sent_hop = None
                    if sent_is_supporting:
                        try:
                            sent_hop = q["supporting_facts"]["title"].index(title) + 1
                        except ValueError:
                            sent_hop = 1
                    
                    sent_list.append({
                        "composite_id": f"sent_{q['id']}_{doc_idx}_{s_idx}",
                        "text": sent_text,
                        "sentence_index": s_idx,
                        "doc_title": title,
                        "question_id": q["id"],
                        "is_supporting_fact": sent_is_supporting,
                        "hop": sent_hop,
                    })
                
                doc_batch.append({
                    "composite_id": f"doc_{q['id']}_{doc_idx}",
                    "title": title,
                    "question_id": q["id"],
                    "doc_index": doc_idx,
                    "sentence_count": len(sentences),
                    "is_supporting_fact": is_supporting,
                    "supporting_sent_ids": supporting_sent_ids,
                    "sentences": sent_list,
                })
            
            if len(doc_batch) >= CONFIG["batch_size"]:
                self.import_documents_batch(doc_batch)
                doc_batch = []
                if (i + 1) % 100 == 0:
                    log(f"  Document/Sentence 进度: {i+1}/{len(questions)}")
        
        if doc_batch:
            self.import_documents_batch(doc_batch)
        
        log(f"累计 Document 节点: {self.stats['documents']}")
        
        # Step 3: 导入桥接关系 (bridge 类型问题)
        log("\n" + "=" * 60)
        log("步骤 3/6: 导入 BRIDGE_BETWEEN 关系")
        log("=" * 60)
        
        bridge_batch = []
        for q in questions:
            if q["type"] == "bridge":
                sf_titles = list(dict.fromkeys(q["supporting_facts"]["title"]))  # 去重保持顺序
                for i in range(len(sf_titles) - 1):
                    from_title = sf_titles[i]
                    to_title = sf_titles[i + 1]
                    # 找到对应的 composite_id
                    doc_indices = {t: idx for idx, t in enumerate(q["context"]["title"])}
                    if from_title in doc_indices and to_title in doc_indices:
                        bridge_batch.append({
                            "from_composite_id": f"doc_{q['id']}_{doc_indices[from_title]}",
                            "to_composite_id": f"doc_{q['id']}_{doc_indices[to_title]}",
                            "hop": i + 1,
                            "question_id": q["id"],
                        })
        
        if bridge_batch:
            # 分批导入
            for i in range(0, len(bridge_batch), CONFIG["batch_size"]):
                batch = bridge_batch[i:i + CONFIG["batch_size"]]
                self.import_bridge_relationships_batch(batch)
            log(f"BRIDGE_BETWEEN 关系: {len(bridge_batch)}")
        else:
            log("没有 BRIDGE_BETWEEN 关系")
        
        # Step 4: 导入比较关系 (comparison 类型问题)
        log("\n" + "=" * 60)
        log("步骤 4/6: 导入 RELATED_TO (compared_with) 关系")
        log("=" * 60)
        
        comparison_batch = []
        for q in questions:
            if q["type"] == "comparison":
                sf_titles = list(dict.fromkeys(q["supporting_facts"]["title"]))
                for i in range(len(sf_titles) - 1):
                    from_title = sf_titles[i]
                    to_title = sf_titles[i + 1]
                    doc_indices = {t: idx for idx, t in enumerate(q["context"]["title"])}
                    if from_title in doc_indices and to_title in doc_indices:
                        comparison_batch.append({
                            "from_composite_id": f"doc_{q['id']}_{doc_indices[from_title]}",
                            "to_composite_id": f"doc_{q['id']}_{doc_indices[to_title]}",
                            "question_id": q["id"],
                        })
        
        if comparison_batch:
            for i in range(0, len(comparison_batch), CONFIG["batch_size"]):
                batch = comparison_batch[i:i + CONFIG["batch_size"]]
                self.import_comparison_relationships_batch(batch)
            log(f"RELATED_TO (compared_with) 关系: {len(comparison_batch)}")
        else:
            log("没有 RELATED_TO (compared_with) 关系")
        
        # Step 5: 导入 Entity 节点
        log("\n" + "=" * 60)
        log("步骤 5/6: 导入 Entity 节点")
        log("=" * 60)
        
        entity_batch = []
        for q in questions:
            for doc_idx, title in enumerate(q["context"]["title"]):
                entity_batch.append({
                    "entity_id": f"entity_{q['id']}_{doc_idx}_0",
                    "name": title,
                    "question_id": q["id"],
                    "source_doc": title,
                    "doc_composite_id": f"doc_{q['id']}_{doc_idx}",
                })
        
        if entity_batch:
            for i in range(0, len(entity_batch), CONFIG["batch_size"]):
                batch = entity_batch[i:i + CONFIG["batch_size"]]
                self.import_entities_batch(batch)
                if (i + len(batch)) % 500 == 0:
                    log(f"  Entity 进度: {i+len(batch)}/{len(entity_batch)}")
        
        log(f"累计 Entity 节点: {self.stats['entities']}")
        
        # Step 6: 导入 Sentence 到 Entity 的 MENTIONS 关系
        log("\n" + "=" * 60)
        log("步骤 6/6: 导入 Sentence -> Entity MENTIONS 关系")
        log("=" * 60)
        
        sent_mentions_batch = []
        for q in questions:
            for doc_idx, title in enumerate(q["context"]["title"]):
                sentences = q["context"]["sentences"][doc_idx] if doc_idx < len(q["context"]["sentences"]) else []
                entity_id = f"entity_{q['id']}_{doc_idx}_0"
                for s_idx, sent_text in enumerate(sentences):
                    if title.lower() in sent_text.lower():
                        sent_mentions_batch.append({
                            "sent_composite_id": f"sent_{q['id']}_{doc_idx}_{s_idx}",
                            "entity_id": entity_id,
                        })
        
        if sent_mentions_batch:
            for i in range(0, len(sent_mentions_batch), CONFIG["batch_size"]):
                batch = sent_mentions_batch[i:i + CONFIG["batch_size"]]
                self.import_sentences_to_entities_batch(batch)
            log(f"Sentence -> Entity MENTIONS 关系: {len(sent_mentions_batch)}")
        else:
            log("没有 Sentence -> Entity MENTIONS 关系")
    
    def verify_import(self):
        """验证导入结果"""
        log("\n" + "=" * 60)
        log("导入验证")
        log("=" * 60)
        
        with self.driver.session(database=self.database) as session:
            # 统计各类节点
            for label in ["Question", "Answer", "Document", "Sentence", "Entity"]:
                result = session.run(f"MATCH (n:{label}) RETURN count(n) AS cnt")
                count = result.single()["cnt"]
                log(f"  {label} 节点数: {count}")
            
            # 统计关系
            result = session.run("MATCH ()-[r]->() RETURN count(r) AS cnt")
            count = result.single()["cnt"]
            log(f"  总关系数: {count}")
            
            # 统计各类型关系
            result = session.run("""
                MATCH ()-[r]->() 
                RETURN type(r) AS rel_type, count(r) AS cnt
                ORDER BY cnt DESC
            """)
            log("  关系类型分布:")
            for record in result:
                log(f"    {record['rel_type']}: {record['cnt']}")
            
            # 抽样检查
            log("\n  抽样数据检查:")
            result = session.run("""
                MATCH (q:Question)-[:HAS_ANSWER]->(a:Answer)
                RETURN q.id AS qid, q.text AS question, q.type AS type, q.level AS level, a.text AS answer
                LIMIT 3
            """)
            for record in result:
                log(f"    Question ID: {record['qid']}")
                log(f"    Question: {record['question'][:60]}...")
                log(f"    Type: {record['type']}, Level: {record['level']}")
                log(f"    Answer: {record['answer']}")
                log()


def main():
    """主入口函数"""
    print("""
    ╔══════════════════════════════════════════════════════════════╗
    ║        Neo4j HotpotQA 数据导入工具 v2.0                      ║
    ║        支持 train + validation 数据导入                       ║
    ╚══════════════════════════════════════════════════════════════╝
    """)
    
    # 检查配置
    if CONFIG["password"] == "your_password":
        print("警告: 请在 CONFIG 中设置正确的 Neo4j 密码!")
        print("编辑脚本中的 CONFIG['password'] 项。")
        sys.exit(1)
    
    # 检查文件
    for f in CONFIG["json_files"]:
        if not Path(f).exists():
            print(f"警告: 文件不存在: {f}")
    
    existing_files = [f for f in CONFIG["json_files"] if Path(f).exists()]
    if not existing_files:
        print("错误: 没有找到任何可用的 JSON 文件!")
        sys.exit(1)
    
    print(f"准备导入 {len(existing_files)} 个文件:")
    for f in existing_files:
        print(f"  - {f}")
    print()
    
    # 连接 Neo4j
    importer = Neo4jImporter(
        uri=CONFIG["uri"],
        username=CONFIG["username"],
        password=CONFIG["password"],
        database=CONFIG["database"],
    )
    
    try:
        # 清空数据库（如果需要）
        if CONFIG["clear_existing"]:
            importer.clear_database()
        
        # 创建索引
        if CONFIG["create_indexes"]:
            importer.create_indexes_and_constraints()
        
        # 导入每个文件
        total_start = time.time()
        for filepath in existing_files:
            source_name = Path(filepath).name
            
            with Timer(f"导入文件: {source_name}"):
                # 加载数据
                questions = load_json_file(filepath)
                log(f"准备导入 {len(questions)} 条问题记录")
                
                # 处理并导入
                importer.process_questions(questions, source_name)
        
        # 验证导入
        importer.verify_import()
        
        # 总统计
        total_elapsed = time.time() - total_start
        print("\n" + "=" * 60)
        print("导入完成汇总")
        print("=" * 60)
        print(f"总耗时: {total_elapsed:.2f}s ({total_elapsed/60:.2f}min)")
        print(f"Question 节点: {importer.stats['questions']}")
        print(f"Answer 节点: {importer.stats['answers']}")
        print(f"Document 节点: {importer.stats['documents']}")
        print(f"Entity 节点: {importer.stats['entities']}")
        print(f"总关系数: {importer.stats['relationships']}")
        print("=" * 60)
    
    finally:
        importer.close()


if __name__ == "__main__":
    main()
