import { useEffect } from "react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  duration?: number;
  onClose: () => void;
}

export default function Toast({
  message,
  type = "info",
  duration = 3000,
  onClose,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const styles = {
    success: {
      background: "#065f46",
      border: "1px solid #10b981",
      color: "#6ee7b7",
    },
    error: {
      background: "#7f1d1d",
      border: "1px solid #ef4444",
      color: "#fca5a5",
    },
    info: {
      background: "#1e3a8a",
      border: "1px solid #3b82f6",
      color: "#93c5fd",
    },
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        background: styles[type].background,
        border: styles[type].border,
        color: styles[type].color,
        padding: "12px 16px",
        borderRadius: 6,
        fontSize: 14,
        fontWeight: 500,
        zIndex: 3000,
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: 400,
        animation: "slideIn 0.3s ease-out",
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
          padding: 0,
          marginLeft: "auto",
        }}
      >
        ×
      </button>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
