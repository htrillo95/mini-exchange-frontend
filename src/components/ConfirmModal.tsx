interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.7)",
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
        onClick={onCancel}
      >
        {/* Modal */}
        <div
          style={{
            background: "#111827",
            border: "1px solid #1f2937",
            borderRadius: 8,
            padding: "24px",
            maxWidth: 400,
            width: "100%",
            zIndex: 2001,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#f9fafb",
              marginBottom: 12,
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "#9ca3af",
              marginBottom: 24,
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary"
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="btn-danger"
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .btn-secondary {
          background: #374151;
          color: #e5e7eb;
          border: 1px solid #4b5563;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .btn-secondary:hover:not(:disabled) {
          background: #4b5563;
          border-color: #6b7280;
        }
        .btn-secondary:focus-visible {
          outline: 2px solid #6b7280;
          outline-offset: 2px;
        }
        .btn-secondary:disabled {
          background: #1f2937;
          border-color: #374151;
          color: #6b7280;
          cursor: not-allowed;
        }

        .btn-danger {
          background: #7f1d1d;
          color: #fca5a5;
          border: 1px solid #ef4444;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .btn-danger:hover:not(:disabled) {
          background: #991b1b;
          border-color: #dc2626;
        }
        .btn-danger:focus-visible {
          outline: 2px solid #ef4444;
          outline-offset: 2px;
        }
        .btn-danger:disabled {
          background: #1f2937;
          border-color: #374151;
          color: #6b7280;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
