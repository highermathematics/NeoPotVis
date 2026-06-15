#!/bin/bash
# =============================================================================
# Neo4j HotpotQA 极速导入 - neo4j-admin import 离线方式
# 
# 这是 Neo4j 最快的导入方式，直接操作底层存储文件，速度比 Bolt 快 10-50 倍。
# 缺点：需要停库、需要提前将 JSON 转为 CSV。
#
# 使用方法:
#   1. chmod +x import_neo4j_admin.sh
#   2. 先把 JSON 转成 CSV: python json_to_csv.py validation.json
#   3. 停掉 Neo4j:   sudo systemctl stop neo4j
#                   # 或 docker stop neo4j
#   4. 运行:         ./import_neo4j_admin.sh /path/to/csv_dir
#   5. 启动 Neo4j:  sudo systemctl start neo4j
# =============================================================================

set -e

CSV_DIR="${1:-./csv_output}"
NEO4J_HOME="${NEO4J_HOME:-/var/lib/neo4j}"
DB_NAME="${NEO4J_DB:-neo4j}"

echo "============================================================"
echo "Neo4j Admin 离线导入"
echo "============================================================"
echo "CSV 目录: $CSV_DIR"
echo "Neo4j 目录: $NEO4J_HOME"
echo "数据库: $DB_NAME"
echo ""

# 检查文件
echo "[1/3] 检查文件..."
for f in "$CSV_DIR"/nodes_*.csv "$CSV_DIR"/rels_*.csv; do
    if [ -f "$f" ]; then
        echo "  OK: $(basename $f)"
    fi
done

# 清空旧数据
echo ""
echo "[2/3] 清空旧数据库数据..."
sudo rm -rf "$NEO4J_HOME/data/databases/$DB_NAME"
sudo rm -rf "$NEO4J_HOME/data/transactions/$DB_NAME"
echo "  已清除"

# 执行导入
echo ""
echo "[3/3] 执行 neo4j-admin import..."
echo "  (这可能需要几分钟，取决于数据量)"
echo ""

sudo neo4j-admin database import full "$DB_NAME" \
    --nodes=Question="$CSV_DIR/nodes_question.csv" \
    --nodes=Answer="$CSV_DIR/nodes_answer.csv" \
    --nodes=Document="$CSV_DIR/nodes_document.csv" \
    --nodes=Sentence="$CSV_DIR/nodes_sentence.csv" \
    --relationships=HAS_ANSWER="$CSV_DIR/rels_has_answer.csv" \
    --relationships=RELATED_TO="$CSV_DIR/rels_related_to.csv" \
    --relationships=HAS_SUPPORTING_FACT="$CSV_DIR/rels_supporting_fact.csv" \
    --relationships=CONTAINS="$CSV_DIR/rels_contains.csv" \
    --relationships=BRIDGE_BETWEEN="$CSV_DIR/rels_bridge.csv" \
    --relationships=RELATED_TO_COMP="$CSV_DIR/rels_comparison.csv" \
    --delimiter="," \
    --array-delimiter=";" \
    --quote='"' \
    --multiline-fields=true \
    --overwrite-destination \
    --verbose

echo ""
echo "============================================================"
echo "导入完成!"
echo ""
echo "现在请启动 Neo4j:"
echo "  sudo systemctl start neo4j"
echo "  # 或: docker start neo4j"
echo ""
echo "然后验证:"
echo "  MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC"
echo "============================================================"
