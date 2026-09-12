/**
 * 极简 DOM 构造器。
 *
 * 唯一的铁律：文本一律走 textContent。模型产出、用户输入、API 错误信息
 * 全部从这儿落地，绝不拼 HTML 字符串（见计划书 §6.5）。
 */

/**
 * 返回按钮统一出口：arrow_back 图标 + 文字胶囊。
 * 样式在 styles.css 的 .back-btn（wall/library/arena.css 复用同一类）。
 */
export function backBtn(label, onclick, extraClass = '') {
  return h(
    'button',
    { class: extraClass ? `back-btn ${extraClass}` : 'back-btn', type: 'button', onclick },
    h('span', { class: 'icon i-arrow-back', 'aria-hidden': 'true' }),
    h('span', { text: label }),
  );
}

export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}
