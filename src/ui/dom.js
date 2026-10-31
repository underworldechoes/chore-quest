// Tiny safe DOM builder. Text always goes through textContent, so data from files,
// CSVs or storage can never be interpreted as HTML (no innerHTML anywhere in the app).

/**
 * el('p', { className: 'muted' }, 'text', childNode)
 * Props are assigned as DOM properties; `style` entries are set as CSS custom properties.
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  const { style, ...rest } = props;
  Object.assign(node, rest);
  for (const [name, value] of Object.entries(style ?? {})) node.style.setProperty(name, value);
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
