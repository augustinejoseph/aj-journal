import { ArrowUpRight } from "lucide-react";
import type { Entry } from "@/lib/schema";
export function EntryCard({
  e,
  onOpen,
}: {
  e: Entry;
  onOpen: (entry: Entry) => void;
}) {
  return (
    <button className="entry-card" onClick={() => onOpen(e)}>
      <div className="entry-date">
        <strong>{new Date(e.createdAt).getDate()}</strong>
        <span>
          {new Date(e.createdAt)
            .toLocaleDateString("en", { month: "short" })
            .toUpperCase()}
        </span>
      </div>
      <div className="entry-copy">
        <div className="entry-meta">
          {new Date(e.createdAt).toLocaleTimeString("en", {
            hour: "numeric",
            minute: "2-digit",
          })}
          <span>·</span>
          {e.writing === "complete"
            ? "A moment, kept"
            : e.writing === "failed" || e.transcription === "failed"
              ? "Needs a retry"
              : "Waiting to become words"}
        </div>
        <h3>{e.title}</h3>
        <p>
          {e.body ||
            e.transcript ||
            (e.kind === "photo"
              ? "Photos from your day."
              : "Your original recording is waiting here. Open the processing queue to continue.")}
        </p>
        <div className="entry-tags">
          {e.tags.map((t) => (
            <span key={t}># {t}</span>
          ))}
        </div>
      </div>
      <ArrowUpRight size={20} />
    </button>
  );
}
