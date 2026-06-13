'use client';
import { useState, useEffect } from 'react';
import { ShieldCheck, X } from 'lucide-react';

/**
 * Rights-confirmation gate shown before a generation that uses the user's
 * own uploaded reference photos. The user must affirm they own / have the
 * rights to every image and that the content is allowed. Mirrors the
 * consent step sites like Higgs Field use.
 *
 * Uploaded images are also moderated server-side at upload time (nudity /
 * explicit content is rejected before it reaches storage) — this modal is
 * the human-consent half of that gate.
 */
export function RightsConfirmModal({
  open,
  imageCount,
  onConfirm,
  onClose,
}: {
  open: boolean;
  imageCount: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState(false);

  // Reset the checkbox each time the modal opens so consent is always a
  // deliberate action, never a stale carry-over.
  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-card bg-bg border border-white/10 p-7 relative"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-full bg-accent2/15 flex items-center justify-center mb-4">
          <ShieldCheck className="w-5 h-5 text-accent2" />
        </div>

        <h2 className="font-display font-bold text-2xl tracking-tight mb-2">
          Confirm your image rights
        </h2>
        <p className="text-sm text-white/65 leading-relaxed mb-5">
          You&apos;re using{' '}
          <b className="text-white">
            {imageCount} uploaded {imageCount === 1 ? 'image' : 'images'}
          </b>{' '}
          to generate this video. Before we continue, please confirm you have
          the right to use {imageCount === 1 ? 'it' : 'them'}.
        </p>

        <label className="flex items-start gap-3 rounded-btn bg-white/5 border border-white/10 px-4 py-3 mb-5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent2,#6366f1)]"
          />
          <span className="text-[13px] text-white/75 leading-relaxed">
            I confirm that I own or have the rights to use all the images I
            uploaded, that they don&apos;t contain nudity, explicit, or
            unlawful content, and that I&apos;m allowed to feature any person
            shown in them.
          </span>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!checked}
            onClick={onConfirm}
            className="flex-1 h-11 rounded-pill bg-white text-black font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Confirm &amp; generate
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 rounded-pill border border-white/15 text-white/70 text-sm font-semibold hover:text-white hover:bg-white/5 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
