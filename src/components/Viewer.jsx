import { useEffect } from "react";

export default function Viewer({ src, onClose }) {
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="viewer" onClick={onClose} role="dialog" aria-label="Photo">
      <img src={src} alt="" />
    </div>
  );
}
