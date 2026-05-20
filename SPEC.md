# SPEC.md — 成人用品测评站 · 完整项目规格

---

## 1. Objective

### 项目目标

**成人用品英文测评站**，面向海外市场（Google SEO + 联盟变现），后期独立站。

**目标用户：** 海外成人消费者，通过 Google 搜索"best [product category]" 寻找可信评测内容。

**核心功能：**
- 内容团队在飞书写纯图文 → 后台同步到 GitHub → Astro 静态生成 → Cloudflare Pages 托管
- 后台（/admin）管理所有内容：文章/栏目/导航/页面/SEO/联盟链接/网站设置
- 联盟链接直接嵌入文章变现

**成功标准：**
- 网站能正常访问，Google 能爬取
- 文章从飞书同步到上线 < 10 分钟
- 联盟链接正确展示且可追踪

---

## 2. Tech Stack

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| **网站框架** | Astro 4.x | 静态站点生成，SEO友好，构建快 |
| **后台框架** | React 18 + Vite | 单页应用，跑在 /admin 路由下 |
| **样式** | Tailwind CSS 3.x | 原子化样式，快速开发 |
| **内容存储** | Cloudflare KV | 存储文章配置/SEO/联盟链接映射 |
| **Serverless** | Cloudflare Workers | 处理飞书API、GitHub API 调用 |
| **部署** | Cloudflare Pages | Astro 静态站 + /admin 应用 |
| **数据格式** | Markdown + Frontmatter | Astro 内容集合 |
| **外部 API** | 飞书开放平台 API | 读取共享文件夹文档内容 |
| **版本控制** | GitHub | 源码 + 内容（Markdown）存储 |
| **域名/CDN** | Cloudflare | DNS + 免费 CDN |

### 关键依赖版本

```json
{
  "astro": "^4.16.0",
  "@astrojs/react": "^3.6.0",
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "tailwindcss": "^3.4.0",
  "wrangler": "^3.80.0",
  "react-router-dom": "^6.26.0"
}
```

---

## 3. Commands

```bash
# 本地开发
npm run dev          # 启动 Astro 开发服务器 (localhost:4321)
npm run admin        # 启动后台开发服务器 (localhost:4321/admin)

# 构建
npm run build        # 构建 Astro 静态站
npm run build:admin  # 构建后台应用
npm run preview      # 预览构建结果

# 部署
npx wrangler deploy  # 部署 Cloudflare Workers

# 内容同步（可选脚本）
npm run sync:feishu  # 从飞书同步文档列表
```

---

## 4. Project Structure

```
/
├── src/
│   ├── components/          # Astro 公共组件
│   │   ├── ArticleCard.astro
│   │   ├── CategoryNav.astro
│   │   ├── Footer.astro
│   │   ├── Header.astro
│   │   ├── AffiliateCTA.astro
│   │   └── SEOHead.astro
│   │
│   ├── content/
│   │   ├── blog/            # Astro 内容集合 - 文章 Markdown
│   │   │   └── [slug].md    # 单篇文章
│   │   ├── config.ts        # Astro 内容集合定义
│   │   └── affiliates/      # 联盟链接数据
│   │
│   ├── layouts/
│   │   ├── BaseLayout.astro # 全站基础布局
│   │   ├── ArticleLayout.astro
│   │   └── AdminLayout.astro
│   │
│   ├── pages/               # Astro 页面
│   │   ├── index.astro      # 首页
│   │   ├── [category]/
│   │   │   └── index.astro  # 栏目列表页
│   │   ├── [slug].astro     # 文章详情页
│   │   └── admin/           # 后台页面（静态壳，Astro SSR）
│   │       └── [...admin].astro
│   │
│   └── styles/
│       └── global.css
│
├── admin/                   # 后台应用（React SPA）
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/         # 基础 UI 组件
│   │   │   ├── ArticleList.tsx
│   │   │   ├── ArticleEditor.tsx
│   │   │   ├── CategoryManager.tsx
│   │   │   ├── NavigationEditor.tsx
│   │   │   ├── PageManager.tsx
│   │   │   ├── SiteSettings.tsx
│   │   │   ├── AffiliateManager.tsx
│   │   │   └── Dashboard.tsx
│   │   ├── lib/
│   │   │   ├── cf-kv.ts    # Cloudflare KV 操作
│   │   │   ├── feishu.ts   # 飞书 API 封装
│   │   │   ├── github.ts   # GitHub API 封装
│   │   │   └── types.ts    # 类型定义
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Articles.tsx
│   │   │   ├── Categories.tsx
│   │   │   ├── Navigation.tsx
│   │   │   ├── Pages.tsx
│   │   │   ├── Affiliates.tsx
│   │   │   └── Settings.tsx
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── index.html
│
├── workers/                 # Cloudflare Workers（可选 Serverless 函数）
│   ├── feishu-sync.ts       # 飞书文档同步 Worker
│   └── github-deploy.ts     # 触发 GitHub Actions Worker
│
├── wrangler.toml            # Cloudflare Workers 配置
├── astro.config.mjs         # Astro 配置
├── tailwind.config.mjs
├── package.json
└── SPEC.md
```

