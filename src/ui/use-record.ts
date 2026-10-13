import { useEffect, useRef, useState } from 'react';

/** Reveal every open action after React commits, including reopening the same row. */
export function useRecord() {
    const [id, setId] = useState('');
    const [opening, setOpening] = useState(0);
    const heading = useRef<HTMLHeadingElement>(null);
    const origin = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        if (!opening) return;
        const frame = requestAnimationFrame(() => {
            heading.current?.scrollIntoView({ block: 'start' });
            heading.current?.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(frame);
    }, [opening]);
    function open(next: string, button: HTMLButtonElement) {
        origin.current = button;
        setId(next);
        setOpening(value => value + 1);
    }
    function close() {
        setId('');
        origin.current?.focus();
    }
    return { id, heading, open, close };
}
