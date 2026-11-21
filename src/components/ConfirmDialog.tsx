import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm Action',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-slate-200 dark:border-emerald-800 bg-white dark:bg-[#081D16] p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-emerald-50">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-slate-500 hover:text-slate-800 dark:text-emerald-200/70 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-emerald-100/80 whitespace-pre-line leading-relaxed">
          {description}
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-100 hover:bg-slate-100 dark:hover:bg-emerald-900/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
