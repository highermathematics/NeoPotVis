#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Neo4j HotpotQA 极速导入脚本 v3.2
- 全局Entity去重（相同标题跨问题共享同一个Entity）
- 修复FOREACH中不能使用MATCH的语法错误
- 支持 --clear 清空重导 / --skip-existing 断点续传

用法:
    # 首次导入（清空后导入）
    python import_neo4j_rapid.py --password 12345678 --files validation.json --clear

    # 断点续传（不删除已有数据，跳过已导入的节点类型）
    python import_neo4j_rapid.py --password 12345678 --files validation.json --skip-existing

依赖: pip install neo4j
"""

import argparse
import json
import sys
import time
from pathlib import Path

from neo4j import GraphDatabase

BATCH_QA = 2000
BATCH_DOC = 2000
BATCH_SENT = 5000
BATCH_SF_SENT = 5000
BATCH_REL = 2000
BATCH_ENTITY = 3000


def eprint(msg):
    print(msg, flush=True)


def check_existing(driver, database):
    """检查已有数据状态"""
    counts = {}
    with driver.session(database=database) as s:
        for label in ["Question", "Answer", "Document", "Sentence", "Entity"]:
            result = s.run(f"MATCH (n:{label}) RETURN count(n) AS c")
            counts[label] = result.single()["c"]
    return counts


def build_global_entities(questions):
    """全局去重：收集所有唯一的文档标题"""
    eprint("      全局去重 Entity...")
    t1 = time.time()
    entity_map = {}
    for q in questions:
        for title in q["context"]["title"]:
            tid = title.strip()
            if tid not in entity_map:
                entity_map[tid] = title.strip()
    eprint(f"      {len(entity_map)} 个唯一 Entity ({time.time()-t1:.1f}s)")
    return entity_map


def preprocess_questions(questions):
    """预处理所有数据为结构化列表"""
    t1 = time.time()

    qa_list = []
    doc_list = []
    sent_list = []
    sf_sent_list = []
    bridge_list = []
    comp_list = []
    doc_entity_rels = []

    for q in questions:
        qid = q["id"]

        # Question + Answer
        qa_list.append({
            "qid": qid, "qtext": q["question"], "atype": q["type"],
            "alevel": q["level"], "atext": q["answer"]
        })

        # Document & Sentence
        sf_titles = set(q["supporting_facts"]["title"])
        for di, title in enumerate(q["context"]["title"]):
            doc_id = f"{qid}_{di}"
            is_sf = title in sf_titles
            doc_list.append({
                "did": doc_id, "qid": qid, "title": title,
                "didx": di, "isf": is_sf
            })
            doc_entity_rels.append({
                "did": doc_id,
                "eid": title.strip()
            })

            sents = q["context"]["sentences"][di] if di < len(q["context"]["sentences"]) else []
            sf_sent_ids = set()
            if is_sf:
                sf_sent_ids = {q["supporting_facts"]["sent_id"][j]
                               for j, t in enumerate(q["supporting_facts"]["title"]) if t == title}

            for si, stext in enumerate(sents):
                sent_sf = si in sf_sent_ids
                sent_list.append({
                    "sid": f"{qid}_{di}_{si}", "did": doc_id,
                    "stext": stext, "sidx": si, "isf": sent_sf
                })
                if sent_sf:
                    sf_sent_list.append({
                        "sid": f"{qid}_{di}_{si}",
                        "qid": qid,
                        "hop": di + 1
                    })

        # Bridge 关系
        if q["type"] == "bridge":
            sft = list(dict.fromkeys(q["supporting_facts"]["title"]))
            dmap = {t: i for i, t in enumerate(q["context"]["title"])}
            for i in range(len(sft) - 1):
                if sft[i] in dmap and sft[i + 1] in dmap:
                    bridge_list.append({
                        "f": f"{qid}_{dmap[sft[i]]}",
                        "t": f"{qid}_{dmap[sft[i + 1]]}",
                        "h": i + 1, "q": qid
                    })

        # Comparison 关系
        if q["type"] == "comparison":
            sft = list(dict.fromkeys(q["supporting_facts"]["title"]))
            dmap = {t: i for i, t in enumerate(q["context"]["title"])}
            for i in range(len(sft) - 1):
                if sft[i] in dmap and sft[i + 1] in dmap:
                    comp_list.append({
                        "f": f"{qid}_{dmap[sft[i]]}",
                        "t": f"{qid}_{dmap[sft[i + 1]]}", "q": qid
                    })

    eprint(f"      QA:{len(qa_list)} Doc:{len(doc_list)} Sent:{len(sent_list)} "
           f"SF_Sent:{len(sf_sent_list)} Bridge:{len(bridge_list)} Comp:{len(comp_list)} "
           f"({time.time() - t1:.1f}s)")

    return qa_list, doc_list, sent_list, sf_sent_list, bridge_list, comp_list, doc_entity_rels


def import_file(driver, database, filepath, clear=False, skip_existing=False):
    fname = Path(filepath).name
    file_mb = Path(filepath).stat().st_size / 1024 / 1024

    eprint(f"\n{'=' * 50}")
    eprint(f"文件: {fname} ({file_mb:.1f} MB)")
    eprint(f"{'=' * 50}")

    t0 = time.time()

    # ---- 1. 加载 JSON ----
    eprint("[1/5] 加载 JSON...")
    t1 = time.time()
    with open(filepath, 'r', encoding='utf-8') as f:
        questions = json.load(f)
    eprint(f"      {len(questions)} 条问题 ({time.time() - t1:.1f}s)")

    # ---- 检查已有数据 ----
    existing = check_existing(driver, database)
    has_existing = any(v > 0 for v in existing.values())

    if skip_existing and has_existing:
        eprint(f"      已有数据: Question={existing['Question']} Answer={existing['Answer']} "
               f"Document={existing['Document']} Sentence={existing['Sentence']} Entity={existing['Entity']}")
        eprint(f"      --skip-existing 模式: 跳过已有节点类型")

    # ---- 2. 预处理 ----
    eprint("[2/5] 预处理数据...")
    qa_list, doc_list, sent_list, sf_sent_list, bridge_list, comp_list, doc_entity_rels = preprocess_questions(
        questions)

    entity_map = build_global_entities(questions)
    entity_list = [{"eid": k, "name": v} for k, v in entity_map.items()]

    # ---- 3. 导入 Neo4j ----
    eprint("[3/5] 导入 Neo4j...")
    t1 = time.time()

    with driver.session(database=database) as s:
        if clear:
            eprint("      清空数据库...")
            s.run("MATCH ()-[r]->() DELETE r")
            s.run("MATCH (n) DELETE n")
            eprint("      已清空")

        # 3a. Entity（全局去重）
        if skip_existing and existing["Entity"] > 0:
            eprint(f"      跳过 Entity（已有 {existing['Entity']} 个）")
        else:
            eprint("      导入 Entity（全局去重）...")
            for i in range(0, len(entity_list), BATCH_ENTITY):
                batch = entity_list[i:i + BATCH_ENTITY]
                s.run("""
                    UNWIND $batch AS row
                    MERGE (e:Entity {id: row.eid})
                    ON CREATE SET e.name = row.name
                """, batch=batch)
                if (i + len(batch)) % 30000 == 0:
                    eprint(f"        ...{i + len(batch)}")

        # 3b. Question + Answer
        if skip_existing and existing["Question"] > 0:
            eprint(f"      跳过 Question/Answer（已有 {existing['Question']} 对）")
        else:
            eprint("      导入 Question/Answer...")
            for i in range(0, len(qa_list), BATCH_QA):
                batch = qa_list[i:i + BATCH_QA]
                s.run("""
                    UNWIND $batch AS row
                    CREATE (q:Question {id: row.qid, text: row.qtext, type: row.atype, level: row.alevel})
                    CREATE (a:Answer {id: 'a_' + row.qid, text: row.atext})
                    CREATE (q)-[:HAS_ANSWER]->(a)
                """, batch=batch)
                if (i + len(batch)) % 10000 == 0:
                    eprint(f"        ...{i + len(batch)}")

        # 3c. Document
        if skip_existing and existing["Document"] > 0:
            eprint(f"      跳过 Document（已有 {existing['Document']} 个）")
        else:
            eprint("      导入 Document...")
            for i in range(0, len(doc_list), BATCH_DOC):
                batch = doc_list[i:i + BATCH_DOC]
                s.run("""
                    UNWIND $batch AS row
                    CREATE (d:Document {id: row.did, title: row.title, qid: row.qid, idx: row.didx, sf: row.isf})
                    WITH d, row
                    MATCH (q:Question {id: row.qid})
                    CREATE (q)-[:RELATED_TO {sf: row.isf}]->(d)
                    FOREACH (_ IN CASE WHEN row.isf THEN [1] ELSE [] END |
                        CREATE (q)-[:HAS_SUPPORTING_FACT]->(d)
                    )
                """, batch=batch)
                if (i + len(batch)) % 20000 == 0:
                    eprint(f"        ...{i + len(batch)}")

        # 3d. Sentence（修复：FOREACH中不能有MATCH，拆成两个查询）
        if skip_existing and existing["Sentence"] > 0:
            eprint(f"      跳过 Sentence（已有 {existing['Sentence']} 个）")
        else:
            eprint("      导入 Sentence...")
            for i in range(0, len(sent_list), BATCH_SENT):
                batch = sent_list[i:i + BATCH_SENT]
                s.run("""
                    UNWIND $batch AS row
                    CREATE (s:Sentence {id: row.sid, text: row.stext, idx: row.sidx, sf: row.isf})
                    WITH s, row
                    MATCH (d:Document {id: row.did})
                    CREATE (d)-[:CONTAINS {index: row.sidx}]->(s)
                """, batch=batch)
                if (i + len(batch)) % 50000 == 0:
                    eprint(f"        ...{i + len(batch)}")

            # 3d2. 单独导入 supporting fact 的 Question->Sentence 关系
            if sf_sent_list:
                eprint("      导入 HAS_SUPPORTING_FACT 关系...")
                for i in range(0, len(sf_sent_list), BATCH_SF_SENT):
                    batch = sf_sent_list[i:i + BATCH_SF_SENT]
                    s.run("""
                        UNWIND $batch AS row
                        MATCH (q:Question {id: row.qid})
                        MATCH (s:Sentence {id: row.sid})
                        CREATE (q)-[:HAS_SUPPORTING_FACT {hop: row.hop}]->(s)
                    """, batch=batch)
                eprint(f"        +{len(sf_sent_list)} HAS_SUPPORTING_FACT 关系")

        # 3e. Document -> Entity MENTIONS
        eprint("      导入 Document->Entity MENTIONS...")
        for i in range(0, len(doc_entity_rels), BATCH_REL):
            batch = doc_entity_rels[i:i + BATCH_REL]
            s.run("""
                UNWIND $batch AS row
                MATCH (d:Document {id: row.did})
                MATCH (e:Entity {id: row.eid})
                MERGE (d)-[:MENTIONS {type: 'title_entity'}]->(e)
            """, batch=batch)

        # 3f. Bridge 关系
        if bridge_list:
            eprint("      导入 BRIDGE_BETWEEN...")
            for i in range(0, len(bridge_list), BATCH_REL):
                batch = bridge_list[i:i + BATCH_REL]
                s.run("""
                    UNWIND $batch AS row
                    MATCH (d1:Document {id: row.f})
                    MATCH (d2:Document {id: row.t})
                    CREATE (d1)-[:BRIDGE_BETWEEN {hop: row.h, qid: row.q}]->(d2)
                """, batch=batch)

        # 3g. Comparison 关系
        if comp_list:
            eprint("      导入 RELATED_TO...")
            for i in range(0, len(comp_list), BATCH_REL):
                batch = comp_list[i:i + BATCH_REL]
                s.run("""
                    UNWIND $batch AS row
                    MATCH (d1:Document {id: row.f})
                    MATCH (d2:Document {id: row.t})
                    CREATE (d1)-[:RELATED_TO {type: 'compared', qid: row.q}]->(d2)
                """, batch=batch)

    elapsed = time.time() - t1
    eprint(f"      导入完成 ({elapsed:.1f}s)")

    # ---- 4. 验证 ----
    eprint("[4/5] 验证...")
    with driver.session(database=database) as s:
        total = 0
        for label in ["Question", "Answer", "Document", "Sentence", "Entity"]:
            c = s.run(f"MATCH (n:{label}) RETURN count(n) AS c").single()["c"]
            eprint(f"      {label:12s}: {c:,}")
            total += c
        rc = s.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]
        eprint(f"      {'Relations':12s}: {rc:,}")
        eprint(f"      {'Total Nodes':12s}: {total:,}")

    # ---- 5. Entity 关联示例 ----
    eprint("[5/5] 跨问题 Entity 关联...")
    with driver.session(database=database) as s:
        result = s.run("""
            MATCH (e:Entity)<-[:MENTIONS]-(:Document)<-[:RELATED_TO]-(q:Question)
            WITH e, count(DISTINCT q) AS qc
            WHERE qc > 1
            RETURN e.name AS entity, qc
            ORDER BY qc DESC
            LIMIT 5
        """)
        for record in result:
            eprint(f"      '{record['entity'][:40]}' 出现在 {record['qc']} 个问题中")

    total_time = time.time() - t0
    eprint(f"\n完成: {fname} | 总耗时 {total_time:.1f}s ({total_time / 60:.1f}min)")
    return len(questions)


def main():
    parser = argparse.ArgumentParser(description="Neo4j HotpotQA 极速导入 v3.2")
    parser.add_argument("--uri", default="bolt://localhost:7687")
    parser.add_argument("--user", default="neo4j")
    parser.add_argument("--password", required=True)
    parser.add_argument("--database", default="neo4j")
    parser.add_argument("--files", nargs="+", required=True)
    parser.add_argument("--clear", action="store_true", help="清空已有数据后重新导入")
    parser.add_argument("--skip-existing", action="store_true",
                        help="不断删数据，跳过已导入的节点类型（断点续传）")
    args = parser.parse_args()

    if args.clear and args.skip_existing:
        eprint("错误: --clear 和 --skip-existing 不能同时使用")
        sys.exit(1)

    eprint("=" * 50)
    eprint("Neo4j HotpotQA 极速导入 v3.2")
    if args.skip_existing:
        eprint("模式: 断点续传（跳过已有数据，不删除）")
    elif args.clear:
        eprint("模式: 清空重导")
    else:
        eprint("模式: 正常导入（可能覆盖已有数据）")
    eprint("=" * 50)

    driver = GraphDatabase.driver(args.uri, auth=(args.user, args.password))

    with driver.session(database=args.database) as s:
        s.run("RETURN 1").single()
    eprint("Neo4j 连接 OK\n")

    t0 = time.time()
    total_qs = 0

    first = True
    for f in args.files:
        if not Path(f).exists():
            eprint(f"跳过 (不存在): {f}")
            continue
        should_clear = args.clear and first
        n = import_file(driver, args.database, f, clear=should_clear,
                        skip_existing=args.skip_existing)
        total_qs += n
        first = False

    total = time.time() - t0
    eprint(f"\n{'=' * 50}")
    eprint(f"全部完成!")
    eprint(f"  总问题数: {total_qs:,}")
    eprint(f"  总耗时:   {total:.1f}s ({total / 60:.1f}min)")
    eprint(f"{'=' * 50}")

    driver.close()


if __name__ == "__main__":
    main()
