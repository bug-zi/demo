// 话术资料库三节检查：①数据完整性 ②收藏/自建存储纯函数 ③视图交互（jsdom）。
// 只测本模块（不 import main.js），Phase A 与 2.0 并行期间的独立回归闸门。
const fail = (msg) => {
  console.error('✗', msg);
  process.exit(1);
};

// ── 动态加载被测模块：缺文件时给出干净的红，而不是堆栈崩 ──
let SCENES, TYPES, COMEBACKS, notes;
try {
  ({ SCENES, TYPES, COMEBACKS } = await import('../src/data/comebacks.js'));
  notes = await import('../src/lib/notes.js');
} catch (err) {
  fail(`模块还没实现或加载失败：${err.message}`);
}

// ── 内存版 localStorage 桩：第 2 节可注入、可换成 undefined ──
function fakeStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// 1. 数据完整性：120 条全量、schema 逐条过、分布达标
{
  if (COMEBACKS.length !== 120) fail(`内置话术应 120 条，实际 ${COMEBACKS.length}`);
  if (SCENES.length !== 8) fail(`场景登记表应 8 项，实际 ${SCENES.length}`);
  if (TYPES.length !== 3) fail(`类型登记表应 3 项，实际 ${TYPES.length}`);

  const sceneIds = new Set(SCENES.map((s) => s.id));
  const typeIds = new Set(TYPES.map((t) => t.id));
  if (sceneIds.has('mine')) fail('mine 是来源筛选轴的保留值，不能注册为场景 id');

  const seen = new Set();
  const perScene = new Map(SCENES.map((s) => [s.id, 0]));
  const perType = new Map(TYPES.map((t) => [t.id, 0]));
  COMEBACKS.forEach((c, i) => {
    const where = `第 ${i + 1} 条（${c.id}）`;
    if (!c.id || seen.has(c.id)) fail(`${where} id 缺失或重复`);
    seen.add(c.id);
    if (typeof c.text !== 'string' || !c.text.trim()) fail(`${where} text 为空`);
    if (!sceneIds.has(c.scene)) fail(`${where} scene「${c.scene}」不在登记表`);
    if (!typeIds.has(c.type)) fail(`${where} type「${c.type}」不在登记表`);
    if (typeof c.tip !== 'string' || !c.tip.trim()) fail(`${where} tip 为空`);
    if (!Array.isArray(c.tags) || c.tags.length === 0 || c.tags.some((t) => typeof t !== 'string' || !t.trim())) {
      fail(`${where} tags 应为非空字符串数组`);
    }
    perScene.set(c.scene, perScene.get(c.scene) + 1);
    perType.set(c.type, perType.get(c.type) + 1);
  });
  for (const [id, n] of perScene) if (n < 10) fail(`场景 ${id} 仅 ${n} 条（应 ≥10）`);
  for (const [id, n] of perType) if (n < 15) fail(`类型 ${id} 仅 ${n} 条（应 ≥15）`);

  const first = COMEBACKS[0];
  if (first.id !== 'c001' || first.text !== '你说得对。' || first.scene !== 'online' || first.type !== 'guard') {
    fail(`c001 应与草稿首行一致，实际 ${JSON.stringify(first)}`);
  }
  if (!first.tags.includes('杠精') || !first.tags.includes('万能')) fail('c001 标签应为 [杠精, 万能]');
  console.log(`✓ 数据完整性：120 条 / 8 场景各 ≥10 / 3 类型各 ≥15，c001 与草稿一致`);
}

