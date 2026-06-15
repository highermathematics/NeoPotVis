# Neo4j HotpotQA 多跳问答可视化系统

基于 Neo4j 图数据库的 HotpotQA 多跳问答数据集可视化与分析平台，支持图数据可视化、多跳路径查询、全文检索、聚类分析和 Cypher 查询控制台。


---

## 项目简介

本项目将 HotpotQA 多跳问答数据集导入 Neo4j 图数据库，构建了包含 5 种节点类型和 6 种关系类型的知识图谱，并提供了一个完整的 Web 可视化界面，支持中英文切换。

### 功能特性

| 模块 | 说明 |
|------|------|
| **图谱可视化** | 基于 Cytoscape.js 的交互式力导向图，支持缩放/平移/节点筛选/高亮 |
| **多跳查询** | 可视化展示从问题到答案的推理路径，每跳的文档和支撑句子 |
| **全文检索** | 按 Question ID、问题内容、答案、文档名称搜索 |
| **聚类分析** | 按问题类型、难度级别、高频文档进行聚类，含饼图/柱状图 |
| **Cypher 控制台** | 模拟 Cypher 查询语言执行，支持 MATCH-WHERE-RETURN-LIMIT |
| **数据统计** | 节点/边统计、类型分布、难度分布 |
| **中英文切换** | 完整国际化支持，自动保存语言偏好 |

### 技术栈

**前端**
- React 19 + TypeScript + Vite + Tailwind CSS
- Cytoscape.js（图可视化）+ shadcn/ui 组件
- 国际化（React Context + localStorage）

**后端**
- FastAPI（Python）
- Neo4j Python Driver

**数据库**
- Neo4j（图数据库）

---

## 快速开始

### 1. 环境准备

**必要条件：**
- Node.js 18+（推荐 20+）
- Python 3.10+
- Neo4j 5.x（已安装 APOC 插件）
- npm 或 yarn

### 2. 克隆与安装

```bash
git clone https://github.com/yourusername/neo4j-hotpotqa.git
cd neo4j-hotpotqa

# 安装前端依赖
cd app
npm install

# 安装后端依赖
cd ../api
pip install -r requirements.txt
```

### 3. 导入数据到 Neo4j

提供 4 种导入方式，根据你的环境和需求选择：

#### 方式 A：极速 Python 导入（推荐一般场景）

```bash
# 首次导入（自动清空已有数据）
python import_neo4j_rapid.py \
    --password YOUR_PASSWORD \
    --files data/validation-00000-of-00001.json \
    --clear

# 断点续传（跳过已有数据，不删除）
python import_neo4j_rapid.py \
    --password YOUR_PASSWORD \
    --files data/validation-00000-of-00001.json \
    --skip-existing
```

**特点：** 全局 Entity 去重合并，超大批次导入，支持断点续传

| 参数 | 说明 |
|------|------|
| `--password` | Neo4j 密码（**必需**） |
| `--files` | JSON 文件路径列表（**必需**） |
| `--uri` | Neo4j Bolt 地址，默认 `bolt://localhost:7687` |
| `--database` | 数据库名称，默认 `neo4j` |
| `--clear` | 清空已有数据后重新导入 |
| `--skip-existing` | 跳过已导入的节点类型（断点续传） |

#### 方式 B：neo4j-admin 离线导入（最快，需停库）

```bash
# 1. JSON 转 CSV
python json_to_csv.py \
    data/validation-00000-of-00001.json \
    data/train-00000-of-00002.json \
    data/train-00001-of-00002.json

# 2. 停止 Neo4j
sudo systemctl stop neo4j

# 3. 离线导入
chmod +x import_neo4j_admin.sh
./import_neo4j_admin.sh ./csv_output

# 4. 启动 Neo4j
sudo systemctl start neo4j
```

**特点：** 直接写入底层存储文件，绕过 Bolt 协议，速度最快（10-30 秒）

#### 方式 C：完整版 Python 导入（含详细日志和验证）

```bash
# 编辑脚本中的 CONFIG 配置
vim import_to_neo4j.py
# 修改 password、json_files 等配置

python import_to_neo4j.py
```

**特点：** 完整的 6 步导入流程，详细日志，自动验证，支持 Entity 节点

### 4. 启动后端服务

```bash
cd api
uvicorn main:app --reload --port 8000
```

后端 API 默认运行在 `http://localhost:8000`，提供以下接口：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/stats` | GET | 数据库统计 |
| `/questions` | GET | 问题列表（分页） |
| `/questions/{qid}` | GET | 单个问题详情 |
| `/questions/{qid}/hops` | GET | 多跳路径 |
| `/search` | POST | 全文搜索 |
| `/shared-entities` | GET | 跨问题共享实体 |
| `/entity/{name}/questions` | GET | 实体关联问题 |
| `/graph/{qid}` | GET | 子图数据（可视化用） |
| `/cypher` | POST | Cypher 查询执行 |

### 5. 启动前端

```bash
cd app

