# designs-specs ｜ 美术升级（AI 生图离线管线 + A1–A4 四批次资产）

> **依据**：总方案 §6（已立项 260912，覆盖范围=全量四类）。美术资产是**静态文件**，运行时零依赖、零新增 runtime 包；key 与网络只存在于生成期脚本。
> **前置**：开发者把 gpt-image2 的 `baseURL / API key / 模型名` 填入仓库根 `.env.art`（已 gitignore，模板已建好）。

## 1. 生成管线

```
风格指南定稿（本文 §3）→ 每批次先出 1–2 张小样 → 开发者拍板风格
  → 按批次清单批量生成（scripts/art/generate.mjs）
  → 输出 out/art-raw/{批次}/{name}.png（out/ 已 gitignore，不进仓库）
  → 开发者筛选定稿 → 统一压缩/裁切 → 提交 public/assets/art/…
```

### 1.1 环境契约（`.env.art`，已建模板）

```
ART_IMAGE_BASE_URL=   # 如 https://xxx/v1（脚本拼 /images/generations）
ART_IMAGE_API_KEY=
ART_IMAGE_MODEL=gpt-image-2
```

- 脚本从 `.env.art` 读取（简单 KV 解析，不引 dotenv 依赖）；key 缺失时脚本直接报错退出，不静默。
- key 不进对话、不进仓库、不进构建产物；`.env.art` 已在 `.gitignore`。

### 1.2 生成脚本规格（`scripts/art/generate.mjs`，随 A1 批次落地）

- Node 原生 `fetch`，POST `{BASE_URL}/images/generations`，body `{ model, prompt, size, n:1 }`，响应取 `b64_json` 落盘 PNG（OpenAI 兼容格式；字段对不上时打印响应结构并退出，便于适配中转差异）。
- **manifest 驱动**：`scripts/art/manifests/{batch}.json` 列出该批次全部条目 `{ name, prompt, size }`；支持 `--only name1,name2` 增量重生成、`--limit N` 小样模式。
- 限速与重试：串行 + 每张间隔 ≥2s；单张失败重试 2 次后跳过并在结尾汇总，不中断整批。
- 脚本与 manifest 提交仓库；`out/` 不提交。

## 2. 资产清单（四批次，合计 61–69 张）

| 批次 | 内容 | 数量 | 规格/命名 |
|---|---|---|---|
| A1 | 人设立绘头像（含现有 5 人重绘，全员统一风格） | 18（冲刺 24） | 512×512 PNG，`art/portraits/{personaId}.png`，主体居中于圆形安全区（直径 ~70%） |
| A2 | 场景背景：大厅/杠精房/谈判房/情商房（战报底图可选） | 4–5 | 1440×900 JPG（quality 80），`art/bg/{screenId}.jpg`，低饱和、四角留白可叠 UI |
| A3 | 演出与战报：胜/负分享卡装饰边框、破防时刻插画 | 3–4 | 边框 720×1000 PNG 中央镂空透明，`art/frame/{win|lose}.png`；插画方图 `art/spotlight/breakdown.png` |
| A4 | 成就徽章（称号卡面复用徽章） | 36 | 256×256 PNG，`art/badges/{achievementId}.png`，统一圆形底，边框色按档位（铜/银/金/王） |

## 3. 风格指南（生成 prompt 的统一约束，小样拍板后冻结）

- **统一基调**：中式现代漫画插画、明快平涂色块、干净单色渐变底、微夸张表情；**画面内绝对无文字**（UI 文案一律代码叠）。
- **双皮肤兼容**：资产自带浅色中性底、低饱和；blossom/midnight 由 CSS 叠半透明遮罩适配，图不做深浅两套。
- **负面词（每条 prompt 统一追加）**：写实照片、3D 渲染、文字、水印、签名、复杂背景细节、高饱和荧光色。
- 分档参考：杠精房偏冷色讽刺感 / 谈判房偏商务暖灰 / 情商房偏柔和治愈 / 徽章四档 = 铜棕·银灰·金·王紫金。

## 4. 接入规则

1. **一律 `public/assets/art/` + 绝对路径 `/assets/art/...`**——`<link>` 加载的 CSS 里 url() 不被 Vite 重写（既有踩坑结论），public + 绝对路径是唯一正确姿势；资源禁止放 `src/`。
2. **人设头像降级链**：persona 可选 `portrait: '/assets/art/portraits/{id}.png'` → 有则选人卡/对局气泡/分享卡三处用图，无则回退现有 Material SVG 图标；**字段缺失即降级**，A1 未到位前代码先落降级链。
3. **背景接入**：房间/大厅背景作为新增背景层叠在现有皮肤背景之上（CSS 分层 + `data-skin` 遮罩），不替换既有 blossom/midnight 背景图；遮罩浓度两皮肤各调。
4. **分享卡**：`share-card.js` 边框图加载失败 → 无边框原样导出（Canvas 画图已有降级惯例，沿用）；立绘头像加载失败 → 现有 Path2D 图标重绘路径兜底。
5. 体积预算：单 PNG ≤ 300KB（徽章 ≤ 80KB）、背景 JPG ≤ 400KB；`public/assets/art/` 总增量 ≤ 20MB。入库前统一压缩（尺寸就地缩定档，不引依赖可用现有工具链手动过一遍）。

## 5. 批次节奏与验收

- 顺序 A1 → A2 → A3 → A4；**每批次先 `--limit 1/2` 小样给开发者过目，拍板后量产**；拍板记录（选哪张、改了什么）随手记在本文件对应批次小节。
- 验收（每批次）：
  1. 两皮肤 × 明暗四态下页面截图过检（背景/头像/徽章各看一遍，无穿帮、无文字残留在图内）
  2. 断网可玩不受影响（资产全静态）
  3. 降级链验证：删掉任一 portrait/frame 文件，对应位置回退图标/无边框，不白块不报错
  4. 体积达标（`du -sh public/assets/art/`）
- `.env.art` 未填写前，本轨除本 spec 与脚本骨架外全部阻塞；**不阻塞 M1/B1**。