// 2. 存储纯函数：坏数据收敛、toggle/upsert/delete 语义、无存储降级
{
  globalThis.localStorage = fakeStore();

  // 收藏：空库 → []；save 去重；坏 JSON / 非字符串数组收敛
  if (notes.loadFavorites().length !== 0) fail('空库 loadFavorites 应为 []');
  const saved = notes.saveFavorites(['c002', 'c001', 'c002']);
  if (saved.length !== 2 || saved[0] !== 'c002' || saved[1] !== 'c001') fail(`saveFavorites 应去重保序，实际 ${JSON.stringify(saved)}`);
  if (JSON.stringify(notes.loadFavorites()) !== JSON.stringify(['c002', 'c001'])) fail('save→load 往返不一致');
  globalThis.localStorage.setItem('gang-ai:favorites:v1', '{oops');
  if (notes.loadFavorites().length !== 0) fail('坏 JSON 的收藏应收敛为 []');
  globalThis.localStorage.setItem('gang-ai:favorites:v1', '[1,"c001"]');
  const mixedFav = notes.loadFavorites();
  if (mixedFav.length !== 1 || mixedFav[0] !== 'c001') fail(`非字符串收藏条目应被丢弃，实际 ${JSON.stringify(mixedFav)}`);

  // toggleFavorite：加 / 减 / 幂等 / 纯函数不改入参
  const t1 = notes.toggleFavorite([], 'a');
  if (t1.length !== 1 || t1[0] !== 'a') fail('toggleFavorite 空表加一项失败');
  const before = ['a', 'b'];
  const t2 = notes.toggleFavorite(before, 'a');
  if (t2.length !== 1 || t2[0] !== 'b') fail('toggleFavorite 应能取消收藏');
  if (before.length !== 2) fail('toggleFavorite 不该改入参数组');
  const t3 = notes.toggleFavorite(['a'], 'a');
  if (t3.length !== 0) fail('toggle 取消后应为空');

  // 笔记：空库 → []；坏数据逐条收敛
  if (notes.loadNotes().length !== 0) fail('空库 loadNotes 应为 []');
  globalThis.localStorage.setItem('gang-ai:notes:v1', 'not json');
  if (notes.loadNotes().length !== 0) fail('坏 JSON 的笔记应收敛为 []');
  globalThis.localStorage.setItem(
    'gang-ai:notes:v1',
    JSON.stringify([{ id: 'n1', text: ' 好话 ', scene: 'online', type: 'guard', tip: '何时', tags: ['x'] }, { id: 'n2' }, 'garbage']),
  );
  const repaired = notes.loadNotes();
  if (repaired.length !== 1) fail(`不合格笔记条目应被丢弃（保留 1 条），实际 ${repaired.length}`);
  if (repaired[0].text !== '好话') fail(`text 应被 trim，实际「${repaired[0].text}」`);

  // upsertNote：新建分配 id/createdAt；更新保 id 刷 updatedAt；空文本抛错；纯函数
  const empty = [];
  const created = notes.upsertNote(empty, { text: '新句', scene: 'family', type: 'cool', tip: '', tags: [] });
  if (created.length !== 1 || empty.length !== 0) fail('upsertNote 应返回新数组且不改入参');
  const note = created[0];
  if (!note.id.startsWith('n-') || !note.createdAt) fail(`新建笔记应有 n- id 与 createdAt，实际 ${JSON.stringify(note)}`);
  if (note.tags.length !== 0 && !Array.isArray(note.tags)) fail('tags 缺省应为数组');
  const afterWait = notes.upsertNote(created, { id: note.id, text: '改句', scene: 'family', type: 'cool', tip: 't', tags: ['a'] });
  if (afterWait.length !== 1 || afterWait[0].text !== '改句') fail('更新应原位替换');
  if (afterWait[0].createdAt !== note.createdAt || !afterWait[0].updatedAt) fail('更新应保留 createdAt 并刷 updatedAt');
  let threw = false;
  try {
    notes.upsertNote([], { text: '   ', scene: 'family', type: 'cool' });
  } catch {
    threw = true;
  }
  if (!threw) fail('空文本 upsertNote 应抛错');

  // deleteNote
  const del = notes.deleteNote(afterWait, note.id);
  if (del.length !== 0 || afterWait.length !== 1) fail('deleteNote 应返回删除后的新数组');

  // storage 不可用：全链路安静降级
  globalThis.localStorage = undefined;
  if (notes.loadFavorites().length !== 0 || notes.loadNotes().length !== 0) fail('无存储时 load 应回空');
  if (notes.saveFavorites(['a']).length !== 1) fail('无存储时 saveFavorites 应原样返回');
  let noThrow = true;
  try {
    notes.saveNotes([{ id: 'n-x', text: 'x', scene: 'online', type: 'guard', tags: [] }]);
  } catch {
    noThrow = false;
  }
  if (!noThrow) fail('无存储时 saveNotes 不该抛');
  console.log('✓ 存储纯函数：坏数据收敛 / toggle·upsert·delete 语义 / 无存储降级 全部通过');
}