---

## 5. Data Model（Cloudflare KV）

### KV 命名空间

```
articles/all_ids        → string[]  所有文章 ID 列表
articles/{id}/meta      → ArticleMeta JSON
articles/{id}/seo       → ArticleSEO JSON
articles/{id}/affiliate → ArticleAffiliate[] JSON

categories/all_ids       → string[]
categories/{id}/meta     → CategoryMeta JSON
categories/{id}/config  → CategoryConfig JSON

navigation/menu_items    → NavItem[] JSON

pages/all_ids            → string[]
pages/{id}/meta          → PageMeta JSON
pages/{id}/content       → string (Markdown)

affiliates/all_ids       → string[]
affiliates/{id}/meta     → AffiliateLink JSON

site/settings            → SiteSettings JSON
site/stats               → SiteStats JSON
```

### 数据结构定义

```typescript
// 文章元数据
interface ArticleMeta {
  id: string;
  slug: string;
  feishuDocId: string;
  feishuDocUrl: string;
  title: string;
  categoryId: string;
  status: 'draft' | 'published' | 'updated' | 'deleted';
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  featuredImage?: string;
  excerpt?: string;
}

// 文章 SEO 配置
interface ArticleSEO {
  articleId: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl?: string;
  ogImage?: string;
  noIndex?: boolean;
}

// 文章联盟链接配置
interface ArticleAffiliate {
  articleId: string;
  links: AffiliateLink[];
  displayType: 'inline' | 'floating' | 'cta_button' | 'both';
}

interface AffiliateLink {
  id: string;
  platform: 'amazon' | 'senseful' | 'awin' | 'other';
  url: string;
  anchorText: string;
  position?: 'top' | 'middle' | 'bottom';
}

// 栏目
interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string;
  parentId?: string;
  order: number;
  createdAt: string;
}

// 导航项
interface NavItem {
  id: string;
  label: string;
  type: 'category' | 'page' | 'external';
  url?: string;
  targetId?: string;
  order: number;
}

// 静态页面
interface Page {
  id: string;
  slug: string;
  title: string;
  content: string;
  seoTitle?: string;
  seoDescription?: string;
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
}

// 全站设置
interface SiteSettings {
  siteName: string;
  siteUrl: string;
  defaultSeo: {
    homeTitle: string;
    homeDescription: string;
    defaultOgImage?: string;
  };
  footer: {
    copyright: string;
    aboutText?: string;
    contactEmail?: string;
    socialLinks?: { platform: string; url: string }[];
  };
  affiliateDisclosure: string;
}

// 联盟链接（统一管理）
interface AffiliateLinkItem {
  id: string;
  platform: 'amazon' | 'senseful' | 'awin' | 'other';
  name: string;
  url: string;
  status: 'active' | 'inactive';
  createdAt: string;
}
```

---

## 6. Code Style

### Astro 组件

```astro
---
interface Props {
  slug: string;
  category: string;
}
const { slug, category } = Astro.props;
const article = await getEntry('blog', slug);
const seoTitle = article.data.seo?.metaTitle || article.data.title;
---
<html>
  <head>
    <title>{seoTitle}</title>
    <meta name="description" content={article.data.seo?.metaDescription} />
  </head>
  <body>
    <h1>{article.data.title}</h1>
    <Fragment set:html={article.body} />
  </body>
</html>
```

