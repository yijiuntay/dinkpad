"use client";
import React, { useEffect } from "react";

interface Props {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function BottomSheet({ isOpen, title, onClose, children }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full bg-slate-900 border-t border-slate-700 rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="relative flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-800">
          <div className="absolute left-1/2 top-2 -translate-x-1/2 w-10 h-1 bg-slate-600 rounded-full" />
          {title ? (
            <h2 className="text-base font-semibold text-white mt-1">{title}</h2>
          ) : (
            <div className="mt-1" />
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">{children}</div>
      </div>
    </div>
  );
}
