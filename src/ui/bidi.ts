import { options, type VNode } from 'preact';

/**
 * Text fields follow the direction of what is typed into them: Arabic in
 * Add item, a search or a title runs right to left and sits at the right,
 * Latin text and an empty field (its placeholder) stay at the left. Every
 * <input> that takes text and every <textarea> gets dir="auto" here, at the
 * one place each element is created, unless it names its own direction;
 * the browser then picks the direction from the first strong character.
 * Only the field's text turns: the row around it keeps its own direction.
 */

/** Input types whose value is free text (no type attribute is text). */
const TEXT_TYPES = new Set([undefined, 'text', 'search']);

type FieldProps = { type?: string; dir?: string };

/** The vnode with dir="auto" when it is a text field without a direction of its own. */
function autoDirection(vnode: VNode): void {
  // Every vnode passes here, text nodes (whose props are the text) included: look at fields only.
  if (vnode.type !== 'input' && vnode.type !== 'textarea') return;
  const props = vnode.props as FieldProps;
  if (props.dir === undefined && (vnode.type === 'textarea' || TEXT_TYPES.has(props.type))) props.dir = 'auto';
}

let installed = false;

/** Give every text field dir="auto" (see above). Call once, before the first render. */
export function installAutoDirection(): void {
  if (installed) return;
  installed = true;
  const next = options.vnode;
  options.vnode = (vnode) => {
    autoDirection(vnode);
    next?.(vnode);
  };
}
