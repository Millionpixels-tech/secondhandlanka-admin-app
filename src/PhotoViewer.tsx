import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
export function PhotoViewer({
  images,
  initialIndex,
  onClose,
}: {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      element?.close();
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="photo-viewer"
      aria-label="Ticket images"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setIndex((value) => Math.min(images.length - 1, value + 1));
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setIndex((value) => Math.max(0, value - 1));
        }
      }}
    >
      <div className="photo-viewer-head">
        <span aria-live="polite">
          {index + 1} / {images.length}
        </span>
        <div className="photo-viewer-controls">
          {images.length > 1 && (
            <>
              <button
                aria-label="Previous image"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <ChevronLeft size={22} />
              </button>
              <button
                aria-label="Next image"
                disabled={index === images.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}
          <button aria-label="Close image viewer" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
      </div>
      <div className="photo-viewer-stage">
        <img
          src={images[index]}
          alt={`Ticket attachment ${index + 1} of ${images.length}`}
        />
      </div>
    </dialog>
  );
}
export function TicketAttachments({ images }: { images: string[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const safeImages = images.filter((url) =>
    url.startsWith("https://firebasestorage.googleapis.com/"),
  );
  return (
    <>
      <div className="ticket-images">
        {safeImages.map((url, index) => (
          <button
            type="button"
            className="ticket-image-button"
            key={url}
            aria-label={`View ticket attachment ${index + 1}`}
            onClick={() => setSelected(index)}
          >
            <img
              src={url}
              alt={`Ticket attachment ${index + 1}`}
              loading="lazy"
            />
          </button>
        ))}
      </div>
      {selected !== null && (
        <PhotoViewer
          images={safeImages}
          initialIndex={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
