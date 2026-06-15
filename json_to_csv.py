#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 HotpotQA JSON 转为 Neo4j admin import 所需的 CSV 格式
v3.1 - 全局 Entity 去重：相同标题的 Entity 跨问题共享

用法:
    python json_to_csv.py validation.json
    python json_to_csv.py validation.json train-00000-of-00002.json train-00001-of-00002.json
    python json_to_csv.py --output ./my_csv validation.json
"""

import argparse
import csv
import json
import sys
import time
from pathlib import Path


def escape_csv(val):
    if val is None:
        return ""
    return str(val).replace('\n', ' ').replace('\r', ' ')


def json_to_csv(files, output_dir):
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    
    # 打开所有 CSV 文件
    f_q = open(out / "nodes_question.csv", "w", newline="", encoding="utf-8")
    f_a = open(out / "nodes_answer.csv", "w", newline="", encoding="utf-8")
    f_d = open(out / "nodes_document.csv", "w", newline="", encoding="utf-8")
    f_s = open(out / "nodes_sentence.csv", "w", newline="", encoding="utf-8")
    f_e = open(out / "nodes_entity.csv", "w", newline="", encoding="utf-8")  # 全局 Entity
    f_r_ha = open(out / "rels_has_answer.csv", "w", newline="", encoding="utf-8")
    f_r_rt = open(out / "rels_related_to.csv", "w", newline="", encoding="utf-8")
    f_r_sf = open(out / "rels_supporting_fact.csv", "w", newline="", encoding="utf-8")
    f_r_ct = open(out / "rels_contains.csv", "w", newline="", encoding="utf-8")
    f_r_br = open(out / "rels_bridge.csv", "w", newline="", encoding="utf-8")
    f_r_cp = open(out / "rels_comparison.csv", "w", newline="", encoding="utf-8")
    f_r_me = open(out / "rels_mentions.csv", "w", newline="", encoding="utf-8")  # Document->Entity
    
    w_q = csv.writer(f_q)
    w_a = csv.writer(f_a)
    w_d = csv.writer(f_d)
    w_s = csv.writer(f_s)
    w_e = csv.writer(f_e)
    w_ha = csv.writer(f_r_ha)
    w_rt = csv.writer(f_r_rt)
    w_sf = csv.writer(f_r_sf)
    w_ct = csv.writer(f_r_ct)
    w_br = csv.writer(f_r_br)
    w_cp = csv.writer(f_r_cp)
    w_me = csv.writer(f_r_me)
    
    # 写入 header
    w_q.writerow([":ID(Question)", "text", "type", "level"])
    w_a.writerow([":ID(Answer)", "text"])
    w_d.writerow([":ID(Document)", "title", "qid", "idx:int", "sf:boolean"])
    w_s.writerow([":ID(Sentence)", "text", "idx:int", "sf:boolean"])
    w_e.writerow([":ID(Entity)", "name"])  # 全局 Entity，id 用标题
    w_ha.writerow([":START_ID(Question)", ":END_ID(Answer)"])
    w_rt.writerow([":START_ID(Question)", ":END_ID(Document)", "sf:boolean"])
    w_sf.writerow([":START_ID(Question)", ":END_ID(Document)"])
    w_ct.writerow([":START_ID(Document)", ":END_ID(Sentence)", "idx:int"])
    w_br.writerow([":START_ID(Document)", ":END_ID(Document)", "hop:int", "qid"])
    w_cp.writerow([":START_ID(Document)", ":END_ID(Document)", "qid"])
    w_me.writerow([":START_ID(Document)", ":END_ID(Entity)", "type"])  # MENTIONS
    
    # 全局去重 Entity 集合
    global_entities = set()
    
    stats = {"q": 0, "d": 0, "s": 0, "br": 0, "cp": 0, "me": 0}
    
    for filepath in files:
        print(f"处理: {filepath} ...")
        t0 = time.time()
        
        with open(filepath, "r", encoding="utf-8") as f:
            questions = json.load(f)
        
        for q in questions:
            qid = q["id"]
            stats["q"] += 1
            
            # Question + Answer
            aid = f"ans_{qid}"
            w_q.writerow([qid, escape_csv(q["question"]), q["type"], q["level"]])
            w_a.writerow([aid, escape_csv(q["answer"])])
            w_ha.writerow([qid, aid])
            
            # Documents
            sf_titles = set(q["supporting_facts"]["title"])
            doc_id_map = {}
            
            for di, title in enumerate(q["context"]["title"]):
                did = f"doc_{qid}_{di}"
                doc_id_map[title] = did
                is_sf = title in sf_titles
                
                w_d.writerow([did, escape_csv(title), qid, di, "true" if is_sf else "false"])
                w_rt.writerow([qid, did, "true" if is_sf else "false"])
                
                if is_sf:
                    w_sf.writerow([qid, did])
                
                # Document -> 全局 Entity MENTIONS
                # Entity ID 就是标题本身（全局共享）
                entity_id = title.strip()
                if entity_id not in global_entities:
                    global_entities.add(entity_id)
                    w_e.writerow([entity_id, escape_csv(title)])
                w_me.writerow([did, entity_id, "title_entity"])
                stats["me"] += 1
                
                stats["d"] += 1
                
                # Sentences
                sents = q["context"]["sentences"][di] if di < len(q["context"]["sentences"]) else []
                sf_sent_ids = set()
                if is_sf:
                    sf_sent_ids = {q["supporting_facts"]["sent_id"][j]
                                   for j, t in enumerate(q["supporting_facts"]["title"]) if t == title}
                
                for si, stext in enumerate(sents):
                    sid = f"sent_{qid}_{di}_{si}"
                    sent_sf = si in sf_sent_ids
                    w_s.writerow([sid, escape_csv(stext), si, "true" if sent_sf else "false"])
                    w_ct.writerow([did, sid, si])
                    stats["s"] += 1
            
            # Bridge 关系
            if q["type"] == "bridge":
                sft = list(dict.fromkeys(q["supporting_facts"]["title"]))
                for i in range(len(sft) - 1):
                    if sft[i] in doc_id_map and sft[i+1] in doc_id_map:
                        w_br.writerow([doc_id_map[sft[i]], doc_id_map[sft[i+1]], i+1, qid])
                        stats["br"] += 1
            
            # Comparison 关系
            if q["type"] == "comparison":
                sft = list(dict.fromkeys(q["supporting_facts"]["title"]))
                for i in range(len(sft) - 1):
                    if sft[i] in doc_id_map and sft[i+1] in doc_id_map:
                        w_cp.writerow([doc_id_map[sft[i]], doc_id_map[sft[i+1]], qid])
                        stats["cp"] += 1
        
        print(f"  完成 ({time.time()-t0:.1f}s)")
    
    # 关闭文件
    for f in [f_q, f_a, f_d, f_s, f_e, f_r_ha, f_r_rt, f_r_sf, f_r_ct, f_r_br, f_r_cp, f_r_me]:
        f.close()
    
    # 汇总
    print(f"\n{'='*50}")
    print("CSV 转换完成!")
    print(f"{'='*50}")
    print(f"输出目录: {output_dir}")
    print(f"文件列表:")
    for f in sorted(out.iterdir()):
        mb = f.stat().st_size / 1024 / 1024
        print(f"  {f.name:35s} {mb:8.1f} MB")
    print(f"\n数据量:")
    print(f"  Question:  {stats['q']:,}")
    print(f"  Document:  {stats['d']:,}")
    print(f"  Sentence:  {stats['s']:,}")
    print(f"  Entity:    {len(global_entities):,} (全局去重后)")
    print(f"  Bridge:    {stats['br']:,}")
    print(f"  Compare:   {stats['cp']:,}")
    print(f"  MENTIONS:  {stats['me']:,}")
    print(f"\n下一步:")
    print(f"  1. 停掉 Neo4j: sudo systemctl stop neo4j")
    print(f"  2. 导入:       ./import_neo4j_admin.sh {output_dir}")
    print(f"  3. 启动:       sudo systemctl start neo4j")
    print(f"{'='*50}")


def main():
    parser = argparse.ArgumentParser(description="HotpotQA JSON 转 CSV (全局Entity去重)")
    parser.add_argument("files", nargs="+", help="JSON 文件路径")
    parser.add_argument("--output", "-o", default="./csv_output", help="CSV 输出目录")
    args = parser.parse_args()
    
    for f in args.files:
        if not Path(f).exists():
            print(f"错误: 文件不存在: {f}")
            sys.exit(1)
    
    json_to_csv(args.files, args.output)


if __name__ == "__main__":
    main()
