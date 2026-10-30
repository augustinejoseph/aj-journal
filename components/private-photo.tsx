"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { mediaBlob } from "@/lib/media-cache";
export function PrivatePhoto({
  entryId,
  mediaId,
}: {
  entryId: string;
  mediaId: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [url, setUrl] = useState(""),
    [error, setError] = useState(false);
  const key = `${entryId}/media/${mediaId}`;
  useEffect(() => {
    if (!host.current) return;
    if (!window.IntersectionObserver) {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let objectUrl = "";
    void mediaBlob(entryId, mediaId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, entryId, mediaId, visible, attempt]);
  function retry() {
    setError(false);
    setUrl("");
    setAttempt((value) => value + 1);
  }
  return (
    <div ref={host} style={{ width: 130, minHeight: 130 }}>
      {error ? (
        <button
          onClick={() => {
            retry();
          }}
        >
          Retry photo
        </button>
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <Image
            src={url}
            alt="Diary attachment"
            width={130}
            height={130}
            unoptimized
            loading="lazy"
            decoding="async"
            style={{ objectFit: "cover" }}
            onError={() => setError(true)}
          />
        </a>
      ) : (
        <span>Loading photo…</span>
      )}
    </div>
  );
}
