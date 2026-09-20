export type Attrs = Record<string, unknown>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined | false)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function applyAttrs(node: HTMLElement, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') {
      node.className = String(value);
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'dataset') {
      for (const [dataKey, dataValue] of Object.entries(value as Record<string, unknown>)) {
        if (dataValue === undefined || dataValue === null) continue;
        node.dataset[dataKey] = String(dataValue);
      }
    } else if (key === 'style') {
      Object.assign(node.style, value as Partial<CSSStyleDeclaration>);
    } else if (key === 'on') {
      for (const [event, handler] of Object.entries(value as Record<string, EventListener>)) {
        node.addEventListener(event, handler);
      }
    } else if (key === 'value' && node instanceof HTMLInputElement) {
      node.value = String(value);
    } else if (key === 'checked' && node instanceof HTMLInputElement) {
      node.checked = Boolean(value);
    } else if (key.startsWith('aria') || key === 'role' || key === 'tabindex') {
      node.setAttribute(key, String(value));
    } else {
      node.setAttribute(key, String(value));
    }
  }
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function button(label: string, attrs: Attrs = {}): HTMLButtonElement {
  return el('button', { type: 'button', className: 'btn', ...attrs, text: label });
}

export function debounce<T extends (...args: never[]) => void>(fn: T, wait: number): T & { cancel(): void } {
  let timer: number | undefined;
  const wrapped = ((...args: never[]) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  }) as T & { cancel(): void };
  wrapped.cancel = () => {
    if (timer) window.clearTimeout(timer);
  };
  return wrapped;
}