### React 后台组件

```tsx
export function ArticleList() {
  const [articles, setArticles] = useState<ArticleMeta[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchArticles() {
    setLoading(true);
    const data = await cfKvGet('articles/all_ids');
    setLoading(false);
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">文章管理</h1>
      {loading ? <LoadingSpinner /> : <ArticleTable data={articles} />}
    </div>
  );
}
```

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件 | kebab-case | `article-list.tsx`, `feishu-sync.ts` |
| React 组件 | PascalCase | `ArticleList.tsx` |
| 函数 | camelCase | `fetchArticles()` |
| KV keys | snake_case | `articles/all_ids` |
| 类型/接口 | PascalCase | `ArticleMeta`, `Category` |

---

## 7. Testing Strategy

| 层级 | 工具 |
|------|------|
| Unit | Vitest（KV 函数、API 封装） |
| Component | React Testing Library |
| E2E | Playwright（发布流程、联盟链接渲染） |

---

## 8. Boundaries

### Always（必须遵守）

- **提交前跑测试** — `npm run test` 通过才能 commit
- **敏感信息不进 Git** — `.env` 文件在 `.gitignore`，Secrets 用 Cloudflare Wrangler secrets
- **先更新 SPEC 再改代码** — 数据模型变更必须先更新 SPEC.md
- **FTC 披露合规** — 所有联盟链接文章必须包含披露文案
- **KV 操作统一封装** — 不允许直接调用 `KV namespace`，必须走 `cf-kv.ts` 封装层
- **Soft-delete** — 删文章用 `status: 'deleted'`，不物理删除

### Ask First（改动前先确认）

- 增加新的 Cloudflare Workers 函数
- 修改数据模型
- 添加新的 npm 依赖
- 改变 Astro 内容集合结构

### Never（绝对不做）

- 联盟链接硬编码到代码，必须走后台配置
- 飞书 App Secret 进前端代码，必须走 Workers
- `/admin` 暴露在无验证状态
- 任何用户隐私数据进 KV

---

## 9. Phases

### Phase 1 — MVP（MVP 能上线）
- [ ] Astro 基础站点
- [ ] Cloudflare Pages + GitHub 自动构建
- [ ] 后台框架 + 登录验证
- [ ] 文章 CRUD（手动 Markdown）
- [ ] 栏目管理
- [ ] 导航管理
- [ ] 文章详情页 + 栏目页 + 首页
- [ ] 联盟链接硬编码演示

### Phase 2 — 后台完整功能
- [ ] Cloudflare KV 存储层
- [ ] 后台：文章列表 + 增删改
- [ ] 后台：栏目管理
- [ ] 后台：导航管理
- [ ] 后台：SEO 设置
- [ ] 后台：网站设置
- [ ] 静态页面管理

### Phase 3 — 飞书集成
- [ ] 飞书 API 连接（读共享文件夹文档列表）
- [ ] 后台：从飞书同步文章
- [ ] 飞书文档 → Markdown 转换
- [ ] GitHub API 写入

### Phase 4 — 联盟功能
- [ ] 联盟链接管理后台
- [ ] 联盟链接：inline / floating / CTA button
- [ ] 追踪短链

### Phase 5 — 完善
- [ ] 仪表盘
- [ ] sitemap + 自动推送
- [ ] 性能优化

---

## 10. Open Questions（已确认）

| # | 问题 | 确认答案 |
|---|------|---------|
| 1 | 后台登录方式？ | **简单密码（单用户）** |
| 2 | 飞书栏目如何映射？ | **后台手动选择栏目**（飞书只负责写图文） |
| 3 | 图片处理？ | **下载到 GitHub**（随 Markdown 一起提交） |
| 4 | 是否需要多语言？ | **只做英文，预留 i18n 接口** |
| 5 | 域名？ | **未购买**（先用 Cloudflare Pages 临时域名上线） |

---

**SPEC.md 状态：已确认，可进入 Phase 1 实施。**