// 3. 视图交互（jsdom）：四轴筛选 / 搜索 / 星标 / 自建增删改 / 返回
{
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  let createLibraryView;
  try {
    ({ createLibraryView } = await import('../src/ui/library.js'));
  } catch (err) {
    fail(`视图模块还没实现或加载失败：${err.message}`);
  }

  // 数据侧：两条收藏 + 一条样例笔记，回调直接走 notes.js 纯函数
  let favorites = ['c001', 'c120'];
  let notesList = [
    { id: 'n-demo', text: '自建样例句', scene: 'dorm', type: 'guard', tip: '测试用', tags: ['测试'], createdAt: 1 },
  ];
  const calls = { fav: [], save: [], del: [], back: 0 };
  const view = createLibraryView({
    getFavorites: () => favorites,
    getNotes: () => notesList,
    onToggleFavorite: (id) => {
      favorites = notes.toggleFavorite(favorites, id);
      calls.fav.push(id);
    },
    onSaveNote: (draft) => {
      notesList = notes.upsertNote(notesList, draft);
      calls.save.push(draft);
    },
    onDeleteNote: (id) => {
      notesList = notes.deleteNote(notesList, id);
      calls.del.push(id);
    },
    onBack: () => {
      calls.back += 1;
    },
  });
  document.body.append(view);

  const $ = (sel) => view.querySelector(sel);
  const $$ = (sel) => [...view.querySelectorAll(sel)];
  const cards = () => $$('.entry-card');
  const fire = (el, type) => el.dispatchEvent(new dom.window.Event(type, { bubbles: true }));

  // 初始：120 内置 + 1 笔记，笔记排最前且带徽标
  if (cards().length !== 121) fail(`初始应渲染 121 张卡（120 内置 + 1 笔记），实际 ${cards().length}`);
  if (!cards()[0].textContent.includes('自建样例句')) fail('笔记应排在列表最前');
  if (!cards()[0].querySelector('.mine-badge')) fail('自建卡应有「自建」徽标');

  // 场景筛选：family → 15（笔记 dorm 不匹配，被筛掉）
  $('[data-scene="family"]').click();
  const familyCount = COMEBACKS.filter((c) => c.scene === 'family').length;
  if (cards().length !== familyCount) fail(`场景筛选后应 ${familyCount} 张，实际 ${cards().length}`);

  // 类型筛选叠加：family × cool
  $('[data-type="cool"]').click();
  const fcCount = COMEBACKS.filter((c) => c.scene === 'family' && c.type === 'cool').length;
  if (cards().length !== fcCount) fail(`场景×类型应 ${fcCount} 张，实际 ${cards().length}`);

  // 复位 + 仅收藏 → 2 张；点星取消一条 → 1 张
  $('[data-scene="all"]').click();
  $('[data-type="all"]').click();
  $('[data-only-fav]').click();
  if (cards().length !== 2) fail(`仅收藏应 2 张，实际 ${cards().length}`);
  const star = cards()[0].querySelector('.fav-btn');
  if (!star || star.textContent !== '★') fail('已收藏的卡星标应为 ★');
  star.click();
  if (calls.fav[calls.fav.length - 1] !== 'c001') fail('点星标应回调 onToggleFavorite(id)');
  if (cards().length !== 1) fail('取消收藏后列表应剩 1 张');

  // 搜索：text/tip/tags 联合匹配，期望值用同谓词从数据侧算
  $('[data-only-fav]').click();
  const search = $('.lib-search');
  search.value = '加班';
  fire(search, 'input');
  const matchCount = COMEBACKS.filter((c) => `${c.text} ${c.tip} ${c.tags.join(' ')}`.includes('加班')).length;
  if (matchCount === 0) fail('测试搜索词选得不对，先换一个');
  if (cards().length !== matchCount) fail(`搜索「加班」应 ${matchCount} 张，实际 ${cards().length}`);

  // 「自建」筛选：只剩笔记
  search.value = '';
  fire(search, 'input');
  $('[data-scene="mine"]').click();
  if (cards().length !== 1 || !cards()[0].textContent.includes('自建样例句')) fail('「自建」筛选应只剩 1 条笔记');

  // composer 新建：填表保存 → 回调字段齐全 → 列表出现新句
  $('.note-add-btn').click();
  if (!$('.note-form')) fail('点「+ 自建话术」应出现表单');
  $('.nf-text').value = '新写的句子';
  $('.nf-scene').value = 'online';
  $('.nf-type').value = 'counter';
  $('.nf-tip').value = '测试何时用';
  $('.nf-tags').value = '测试, 搜索';
  $('.note-save-btn').click();
  if (calls.save.length !== 1) fail('保存应回调 onSaveNote 一次');
  const draft1 = calls.save[0];
  if (draft1.text !== '新写的句子' || draft1.scene !== 'online' || draft1.type !== 'counter' || draft1.tip !== '测试何时用') {
    fail(`新建草稿字段不对：${JSON.stringify(draft1)}`);
  }
  if (JSON.stringify(draft1.tags) !== JSON.stringify(['测试', '搜索'])) fail(`标签应切干净：${JSON.stringify(draft1.tags)}`);
  if (cards().length !== 2 || !cards().some((c) => c.textContent.includes('新写的句子'))) fail('保存后列表应出现新笔记');
  if ($('.note-form')) fail('保存成功后表单应收起');

  // 空文本保存：表单内报错、不崩、不关
  $('.note-add-btn').click();
  $('.nf-text').value = '   ';
  $('.note-save-btn').click();
  if (!$('.form-error')) fail('空文本保存应在表单内提示错误');
  if (calls.save.length !== 1) fail('空文本不该产生第二次保存回调');
  $('.note-cancel-btn').click();
  if ($('.note-form')) fail('取消应收起表单');

  // 编辑：预填原文，保存带原 id
  $$('.entry-edit-btn')[0].click();
  if ($('.nf-text').value !== '自建样例句') fail('编辑表单应预填原文');
  $('.nf-text').value = '改后的句子';
  $('.note-save-btn').click();
  const draft2 = calls.save[calls.save.length - 1];
  if (draft2.id !== 'n-demo' || draft2.text !== '改后的句子') fail(`编辑保存应带原 id 且更新文本：${JSON.stringify(draft2)}`);

  // 删除：回调收到 id，列表实时少一张
  const beforeDel = cards().length;
  $$('.entry-del-btn')[0].click();
  if (calls.del[calls.del.length - 1] !== 'n-demo') fail('删除应回调 onDeleteNote(id)');
  if (cards().length !== beforeDel - 1) fail('删除后列表应少一张');

  // 返回大厅
  $('.back-btn').click();
  if (calls.back !== 1) fail('返回按钮应回调 onBack');

  // 安全渲染：源码里不许出现 innerHTML
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/library.js', import.meta.url), 'utf8');
  if (src.includes('innerHTML')) fail('library.js 不许使用 innerHTML');

  console.log('✓ 视图交互：筛选/搜索/星标/自建增删改/返回 全部通过');
}

console.log('library-check：全部通过');
