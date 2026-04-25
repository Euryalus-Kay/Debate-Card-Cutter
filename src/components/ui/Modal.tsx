"use client";

import { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 560,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal-card"
        style={{ width: `${width}px`, maxWidth: "92vw" }}
        role="dialog"
        aria-modal="true"
      >
        {(title || description) && (
          <div className="px-5 pt-5 pb-3 border-b border-[var(--border-subtle)]">
            {title && (
              <h2 className="text-[16px] font-semibold tracking-tight text-white">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
