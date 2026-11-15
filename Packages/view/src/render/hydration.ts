type ResolveNode = <T extends Node>(node: T) => T;
type Hydration = {
  bindings: Array<(resolve: ResolveNode) => void>;
  ready: Array<() => void>;
  preserved: WeakMap<Node, Node>;
};

let hydration: Hydration | undefined;
const adopted = new WeakMap<Node, Node>();

/** Report whether the initial native DOM template is being prepared for hydration. */
export function isHydrating(): boolean {
  return hydration !== undefined;
}

/** Retarget direct DOM bindings once, without retaining a render tree or update-time diff. */
export function onHydrate(bind: (resolve: ResolveNode) => void): void {
  hydration?.bindings.push(bind);
}

/** Run mount work after the server DOM has received its direct bindings. */
export function afterHydration(fn: () => void): void {
  if (hydration) {
    hydration.ready.push(fn);
  } else {
    fn();
  }
}

/** Resolve retained native child references to the node adopted during initial hydration. */
export function adoptedNode<T extends Node>(node: T): T {
  return (adopted.get(node) ?? node) as T;
}

/** Stage externally owned nodes without moving live slots or nested islands before commit. */
export function stageNode<T extends Node>(node: T): T {
  node = adoptedNode(node);
  if (hydration && node.isConnected) {
    const clone = node.cloneNode(true) as T;
    hydration.preserved.set(clone, node);
    return clone;
  }
  return node;
}

/** Match native node kinds, including the namespace of HTML, SVG and MathML elements. */
function compatible(expected: Node, actual: Node): boolean {
  return (
    expected.nodeType === actual.nodeType &&
    (expected.nodeType !== 1 ||
      ((expected as Element).localName === (actual as Element).localName &&
        (expected as Element).namespaceURI === (actual as Element).namespaceURI))
  );
}

/** Restore live form state after synchronizing default attributes and child markup. */
function preserveForm(element: Element): () => void {
  if (element instanceof HTMLInputElement) {
    const { value, checked, indeterminate } = element;
    const { selectionStart, selectionEnd, selectionDirection } = element;
    return () => {
      if (element.value !== value) {
        element.value = value;
      }
      element.checked = checked;
      element.indeterminate = indeterminate;
      if (selectionStart !== null && selectionEnd !== null && element.selectionStart !== null) {
        element.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
      }
    };
  }
  if (element instanceof HTMLTextAreaElement) {
    const { value, selectionStart, selectionEnd, selectionDirection } = element;
    return () => {
      if (element.value !== value) {
        element.value = value;
      }
      element.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
    };
  }
  if (element instanceof HTMLSelectElement) {
    const selected = Array.from(element.options, (option) => option.selected);
    const selectedIndex = element.selectedIndex;
    return () => {
      for (let index = 0; index < element.options.length; index++) {
        element.options[index]!.selected = selected[index] ?? false;
      }
      if (selectedIndex === -1) {
        element.selectedIndex = -1;
      }
    };
  }
  return () => {};
}

/** Adopt existing server nodes once and attach bindings produced by the real DOM renderer. */
export function hydrateDOM(target: HTMLElement, render: () => Node[]): void {
  const previous = hydration;
  const session: Hydration = { bindings: [], ready: [], preserved: new WeakMap() };
  hydration = session;
  try {
    const restoreForms = Array.from(
      target.querySelectorAll("input, textarea, select"),
      preserveForm,
    );
    const expected = render();
    hydration = previous;
    const aliases = new Map<Node, Node>();
    const adopt = (parent: Node, nodes: Node[], editable = false) => {
      let cursor = parent.firstChild;
      for (const template of nodes) {
        const preserved = session.preserved.get(template);
        let actual: Node;
        if (preserved) {
          actual = preserved;
          if (actual !== cursor) {
            parent.insertBefore(actual, cursor);
          }
        } else if (cursor && compatible(template, cursor)) {
          actual = cursor;
          if (template.nodeType === 3) {
            const text = template as Text;
            const current = actual as Text;
            if (text.data && current.data.startsWith(text.data) && current.length > text.length) {
              current.splitText(text.length);
            } else if (!text.data && current.length) {
              actual = text;
              parent.insertBefore(actual, cursor);
            }
            if (!editable && actual.textContent !== text.data) {
              actual.textContent = text.data;
            }
          } else if (template.nodeType === 8 && actual.textContent !== template.textContent) {
            actual.textContent = template.textContent;
          }
        } else {
          actual = template;
          parent.insertBefore(actual, cursor);
          if (template.nodeType !== 8 && cursor) {
            const replaced = cursor;
            cursor = cursor.nextSibling;
            parent.removeChild(replaced);
          }
        }
        aliases.set(template, actual);
        if (template !== actual) {
          adopted.set(template, actual);
        }
        if (!preserved && template.nodeType === 1) {
          const source = template as Element;
          const element = actual as Element;
          for (const attr of Array.from(element.attributes)) {
            if (!source.hasAttributeNS(attr.namespaceURI, attr.localName)) {
              element.removeAttributeNS(attr.namespaceURI, attr.localName);
            }
          }
          for (const attr of Array.from(source.attributes)) {
            if (element.getAttributeNS(attr.namespaceURI, attr.localName) !== attr.value) {
              element.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
            }
          }
          const contentEditable =
            editable ||
            element.getAttribute("contenteditable") === "true" ||
            element.getAttribute("contenteditable") === "";
          adopt(element, Array.from(source.childNodes), contentEditable);
        }
        cursor = actual.nextSibling;
      }
      while (cursor) {
        const next = cursor.nextSibling;
        parent.removeChild(cursor);
        cursor = next;
      }
    };
    adopt(target, expected);
    const resolve: ResolveNode = <T extends Node>(node: T): T => (aliases.get(node) ?? node) as T;
    for (const bind of session.bindings) {
      bind(resolve);
    }
    for (const [template, actual] of aliases) {
      if (template !== actual) {
        template.parentNode?.removeChild(template);
      }
    }
    for (const restore of restoreForms) {
      restore();
    }
  } finally {
    hydration = previous;
  }
  for (const ready of session.ready) {
    ready();
  }
}
