import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes } from 'react';

/** A short description for controls whose visible content is only an icon. */
export function TooltipButton({ label, children, className, onFocus, onBlur, onMouseEnter, onMouseLeave, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
    const id = useId(), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
    const clear = () => { clearTimeout(timer.current); timer.current = undefined; };
    useEffect(() => clear, []);
    return <button {...props} className={['icon-tooltip', className].filter(Boolean).join(' ')} aria-label={props['aria-label'] ?? label} aria-describedby={id}
        onMouseEnter={event => { clear(); timer.current = setTimeout(() => setHovered(true), 300); onMouseEnter?.(event); }}
        onMouseLeave={event => { clear(); setHovered(false); onMouseLeave?.(event); }}
        onFocus={event => { setFocused(true); onFocus?.(event); }}
        onBlur={event => { setFocused(false); onBlur?.(event); }}>
        {children}<span id={id} role="tooltip" hidden={!hovered && !focused} className="control-tooltip">{label}</span>
    </button>;
}
