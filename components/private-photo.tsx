"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { api } from "@/lib/api";
const urls = new Map<string, { url: string; expires: number }>();
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
  const renewed = useRef(false);
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
    const cached = urls.get(key);
    const request =
      cached && cached.expires > Date.now()
        ? Promise.resolve(cached)
        : api<{ url: string }>(`entries/${key}`).then(({ url }) => {
            const result = { url, expires: Date.now() + 150000 };
            for (const [id, cached] of urls)
              if (cached.expires <= Date.now()) urls.delete(id);
            urls.set(key, result);
            return result;
          });
    void request
      .then((result) => {
        if (!cancelled) setUrl(result.url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key, visible, attempt]);
  function retry() {
    urls.delete(key);
    setError(false);
    setUrl("");
    setAttempt((value) => value + 1);
  }
  return (
    <div ref={host} style={{ width: 130, minHeight: 130 }}>
      {error ? (
        <button
          onClick={() => {
            renewed.current = false;
            retry();
          }}
        >
          Retry photo
        </button>
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            if ((urls.get(key)?.expires ?? 0) < Date.now()) {
              event.preventDefault();
              retry();
            }
          }}
        >
          <Image
            src={url}
            alt="Diary attachment"
            width={130}
            height={130}
            unoptimized
            loading="lazy"
            decoding="async"
            style={{ objectFit: "cover" }}
            onError={() => {
              if (!renewed.current) {
                renewed.current = true;
                retry();
              } else setError(true);
            }}
          />
        </a>
      ) : (
        <span>Loading photo…</span>
      )}
    </div>
  );
}
