"use client";
import { EcosystemMenu } from "./ecosystem-menu";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic,
  Square,
  Search,
  BookOpen,
  CalendarDays,
  RefreshCw,
  Settings,
  ArrowUpRight,
  ImagePlus,
  X,
  LogOut,
  Check,
  Cloud,
  Loader2,
  Trash2,
  Volume2,
} from "lucide-react";
import { Button } from "./ui/button";
import Link from "next/link";
import { Waveform } from "./waveform";
import { PrivatePhoto } from "./private-photo";
import { optimizePhoto, nextPhotoSequence } from "@/lib/photos";
import { api } from "@/lib/api";
import type { Entry, Media } from "@/lib/schema";
import { local, LocalSession } from "@/lib/local";
import {
  exclusive,
  processEntry,
  syncSession,
  uploadChunk,
} from "@/lib/processing";
import { dateKey } from "@/lib/dates";
import { JournalCalendar } from "./calendar";
import { EntryCard } from "./entry-card";
export default function Diary({
  email,
  logout,
}: {
  email: string;
  logout: () => Promise<void>;
}) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [sessions, setSessions] = useState<LocalSession[]>([]),
    [query, setQuery] = useState(""),
    [date, setDate] = useState(""),
    [tag, setTag] = useState(""),
    [view, setView] = useState("journal"),
    [month, setMonth] = useState(new Date()),
    [busy, setBusy] = useState(false),
    [message, updateMessage] = useState(""),
    [error, updateError] = useState(""),
    [recording, setRecording] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [model, setModel] = useState(""),
    [active, setActive] = useState<(Entry & { media: Media[] }) | null>(null),
    [draft, setDraft] = useState({ title: "", body: "", tags: "" }),
    [mediaUrls, setMediaUrls] = useState<{ audio: string; photos: string[] }>({
      audio: "",
      photos: [],
    });
  const [inputStream, setInputStream] = useState<MediaStream | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<{
    files: File[];
    title: string;
    body: string;
  } | null>(null);
  const activeId = useRef<string | null>(null);
  activeId.current = active?.id ?? null;
  const audioUrl = useRef("");
  const mediaRequest = useRef(0);
  const photoTarget = useRef<string | null>(null);
  const photoQueue = useRef(Promise.resolve());
  const camera = useRef<HTMLInputElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const setMessage = useCallback((text: string) => {
    updateMessage(text);
    if (text) setLogs((previous) => [...previous.slice(-99), text]);
  }, []);
  const setError = useCallback((text: string) => {
    updateError(text);
    if (text) setLogs((previous) => [...previous.slice(-99), `Error: ${text}`]);
  }, []);
  const recorder = useRef<MediaRecorder | null>(null),
    current = useRef<LocalSession | null>(null),
    writes = useRef(Promise.resolve()),
    uploading = useRef(Promise.resolve()),
    file = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    setEntries(await api<Entry[]>("entries"));
    setSessions(await local.sessions());
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([api<Entry[]>("entries"), local.sessions()])
      .then(([loadedEntries, loadedSessions]) => {
        if (cancelled) return;
        setEntries(loadedEntries);
        setSessions(loadedSessions);
      })
      .catch((error: Error) => {
        if (!cancelled) setError(error.message);
      });
    api<{ model: string }>("settings")
      .then((settings) => {
        if (!cancelled) setModel(settings.model);
      })
      .catch(() => {});
    navigator.storage?.persist?.().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [setError]);
  useEffect(() => {
    if (!recording) return;
    const start = Date.now();
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", warn);
    };
  }, [recording]);
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      mediaRequest.current++;
    },
    [],
  );
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    dialog?.querySelector<HTMLElement>("button")?.focus();
    return () => previous?.focus();
  }, [active]);
  useEffect(
    () => () => {
      mediaRequest.current++;
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = "";
    },
    [active?.id],
  );
  async function retry() {
    if (busy || recording || photoBusy) return;
    setBusy(true);
    setError("");
    try {
      const failures: string[] = [];
      await exclusive(async () => {
        const tombstones = new Set(
          (await api<Entry[]>("entries"))
            .filter((e) => e.deleted)
            .map((e) => e.id),
        );
        for (const s of await local.sessions()) {
          if (tombstones.has(s.id)) {
            await local.remove(s.id);
            continue;
          }
          if (s.stopped) {
            setMessage("Saving media to your private cloud…");
            try {
              await syncSession(s);
              if (s.kind === "photo") await local.remove(s.id);
            } catch (error) {
              failures.push((error as Error).message);
            }
          }
        }
        await refresh();
        for (const e of await api<Entry[]>("entries")) {
          try {
            if (e.deleted) {
              await api(`entries/${e.id}`, "DELETE");
              await local.remove(e.id);
              continue;
            }
            for (const c of await local.chunks(e.id)) {
              if (c.kind === "photo" && !c.uploaded) await uploadChunk(c);
            }
            if (e.kind === "photo") {
              const detail = await api<Entry & { media: Media[] }>(
                `entries/${e.id}`,
              );
              if (detail.media.some((m) => m.kind === "photo"))
                await api(`entries/${e.id}/photos-complete`, "POST", {
                  count: detail.media.filter((m) => m.kind === "photo").length,
                });
            }
            if (
              e.kind !== "photo" &&
              e.sealed &&
              (e.transcription !== "complete" || e.writing !== "complete")
            )
              await processEntry(e, setMessage);
          } catch (error) {
            failures.push((error as Error).message);
          }
        }
        await refresh();
      });
      if (failures.length) setError(failures.join(" · "));
      setMessage(
        failures.length
          ? "Some work needs a retry. Your saved content is safe."
          : "Retry finished. Check the queue for work on other devices.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (busy || recording) return;
    setBusy(true);
    setError("");
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error("Recording needs HTTPS and a supported browser.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      const s: LocalSession = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        stopped: false,
        count: 0,
      };
      await local.session(s);
      current.current = s;
      recorder.current = r;
      writes.current = Promise.resolve();
      uploading.current = Promise.resolve();
      r.ondataavailable = (event) => {
        if (!event.data.size) return;
        writes.current = writes.current
          .then(async () => {
            const seq = s.count;
            const c = {
              id: crypto.randomUUID(),
              entryId: s.id,
              sequence: seq,
              kind: "audio" as const,
              blob: event.data,
              uploaded: false,
            };
            await local.chunk(c);
            s.count++;
            await local.session({ ...s });
            setMessage(`${s.count} audio chunks saved on this device`);
            uploading.current = uploading.current
              .then(async () => {
                await api("entries", "POST", {
                  id: s.id,
                  createdAt: s.createdAt,
                });
                await uploadChunk(c);
                setMessage(
                  `${s.count} chunks saved locally · cloud upload active`,
                );
              })
              .catch((e) => setError(e.message));
          })
          .catch((e) => {
            setError(`Device storage failed: ${e.message}. Recording stopped.`);
            if (r.state === "recording") r.stop();
          });
      };
      r.onstop = () => {
        setBusy(true);
        stream?.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setInputStream(null);
        writes.current
          .then(async () => {
            await photoQueue.current;
            s.stopped = true;
            await local.session({ ...s });
            await uploading.current;
            await refresh();
            setMessage(
              "Recording saved. Use Retry all to transcribe and write.",
            );
            try {
              await syncSession(s);
              setMessage("Cloud saved. Preparing your diary…");
              setBusy(true);
              await exclusive(async () => {
                const e = await api<Entry>(`entries/${s.id}`);
                await processEntry(e, setMessage);
              });
              await refresh();
              setMessage("Your moment is saved.");
            } catch (e) {
              setError((e as Error).message);
              await refresh();
            } finally {
              setBusy(false);
            }
          })
          .catch((e) => {
            setError(e.message);
            setBusy(false);
          });
      };
      r.onerror = () => {
        setError("Recording interrupted. Recover your saved chunks below.");
        if (r.state !== "inactive") r.stop();
      };
      r.start(10000);
      setInputStream(stream);
      setRecording(true);
      setElapsed(0);
      setMessage("Recording · saving to this device every 10 seconds");
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function recover(s: LocalSession) {
    const chunks = (await local.chunks(s.id)).filter((c) => c.kind === "audio");
    const recovered = { ...s, stopped: true, count: chunks.length };
    await local.session(recovered);
    await refresh();
    setMessage("Recovered saved chunks. Retry all to upload and process.");
  }
  async function open(e: Entry) {
    try {
      const detail = await api<Entry & { media: Media[] }>(`entries/${e.id}`);
      activeId.current = detail.id;
      mediaRequest.current++;
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = "";
      setActive(detail);
      setDraft({ title: e.title, body: e.body, tags: e.tags.join(", ") });
      setMediaUrls({ audio: "", photos: [] });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadMedia() {
    if (!active) return;
    const entryId = active.id,
      request = ++mediaRequest.current;
    try {
      const blobs: Blob[] = [];
      for (const m of active.media
        .filter((m) => m.uploaded && m.kind === "audio")
        .sort((a, b) => a.sequence - b.sequence)) {
        const { url } = await api<{ url: string }>(
          `entries/${entryId}/media/${m.id}`,
        );
        const response = await fetch(url);
        if (!response.ok) throw new Error("Playback download failed");
        blobs.push(await response.blob());
      }
      if (activeId.current !== entryId || request !== mediaRequest.current)
        return;
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = blobs.length
        ? URL.createObjectURL(
            new Blob(blobs, {
              type: active.media.find((m) => m.kind === "audio")?.mime,
            }),
          )
        : "";
      setMediaUrls({ audio: audioUrl.current, photos: [] });
    } catch (error) {
      if (activeId.current === entryId) setError((error as Error).message);
    }
  }
  function choosePhotos(capture: boolean, entryId: string | null) {
    photoTarget.current = entryId;
    (capture ? camera : file).current?.click();
  }
  async function receivePhotos(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files),
      target = photoTarget.current;
    if (!target) {
      setPhotoDraft({ files: selected, title: "", body: "" });
      return;
    }
    await attachPhotos(selected, target);
  }
  function attachPhotos(
    files: File[],
    entryId: string,
    session?: LocalSession,
  ) {
    setPhotoBusy(true);
    const job = photoQueue.current.then(async () => {
      // Persist every selected image before attempting network operations.
      const existing = await local.chunks(entryId);
      let server: Media[] =
        activeId.current === entryId ? (active?.media ?? []) : [];
      let sequence = nextPhotoSequence(server, existing);
      const chunks = [];
      for (const file of files) {
        const chunk = {
          id: crypto.randomUUID(),
          entryId,
          sequence: sequence++,
          kind: "photo" as const,
          blob: await optimizePhoto(file),
          uploaded: false,
        };
        await local.chunk(chunk);
        chunks.push(chunk);
        if (session) {
          session.count++;
          await local.session({ ...session });
        }
      }
      const recordingSession =
        current.current?.id === entryId ? current.current : undefined;
      if (session || recordingSession) {
        const source = session ?? recordingSession!;
        await api("entries", "POST", {
          id: source.id,
          createdAt: source.createdAt,
          kind: source.kind ?? "audio",
          title: source.title,
          body: source.body,
        });
      }
      server = (await api<Entry & { media: Media[] }>(`entries/${entryId}`))
        .media;
      const queued = await local.chunks(entryId);
      const newIds = new Set(chunks.map((chunk) => chunk.id));
      let reconciled = nextPhotoSequence(
        server,
        queued.filter((chunk) => !newIds.has(chunk.id)),
      );
      for (const chunk of chunks) {
        chunk.sequence = reconciled++;
        await local.chunk(chunk);
      }
      for (const chunk of chunks) await uploadChunk(chunk);
      const detail = await api<Entry & { media: Media[] }>(
        `entries/${entryId}`,
      );
      if (detail.kind === "photo")
        await api(`entries/${entryId}/photos-complete`, "POST", {
          count: detail.media.filter((m) => m.kind === "photo").length,
        });
      if (activeId.current === entryId) setActive(detail);
      if (session) await local.remove(entryId);
      await refresh();
      setMessage("Photos saved privately.");
    });
    photoQueue.current = job.catch(() => {});
    return job
      .catch(async (error: Error) => {
        setError(
          error.message +
            " Any photos already saved remain on this device for Retry all. Reselect rejected photos.",
        );
        await api(`entries/${entryId}/upload-failure`, "POST", {
          error: error.message.slice(0, 500),
        }).catch(() => {});
      })
      .finally(() => setPhotoBusy(false));
  }
  async function createPhotoEntry() {
    if (!photoDraft || photoBusy) return;
    const session: LocalSession = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind: "photo",
      stopped: true,
      count: 0,
      title: photoDraft.title,
      body: photoDraft.body,
    };
    await local.session(session);
    const originalDraft = photoDraft;
    setPhotoDraft(null);
    await attachPhotos(originalDraft.files, session.id, session);
    if (
      !(await local.chunks(session.id)).length &&
      (await local.sessions()).some((item) => item.id === session.id)
    ) {
      await local.remove(session.id);
      setPhotoDraft(originalDraft);
    }
    await refresh();
  }
  const tags = Array.from(new Set(entries.flatMap((e) => e.tags))).sort();
  const visible = entries.filter(
    (e) =>
      !e.deleted &&
      (!date || dateKey(new Date(e.createdAt)) === date) &&
      (!tag || e.tags.includes(tag)) &&
      `${e.title} ${e.body} ${e.transcript}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pending = entries.filter(
    (e) =>
      e.deleted ||
      e.upload !== "complete" ||
      (e.kind !== "photo" &&
        (e.transcription !== "complete" || e.writing !== "complete")),
  );

  return (
    <div className="app-shell">
      <input
        ref={file}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={(e) => {
          void receivePhotos(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={camera}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          void receivePhotos(e.target.files);
          e.target.value = "";
        }}
      />
      <aside className="sidebar">
        <Link className="wordmark" href="/">
          still<span>YOUR PRIVATE DIARY</span>
        </Link>
        <nav>
          <button
            className={view === "journal" ? "nav-item selected" : "nav-item"}
            onClick={() => setView("journal")}
          >
            <BookOpen size={18} />
            My journal<span>{entries.length}</span>
          </button>
          <button
            className={view === "queue" ? "nav-item selected" : "nav-item"}
            onClick={() => setView("queue")}
          >
            <RefreshCw size={18} />
            Processing queue
            {pending.length > 0 && <span>{pending.length}</span>}
          </button>
          <button
            className="mobile-settings"
            aria-label="Settings"
            onClick={() => setView("settings")}
          >
            <Settings size={17} />
          </button>
        </nav>
        <JournalCalendar
          month={month}
          setMonth={setMonth}
          date={date}
          setDate={setDate}
          entryDates={entries
            .filter((e) => !e.deleted)
            .map((e) => dateKey(new Date(e.createdAt)))}
          onNavigate={() => setView("journal")}
        />
        <div className="tag-list">
          <div className="eyebrow">YOUR THREADS</div>
          {tags.length ? (
            tags.map((t) => (
              <button
                className={tag === t ? "tag active" : "tag"}
                key={t}
                onClick={() => setTag(tag === t ? "" : t)}
              >
                # {t}
              </button>
            ))
          ) : (
            <p>Little themes will find their way here.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <span className="private-dot" /> A space for you alone
          <button className="nav-item" onClick={() => setView("settings")}>
            <Settings size={17} />
            Settings
          </button>
          <form action={logout}>
            <button className="nav-item">
              <LogOut size={17} />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="main">
        <header>
          <span className="breadcrumb">
            MY SPACE <span>/</span>{" "}
            {view === "journal"
              ? "Journal"
              : view === "queue"
                ? "Processing queue"
                : "Settings"}
          </span>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <EcosystemMenu />
            <span className="avatar" title={email}>
              {email.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {new Date()
                  .toLocaleDateString("en", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })
                  .toUpperCase()}
              </div>
              <h1>
                {view === "journal"
                  ? "A moment, kept."
                  : view === "queue"
                    ? "Room to catch up."
                    : "Make yourself at home."}
              </h1>
              <p>
                {view === "journal"
                  ? "The ordinary days are worth remembering, too."
                  : view === "queue"
                    ? "Your recordings stay safe while the words take shape."
                    : "A few quiet details behind your diary."}
              </p>
            </div>
            <span className="heading-flower">✳</span>
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {view === "journal" && (
            <>
              <section
                className={"recorder " + (recording ? "is-recording" : "")}
              >
                <div className="recorder-top">
                  <span className="eyebrow">
                    {recording
                      ? "YOUR VOICE, BEING KEPT"
                      : "START WITH YOUR VOICE"}
                  </span>
                  <span className="pill">
                    <span className="private-dot" />
                    Private by default
                  </span>
                </div>
                <div className="record-center">
                  <button
                    className="record-button"
                    aria-label={
                      recording ? "Stop recording" : "Start recording"
                    }
                    disabled={busy && !recording}
                    onClick={() =>
                      recording ? recorder.current?.stop() : start()
                    }
                  >
                    {recording ? (
                      <Square fill="currentColor" size={25} />
                    ) : (
                      <Mic size={28} />
                    )}
                  </button>
                  <h2>
                    {recording
                      ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
                      : "What’s on your mind?"}
                  </h2>
                  <p>
                    {recording
                      ? "Tap to finish and save your moment."
                      : "Tap to record. Speak in Malayalam, English, or a little of both."}
                  </p>
                </div>
                {recording && inputStream && <Waveform stream={inputStream} />}
                <div className="media-actions">
                  <Button
                    variant="outline"
                    disabled={photoBusy || (busy && !recording)}
                    onClick={() =>
                      choosePhotos(
                        true,
                        recording ? (current.current?.id ?? null) : null,
                      )
                    }
                  >
                    Take photo
                  </Button>
                  <Button
                    variant="outline"
                    disabled={photoBusy || (busy && !recording)}
                    onClick={() =>
                      choosePhotos(
                        false,
                        recording ? (current.current?.id ?? null) : null,
                      )
                    }
                  >
                    <ImagePlus size={15} />
                    Choose photos
                  </Button>
                  {photoBusy && <span role="status">Saving photos…</span>}
                </div>
                {photoDraft && (
                  <div className="photo-composer">
                    <p>{photoDraft.files.length} photo(s) for today</p>
                    <label>
                      Title (optional)
                      <input
                        maxLength={200}
                        value={photoDraft.title}
                        onChange={(e) =>
                          setPhotoDraft({
                            ...photoDraft,
                            title: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Text (optional)
                      <textarea
                        maxLength={200000}
                        value={photoDraft.body}
                        onChange={(e) =>
                          setPhotoDraft({ ...photoDraft, body: e.target.value })
                        }
                      />
                    </label>
                    <Button
                      disabled={photoBusy}
                      onClick={() =>
                        void createPhotoEntry().catch((error: Error) =>
                          setError(error.message),
                        )
                      }
                    >
                      Save photo entry
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPhotoDraft(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                <div className="recorder-footer">
                  <span>
                    <Volume2 size={15} /> Your voice becomes a diary entry
                  </span>
                  <span>No timer. Take your time.</span>
                </div>
              </section>
              <p className="practical">
                Keep this tab open while recording or transcribing. Browser
                suspension, device memory, and storage can interrupt recording.
              </p>
              <div className="feed-toolbar">
                <h2>
                  Your moments <span>{visible.length}</span>
                </h2>
                <div className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search entries"
                    placeholder="Find a memory…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="filters">
                <label>
                  <CalendarDays size={15} />
                  <input
                    aria-label="Filter by date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter by tag"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                >
                  <option value="">All threads</option>
                  {tags.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                {(date || tag) && (
                  <button
                    onClick={() => {
                      setDate("");
                      setTag("");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {visible.length ? (
                visible.map((e) => <EntryCard key={e.id} e={e} onOpen={open} />)
              ) : (
                <div className="empty">
                  <BookOpen size={25} />
                  <h3>
                    {entries.length
                      ? "No moments match just yet."
                      : "Every diary begins with a moment."}
                  </h3>
                  <p>
                    {entries.length
                      ? "Try a different word or clear your filters."
                      : "Tap the microphone above. There’s no right way to begin."}
                  </p>
                </div>
              )}
            </>
          )}
          {view === "queue" && (
            <>
              <div className="queue-heading">
                <p>
                  Transcription happens on this device. Writing happens on the
                  server.
                </p>
                <Button
                  disabled={busy || recording || photoBusy}
                  onClick={retry}
                >
                  <RefreshCw size={16} className={busy ? "spin" : ""} />
                  Retry all
                </Button>
              </div>
              {logs.length > 0 && (
                <details className="queue-card">
                  <summary>Processing log ({logs.length})</summary>
                  <ol aria-live="polite">
                    {logs.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ol>
                </details>
              )}
              {sessions.map((s) => (
                <div className="queue-card" key={s.id}>
                  <div>
                    <strong>
                      {s.kind === "photo"
                        ? "Photo entry on this device"
                        : "Recording on this device"}
                    </strong>
                    <p>
                      {new Date(s.createdAt).toLocaleString()} · {s.count} saved
                      chunks
                    </p>
                  </div>
                  {!s.stopped ? (
                    <Button
                      variant="outline"
                      onClick={() => recover(s)}
                      disabled={recording}
                    >
                      Recover
                    </Button>
                  ) : (
                    <span className="pill">
                      <Check size={13} />
                      Locally saved
                    </span>
                  )}
                </div>
              ))}
              {pending.map((e) => (
                <div className="queue-card" key={e.id}>
                  <div>
                    <strong>
                      {e.deleted ? "Finishing media deletion" : e.title}
                    </strong>
                    {e.deleted ? (
                      <p>
                        Retry after three minutes to clear expired upload links
                        and finish cleanup.
                      </p>
                    ) : (
                      <div className="stages">
                        <span>Cloud: {e.upload}</span>
                        {e.kind !== "photo" && (
                          <>
                            <span>Transcription: {e.transcription}</span>
                            <span>Writing: {e.writing}</span>
                          </>
                        )}
                      </div>
                    )}
                    {e.error && <p className="error-text">{e.error}</p>}
                  </div>
                  <div>
                    {!e.sealed && !e.deleted && (
                      <Button
                        variant="outline"
                        disabled={busy || recording}
                        onClick={async () => {
                          try {
                            setBusy(true);
                            setError("");
                            const session = (await local.sessions()).find(
                              (s) => s.id === e.id,
                            );
                            if (session) {
                              const chunks = (await local.chunks(e.id)).filter(
                                (c) => c.kind === "audio",
                              );
                              if (chunks.length) {
                                const recovered = {
                                  ...session,
                                  stopped: true,
                                  count: chunks.length,
                                };
                                await local.session(recovered);
                                setMessage(
                                  "Recovering audio saved on this device…",
                                );
                                await syncSession(recovered);
                                await refresh();
                                setMessage(
                                  "Recovered audio uploaded. Use Retry all to transcribe and write.",
                                );
                                return;
                              }
                            }
                            const detail = await api<
                              Entry & { media: Media[] }
                            >(`entries/${e.id}`);
                            const audio = detail.media.filter(
                              (m) => m.kind === "audio" && m.uploaded,
                            );
                            if (!audio.length)
                              throw new Error(
                                "No cloud audio available. Recover from the recording device.",
                              );
                            if (
                              !confirm(
                                "Finish this interrupted recording using its cloud-saved chunks? Any audio still only on another device must be recovered there first.",
                              )
                            )
                              return;
                            await api(`entries/${e.id}/seal`, "POST", {
                              count: audio.length,
                            });
                            await refresh();
                          } catch (err) {
                            setError((err as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Finish saved audio
                      </Button>
                    )}
                    <button
                      aria-label="Open entry"
                      disabled={e.deleted}
                      onClick={() => open(e)}
                    >
                      <ArrowUpRight size={20} />
                    </button>
                  </div>
                </div>
              ))}
              {!pending.length && !sessions.length && (
                <div className="empty">
                  <Check />
                  <h3>All caught up.</h3>
                </div>
              )}
              <p className="practical">
                Whisper Small downloads several hundred megabytes once and
                caches the model. On memory failures, retry from a capable
                desktop using the cloud-saved audio.
              </p>
            </>
          )}
          {view === "settings" && (
            <section className="settings-card">
              <h2>Your writing model</h2>
              <p>
                The transcript is sent to OpenRouter to produce a faithful
                English entry. Photos are never sent for analysis.
              </p>
              <label htmlFor="model">OpenRouter model ID</label>
              <input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <Button
                onClick={async () => {
                  try {
                    await api("settings", "PUT", { model });
                    setMessage("Model setting saved.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Save model
              </Button>
              <hr />
              <h2>Private by design</h2>
              <p>
                Signed in as {email}. Original transcripts and audio are
                preserved when you edit or regenerate your diary text.
              </p>
              <p>
                Local audio stays on this device until you remove the entry.
                Cloud media uses short-lived private links.
              </p>
            </section>
          )}
          {(message || busy) && (
            <div className="status" role="status">
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Cloud size={16} />
              )}{" "}
              {message || "Working…"}
            </div>
          )}
          <footer>
            Nothing to perform. Just a life to remember.
            <span>still / your private diary</span>
          </footer>
        </div>
      </main>
      {active && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit diary entry"
            onKeyDown={(e) => {
              if (e.key === "Escape") setActive(null);
              if (e.key === "Tab") {
                const items = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled),input:not([hidden]),textarea,a[href],summary,audio[controls]",
                  ),
                ).filter((el) => el.getClientRects().length);
                const first = items[0],
                  last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className="modal-top">
              <span className="eyebrow">
                {new Date(active.createdAt).toLocaleDateString("en", {
                  dateStyle: "long",
                })}
              </span>
              <button
                aria-label="Close entry"
                autoFocus
                onClick={() => {
                  setActive(null);
                  if (mediaUrls.audio) URL.revokeObjectURL(mediaUrls.audio);
                }}
              >
                <X />
              </button>
            </div>
            <label>
              Title
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              Your diary
              <textarea
                rows={10}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Your written entry will appear here."
              />
            </label>
            <label>
              Tags, separated by commas
              <input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <Button
                disabled={busy}
                onClick={async () => {
                  try {
                    await api(`entries/${active.id}`, "PATCH", {
                      title: draft.title,
                      body: draft.body,
                      tags: draft.tags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    });
                    await refresh();
                    setMessage("Changes saved.");
                    setActive(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Save changes
              </Button>
              <Button
                variant="outline"
                disabled={busy || !active.transcript}
                onClick={async () => {
                  if (
                    !confirm(
                      "Replace your current title, text and tags with a fresh version? The original transcript stays safe.",
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    await api(`entries/${active.id}/generate`, "POST", {
                      force: true,
                    });
                    await refresh();
                    const updated = await api<Entry>(`entries/${active.id}`);
                    await open(updated);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <RefreshCw size={15} />
                Regenerate
              </Button>
            </div>
            {active.kind !== "photo" && (
              <details>
                <summary>Original transcript</summary>
                <p className="transcript">
                  {active.transcript || "Not transcribed yet."}
                </p>
              </details>
            )}
            <div className="media-actions">
              {active.kind !== "photo" && (
                <Button variant="outline" onClick={loadMedia}>
                  <Volume2 size={15} />
                  Load audio
                </Button>
              )}
              <Button
                variant="outline"
                disabled={photoBusy}
                onClick={() => choosePhotos(true, active.id)}
              >
                Take photo
              </Button>
              <Button
                variant="outline"
                disabled={photoBusy}
                onClick={() => choosePhotos(false, active.id)}
              >
                <ImagePlus size={15} />
                Choose photos
              </Button>
              {photoBusy && <span role="status">Saving photos…</span>}
            </div>
            {mediaUrls.audio && <audio controls src={mediaUrls.audio} />}
            <div className="photos">
              {active.media
                .filter((m) => m.kind === "photo" && m.uploaded)
                .sort((a, b) => a.sequence - b.sequence)
                .map((m) => (
                  <PrivatePhoto key={m.id} entryId={active.id} mediaId={m.id} />
                ))}
            </div>
            <Button
              variant="destructive"
              disabled={busy || photoBusy}
              onClick={async () => {
                if (
                  !confirm("Delete this entry and all of its audio and photos?")
                )
                  return;
                setBusy(true);
                try {
                  await api(`entries/${active.id}`, "DELETE");
                  await local.remove(active.id);
                  setActive(null);
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={15} />
              Delete entry & media
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
