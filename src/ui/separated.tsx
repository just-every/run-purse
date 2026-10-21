import { Fragment, Children, cloneElement, isValidElement, useLayoutEffect, type ReactElement, type ReactNode } from 'react';

/** Keep a separator with its preceding word; hide it if the next word wraps to another line. */
export function separated(children: ReactNode): ReactNode {
    return Children.map(children, child => {
        if (typeof child === 'string') return child.split(/ *· */).flatMap((part, i) => i ? [<span className="inline-sep" key={i}>{'\u00a0·'}</span>, ' ', part] : [part]);
        if (!isValidElement(child) || (typeof child.type !== 'string' && child.type !== Fragment)) return child;
        if (['button', 'select', 'option', 'svg'].includes(String(child.type))) return child;
        const element = child as ReactElement<{ children?: ReactNode; className?: string }>;
        if (element.props.className?.split(' ').includes('inline-sep')) return element;
        return element.props.children === undefined ? element : cloneElement(element, {}, separated(element.props.children));
    });
}
export function Separated({ children }: { children: ReactNode }) { return separated(children); }

/** Font loading, responsive layout and newly opened records all recompute the visible separators. */
export function useSeparators() {
    useLayoutEffect(() => {
        const root = document.querySelector('.app');
        if (!root) return;
        const run = () => {
            const ends = [...root.querySelectorAll<HTMLElement>('.inline-sep')].map(separator => {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                walker.currentNode = separator;
                const before = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                before.currentNode = separator;
                let previous: Node | null, leading = true;
                const box = separator.getBoundingClientRect();
                while ((previous = before.previousNode())) {
                    const text = previous.textContent ?? '', at = text.search(/\S\s*$/);
                    if (at < 0) continue;
                    const range = document.createRange(); range.setStart(previous, at); range.setEnd(previous, at + 1);
                    const rect = range.getBoundingClientRect();
                    leading = !rect.height || Math.abs(rect.top + rect.height / 2 - (box.top + box.height / 2)) > box.height / 2;
                    break;
                }
                let node: Node | null;
                while ((node = walker.nextNode())) {
                    if (separator.contains(node)) continue;
                    const at = node.textContent?.search(/\S/) ?? -1;
                    if (at < 0) continue;
                    const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + 1);
                    const next = range.getBoundingClientRect();
                    return { separator, end: leading || (next.height > 0 && next.top + next.height / 2 > box.bottom) };
                }
                return { separator, end: true };
            });
            for (const { separator, end } of ends) separator.classList.toggle('inline-sep-end', end);
        };
        let frame = 0;
        const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(run); };
        const observer = new MutationObserver(schedule);
        observer.observe(root, { childList: true, subtree: true, characterData: true });
        const resize = new ResizeObserver(schedule); resize.observe(root);
        window.addEventListener('resize', schedule); document.fonts.addEventListener('loadingdone', schedule);
        run(); document.fonts.ready.then(schedule);
        return () => { cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', schedule); document.fonts.removeEventListener('loadingdone', schedule); };
    }, []);
}