# 修改 src/App.tsx 中的 USE_API = true（默认已启用）

npm run dev
```

浏览器打开 `http://localhost:3000`

---

## Neo4j 图数据模型

### 节点类型

| 标签 | 说明 | 属性 |
|------|------|------|
| **Question** | 问题节点 | `id`, `text`, `type` (bridge/comparison/composition), `level` (easy/medium/hard) |
| **Answer** | 答案节点 | `id`, `text` |
| **Document** | 支撑文档 | `id`, `title`, `qid`, `idx`, `sf` (是否支撑事实) |
| **Sentence** | 句子节点 | `id`, `text`, `idx`, `sf` (是否支撑事实) |
| **Entity** | 实体节点（全局去重） | `id` (标题本身), `name` |

### 关系类型

| 类型 | 起止节点 | 说明 |
|------|---------|------|
| **HAS_ANSWER** | Question → Answer | 问题与答案 |
| **RELATED_TO** | Question → Document | 问题与文档关联（含支撑标记） |
| **HAS_SUPPORTING_FACT** | Question → Document/Sentence | 支撑事实（含 hop 跳数） |
| **CONTAINS** | Document → Sentence | 文档包含句子 |
| **BRIDGE_BETWEEN** | Document → Document | 桥接关系（多跳路径） |
| **RELATED_TO** | Document → Document | 比较关系（compared_with） |
| **MENTIONS** | Document → Entity | 文档提及实体 |

### Entity 全局去重设计

相同标题在不同问题中**共享同一个 Entity 节点**，例如 "Ed Wood" 只有一个节点，所有提到它的 Document 都指向它。这实现了跨问题的知识关联：

```cypher
// 查询哪些不同的问题共享了同一个实体
MATCH (e:Entity)<-[:MENTIONS]-(:Document)<-[:RELATED_TO]-(q:Question)
WITH e, count(DISTINCT q) AS qc
WHERE qc > 1
RETURN e.name, qc ORDER BY qc DESC
```

---

## 部署到 GitHub Pages

### 1. 构建生产版本

```bash
cd app
npm run build
```

### 2. 部署

`dist/` 目录包含所有静态文件，可直接部署到 GitHub Pages：

```bash
# 方式一：gh-pages 分支
cd dist
git init
git add .
git commit -m "Deploy to GitHub Pages"
git push -f git@github.com:yourusername/neo4j-hotpotqa.git gh-pages

# 方式二：GitHub Actions（推荐）
# 见 .github/workflows/deploy.yml
```

### 3. GitHub Actions 自动部署

创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd app && npm install && npm run build
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./app/dist
```

---

## 项目结构

```
NeoPotVis/
├── app/                          # 前端 (React + Vite)
│   ├── src/
│   │   ├── components/           # 可视化组件
│   │   │   ├── GraphVisualization.tsx    # 图谱可视化
│   │   │   ├── MultiHopPanel.tsx         # 多跳查询
│   │   │   ├── SearchPanel.tsx           # 搜索检索
│   │   │   ├── ClusterPanel.tsx          # 聚类分析
│   │   │   ├── CypherPanel.tsx           # Cypher控制台
│   │   │   ├── StatsPanel.tsx            # 统计面板
│   │   │   └── LanguageSwitcher.tsx      # 语言切换
│   │   ├── services/             # API 服务
│   │   │   └── api.ts
│   │   ├── i18n/                 # 国际化
│   │   │   ├── I18nContext.tsx
│   │   │   └── translations.ts
│   │   ├── utils/                # 工具函数
│   │   │   └── graphBuilder.ts
│   │   ├── types/                # 类型定义
│   │   │   └── neo4j.ts
│   │   ├── App.tsx               # 主应用
│   │   └── main.tsx              # 入口
│   ├── public/data/              # 静态数据（备用）
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── api/                          # 后端 (FastAPI)
│   ├── main.py                   # API 主入口
│   └── requirements.txt
│
├── import_neo4j_rapid.py         # 极速导入脚本（推荐）
├── json_to_csv.py                # JSON 转 CSV 工具
├── import_neo4j_admin.sh         # neo4j-admin 离线导入
├── import_to_neo4j.py            # 完整版 Python 导入
│
└── README.md                     # 本文档
```

---

## 常见问题


### Q: 如何切换前端数据源（API / 本地 JSON）？

修改 `app/src/App.tsx`：

```typescript
const USE_API = true;   // 从 Neo4j API 查数据
const USE_API = false;  // 从本地 JSON 文件
```

### Q: 后端连接 Neo4j 失败？

检查环境变量或修改 `api/main.py`：

```python
NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "your_password"
```

### Q: Entity 标题冲突？

脚本使用**全局去重**策略：相同标题 = 同一个 Entity 节点。这是有意设计，用于实现跨问题实体关联。

---

## License

MIT

---

## 致谢

- [Neo4j](https://neo4j.com/)
- [Cytoscape.js](https://js.cytoscape.org/)
