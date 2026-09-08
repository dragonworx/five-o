// Tiny DOM helpers — the whole client is a handful of screens, so a 40-line
// builder beats a framework here.

type Props<K extends keyof HTMLElementTagNameMap> = Partial<HTMLElementTagNameMap[K]> & {
  class?: string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string>;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: className, dataset, attrs, ...rest } = props;
  if (className) node.className = className;
  if (dataset) for (const [k, v] of Object.entries(dataset)) node.dataset[k] = v;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  Object.assign(node, rest);
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function mount(root: HTMLElement, ...children: (Node | string)[]): void {
  root.replaceChildren(...children.map((c) => (typeof c === "string" ? document.createTextNode(c) : c)));
}

export function on<K extends keyof HTMLElementEventMap>(
  node: HTMLElement,
  event: K,
  handler: (ev: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void {
  node.addEventListener(event, handler as EventListener, options);
}

// Replace "{name}" / "{count}" style placeholders in config copy.
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}
