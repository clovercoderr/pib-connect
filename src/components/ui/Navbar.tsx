import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface NavbarItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface NavbarProps<T extends string> {
  items: NavbarItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  className?: string;
  // If we want it perfectly centered and isolated in a position: absolute wrapper
  centered?: boolean;
}

export function Navbar<T extends string>({
  items,
  activeId,
  onChange,
  className = "",
  centered = false,
}: NavbarProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  // Measure the active button so the pill knows where to slide.
  useLayoutEffect(() => {
    const btn = buttonRefs.current[activeId];
    const container = containerRef.current;
    if (!btn || !container) return;
    const left = btn.offsetLeft;
    const width = btn.offsetWidth;
    setIndicator({ left, width });
  }, [activeId, items.length]);

  // Disable initial transition so the indicator doesn't fly in from x=0.
  useEffect(() => {
    const t = requestAnimationFrame(() => setHasMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Re-measure on resize so the pill stays glued to the active button.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = () => {
      const btn = buttonRefs.current[activeId];
      const container = containerRef.current;
      if (!btn || !container) return;
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [activeId]);

  const content = (
    <div
      ref={containerRef}
      className={`relative flex gap-0.5 bg-[#1a1a24]/80 backdrop-blur-xl rounded-full p-0.5 border border-white/[0.06] shadow-lg shadow-black/20 ${centered ? "pointer-events-auto" : ""} ${className}`}
    >
      {/* Sliding indicator pill — sits behind buttons, eases between active
          positions. Keep timing in the 200–250ms band so the pill feels
          chase-the-pointer, not delayed. */}
      {indicator && (
        <span
          aria-hidden
          className={`pointer-events-none absolute top-0.5 bottom-0.5 rounded-full bg-white/[0.12] shadow-sm ${hasMounted ? "transition-[left,width] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)]" : ""}`}
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}

      {items.map((item) => {
        const isActive = activeId === item.id;
        return (
          <button
            key={item.id}
            ref={(el) => { buttonRefs.current[item.id] = el; }}
            onClick={() => onChange(item.id)}
            className={`relative z-10 min-h-7 px-2.5 py-1 rounded-full text-[10px] font-medium transition-[color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${
              isActive
                ? "text-white/95"
                : "text-white/35 hover:text-white/65"
            }`}
          >
            {item.icon && <span className="mr-1.5 inline-block align-middle">{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>
  );

  if (centered) {
    return (
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
        {content}
      </div>
    );
  }

  return content;
}
