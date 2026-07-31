import { FC, ReactNode, useEffect, useRef } from "react";

interface ModalProps {
  title: ReactNode;
  /** When provided, the modal can be dismissed (Escape, backdrop click, close button). */
  onClose?: () => void;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  /** Optional footer rendered in a bordered footer region. */
  footer?: ReactNode;
}

const SIZES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export const Modal: FC<ModalProps> = ({
  title,
  onClose,
  size = "md",
  children,
  footer,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Close on Escape and lock body scroll while open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog body, but respect an element that already took
    // focus via autoFocus (e.g. a password field), and never grab the header
    // close button.
    const alreadyInside =
      document.activeElement && bodyRef.current?.contains(document.activeElement);
    if (!alreadyInside) {
      const toFocus = bodyRef.current?.querySelector<HTMLElement>(
        "input:not([type=hidden]), select, textarea, button, [tabindex]"
      );
      toFocus?.focus();
    }

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={`modal-panel ${SIZES[size]}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="text-base font-semibold">{title}</h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="btn btn-ghost btn-sm -mr-1.5"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div ref={bodyRef} className="modal-body">
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};
