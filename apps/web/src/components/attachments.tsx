/**
 * Image attachments.
 *
 * Two things can hold an image in this app: a trade, and a journal entry.
 * They are stored in separate tables and reached through separate store
 * methods, because they have different lifetimes — but they are the same kind
 * of thing to the person using it, and the person should not have to learn
 * two different uploaders.
 *
 * So the components below are split in two:
 *
 *   * `AttachmentUploader` / `AttachmentGallery` — the trade versions.
 *   * `JournalAttachmentUploader` / `JournalAttachmentGallery` — the journal
 *     versions.
 *
 * and one shared core does the work. The core is written against a small
 * structural type (`RenderableAttachment`) rather than the domain types, so it
 * does not care which table a row came from. What differs between the two is
 * passed in: how to upload a file, how to resolve one to a URL, and how to
 * delete one.
 *
 * A few decisions worth stating, because they are the kind that look like
 * details and are not:
 *
 *   * The file picker has `accept="image/*"` as a convenience only. It is a
 *     hint to the operating system's dialog and nothing more — a user can still
 *     choose "All files" in most browsers, and a drag-and-drop bypasses the
 *     picker entirely. The real check is `validateAttachmentFile`, run on every
 *     path in, and then again by the bucket and the table on the server.
 *
 *   * A failed upload is reported per file, with the file's name in the
 *     message. "Upload failed" tells you nothing when you dropped four
 *     screenshots.
 *
 *   * Object URLs are tracked and revoked. A blob URL pins its blob in memory
 *     until revoked, so a gallery that opens and closes repeatedly would leak a
 *     copy of every image it ever showed.
 *
 *   * The images are shown at a capped height with `object-fit: contain`, so a
 *     tall portrait screenshot does not push the rest of the page off-screen,
 *     and is never cropped into looking like something it is not.
 */

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { JournalAttachment, TradeAttachment } from "@tradevault/core";
import { useApp } from "../lib/appContext";
import { validateAttachmentFile, MAX_ATTACHMENT_BYTES, type StoreResult } from "../lib/store";
import { Banner, Icon, icons } from "./ui";

/**
 * What the shared core needs to know about an image, whichever table it is in.
 *
 * Deliberately structural. The trade and journal rows differ in their owner
 * column and nothing the interface actually renders.
 */
interface RenderableAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  caption?: string;
}

/** How to turn an attachment row into something the browser can load. */
type ResolveUrl = (attachment: never) => Promise<StoreResult<string>>;

/* ------------------------------------------------------------------ */
/* Uploader                                                           */
/* ------------------------------------------------------------------ */

/**
 * The shared uploader.
 *
 * `upload` is given one file and returns the store's result, so the validation,
 * the per-file error reporting and the refresh callback are all identical
 * whether the image is landing on a trade or on a journal entry.
 */
function UploaderCore({
  ariaLabel,
  title,
  hint,
  subject,
  upload,
  onUploaded,
}: {
  /** Used for the drop zone's accessible name. */
  ariaLabel: string;
  /** The drop zone's main line, and the button label. */
  title: string;
  /** The smaller line under the title. */
  hint: string;
  /**
   * What the images are being attached to, used in the success message:
   * "Saved with this trade." / "Saved with this journal entry."
   */
  subject: string;
  upload: (file: File) => Promise<{ ok: true } | { ok: false; error: string }>;
  onUploaded: () => void | Promise<void>;
}) {
  const { isOffline } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Array<{ name: string; message: string }>>([]);
  const [success, setSuccess] = useState<number>(0);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      setBusy(true);
      setErrors([]);
      setSuccess(0);

      const failures: Array<{ name: string; message: string }> = [];
      let uploaded = 0;

      for (const file of list) {
        // Validated here as well as in the store so the user gets an answer
        // without waiting on the network, and so one bad file does not stop the
        // good ones behind it.
        const invalid = validateAttachmentFile(file);
        if (invalid) {
          failures.push({ name: file.name, message: invalid });
          continue;
        }

        const result = await upload(file);
        if (result.ok) {
          uploaded += 1;
        } else {
          failures.push({ name: file.name, message: result.error });
        }
      }

      setBusy(false);
      setSuccess(uploaded);
      setErrors(failures);

      if (uploaded > 0) await onUploaded();
    },
    [upload, onUploaded]
  );

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    void handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="stack-sm">
      <div
        className={`dropzone${dragging ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (busy) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-busy={busy}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            // Reset so choosing the same file twice still fires a change event.
            e.target.value = "";
          }}
        />

        <span className="dropzone-icon">
          <Icon path={icons.image} size={20} />
        </span>
        <span className="dropzone-title">{busy ? "Uploading…" : title}</span>
        <span className="dropzone-hint">{hint}</span>
      </div>

      {success > 0 ? (
        <Banner tone="accent" title={success === 1 ? "Image added" : `${success} images added`}>
          {isOffline
            ? `Stored in this browser only. Configure Supabase to keep images with the ${subject} on every device.`
            : `Saved with this ${subject}. They will appear on any device you sign in from.`}
        </Banner>
      ) : null}

      {errors.length > 0 ? (
        <Banner tone="danger" title={errors.length === 1 ? "One image was not added" : `${errors.length} images were not added`}>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {errors.map((e) => (
              <li key={e.name} style={{ marginBottom: 3 }}>
                <strong>{e.name}</strong> — {e.message}
              </li>
            ))}
          </ul>
        </Banner>
      ) : null}

      <div className="hint">
        These are stored privately. Only you can open them, and each view link
        expires after a few minutes. What a file <em>claims</em> to be is checked
        here and again by the server; a renamed file is still rejected by size
        and type, but the extension alone is never proof of what a file contains.
        Maximum {Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.
      </div>
    </div>
  );
}

/** Attach images to a trade. */
export function AttachmentUploader({
  tradeId,
  onUploaded,
}: {
  tradeId: string;
  /** Called after each successful upload so the page can refresh its list. */
  onUploaded: () => void | Promise<void>;
}) {
  const { store } = useApp();

  const upload = useCallback(
    (file: File) => store.uploadAttachment({ tradeId, file }),
    [store, tradeId]
  );

  return (
    <UploaderCore
      ariaLabel="Add chart screenshots to this trade"
      title="Add chart screenshots"
      hint="Drag images here, or click to choose. PNG, JPEG, WebP or GIF, up to 10 MB each."
      subject="trade"
      upload={upload}
      onUploaded={onUploaded}
    />
  );
}

/** Attach images to a journal entry. */
export function JournalAttachmentUploader({
  journalEntryId,
  onUploaded,
}: {
  journalEntryId: string;
  /** Called after each successful upload so the page can refresh its list. */
  onUploaded: () => void | Promise<void>;
}) {
  const { store } = useApp();

  const upload = useCallback(
    (file: File) => store.uploadJournalAttachment({ journalEntryId, file }),
    [store, journalEntryId]
  );

  return (
    <UploaderCore
      ariaLabel="Add images to this journal entry"
      title="Add images"
      hint="Drag images here, or click to choose. PNG, JPEG, WebP or GIF, up to 10 MB each."
      subject="journal entry"
      upload={upload}
      onUploaded={onUploaded}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Gallery                                                            */
/* ------------------------------------------------------------------ */

/**
 * The shared gallery.
 *
 * `resolveUrl` and `remove` are what make it work for either kind of row.
 * Everything else — the grid, the lightbox, the per-file delete — is identical,
 * because to the user an image on a trade and an image on a journal entry are
 * the same object.
 */
function GalleryCore({
  attachments,
  resolveUrl,
  remove,
  onDeleted,
  emptyTitle,
  emptyBody,
}: {
  attachments: RenderableAttachment[];
  resolveUrl: ResolveUrl;
  remove: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDeleted: () => void | Promise<void>;
  emptyTitle: string;
  emptyBody: string;
}) {
  const [preview, setPreview] = useState<{ attachment: RenderableAttachment; url: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (attachments.length === 0) {
    return (
      <div className="state" style={{ padding: "26px 18px" }}>
        <div className="state-icon">
          <Icon path={icons.image} size={20} />
        </div>
        <div className="state-title">{emptyTitle}</div>
        <div className="state-body">{emptyBody}</div>
      </div>
    );
  }

  return (
    <div className="stack-sm">
      {error ? (
        <Banner tone="danger" title="Could not open that image">
          {error}
        </Banner>
      ) : null}

      <div className="attachment-grid">
        {attachments.map((a) => (
          <div key={a.id} className="attachment-card">
            <AttachmentThumb
              attachment={a}
              resolveUrl={resolveUrl}
              onOpen={(url) => setPreview({ attachment: a, url })}
              onError={setError}
            />
            <div className="attachment-meta">
              <div className="attachment-name" title={a.fileName}>
                {a.fileName}
              </div>
              <div className="hint">
                {formatBytes(a.byteSize)} · {a.mimeType.replace("image/", "").toUpperCase()}
              </div>
              {a.caption ? <div className="attachment-caption">{a.caption}</div> : null}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm attachment-delete"
              disabled={deleting === a.id}
              onClick={async () => {
                setDeleting(a.id);
                setError(null);
                const result = await remove(a.id);
                setDeleting(null);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                await onDeleted();
              }}
              aria-label={`Remove ${a.fileName}`}
              title="Remove this image"
            >
              <Icon path={icons.trash} />
            </button>
          </div>
        ))}
      </div>

      {preview ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={preview.attachment.fileName}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreview(null);
          }}
        >
          <div className="lightbox">
            <div className="modal-head">
              <div>
                <div className="modal-title">{preview.attachment.fileName}</div>
                <div className="hint">
                  {formatBytes(preview.attachment.byteSize)} ·{" "}
                  {preview.attachment.mimeType.replace("image/", "").toUpperCase()}
                  {preview.attachment.caption ? ` · ${preview.attachment.caption}` : ""}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPreview(null)}
                aria-label="Close"
              >
                <Icon path={icons.close} />
              </button>
            </div>
            <img
              className="lightbox-image"
              src={preview.url}
              alt={preview.attachment.caption ?? preview.attachment.fileName}
            />
            <div className="hint" style={{ marginTop: 12 }}>
              This link expires shortly. The file itself is private and is not publicly reachable.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Show the images attached to a trade. */
export function AttachmentGallery({
  attachments,
  onDeleted,
}: {
  attachments: TradeAttachment[];
  onDeleted: () => void | Promise<void>;
}) {
  const { store } = useApp();

  const resolveUrl = useCallback(
    (attachment: TradeAttachment) => store.attachmentUrl(attachment),
    [store]
  );
  const remove = useCallback((id: string) => store.deleteAttachment(id), [store]);

  return (
    <GalleryCore
      attachments={attachments}
      resolveUrl={resolveUrl as ResolveUrl}
      remove={remove}
      onDeleted={onDeleted}
      emptyTitle="No screenshots yet"
      emptyBody="Attach a chart or a setup screenshot to a trade. It is a private file, readable only by you, and it moves with the trade rather than being a separate note to reconcile later."
    />
  );
}

/** Show the images attached to a journal entry. */
export function JournalAttachmentGallery({
  attachments,
  onDeleted,
}: {
  attachments: JournalAttachment[];
  onDeleted: () => void | Promise<void>;
}) {
  const { store } = useApp();

  const resolveUrl = useCallback(
    (attachment: JournalAttachment) => store.journalAttachmentUrl(attachment),
    [store]
  );
  const remove = useCallback((id: string) => store.deleteJournalAttachment(id), [store]);

  return (
    <GalleryCore
      attachments={attachments}
      resolveUrl={resolveUrl as ResolveUrl}
      remove={remove}
      onDeleted={onDeleted}
      emptyTitle="No images yet"
      emptyBody="Attach a chart to this entry — the levels you were watching, or the screenshot you kept meaning to write up. It is a private file, readable only by you, and it stays with the entry."
    />
  );
}

/**
 * A single thumbnail.
 *
 * The URL is fetched on mount and held only in this component's state. It is
 * never written to the database, never cached beyond the component, and never
 * logged — a signed URL is a bearer token for its lifetime.
 */
function AttachmentThumb({
  attachment,
  resolveUrl,
  onOpen,
  onError,
}: {
  attachment: RenderableAttachment;
  resolveUrl: ResolveUrl;
  onOpen: (url: string) => void;
  onError: (message: string | null) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let minted: string | null = null;

    resolveUrl(attachment as never)
      .then((result) => {
        if (cancelled) return;
        if (result.error || !result.data) {
          setFailed(true);
          return;
        }
        minted = result.data;
        setUrl(result.data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      // A blob URL keeps its blob alive until revoked. Signed https URLs need
      // no cleanup.
      if (minted && minted.startsWith("blob:")) URL.revokeObjectURL(minted);
    };
  }, [resolveUrl, attachment]);

  if (failed) {
    return (
      <div className="attachment-thumb attachment-thumb-failed">
        <Icon path={icons.warning} size={18} />
        <div className="hint" style={{ marginTop: 6 }}>
          Could not open
        </div>
      </div>
    );
  }

  if (!url) {
    return <div className="attachment-thumb skeleton" aria-busy="true" />;
  }

  return (
    <button
      type="button"
      className="attachment-thumb"
      onClick={() => {
        onError(null);
        onOpen(url);
      }}
      aria-label={`Open ${attachment.fileName}`}
    >
      <img
        src={url}
        alt={attachment.caption ?? attachment.fileName}
        onError={() => setFailed(true)}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* A compact count for tables and headers                             */
/* ------------------------------------------------------------------ */

export function AttachmentCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="chip" title={`${count} screenshot${count === 1 ? "" : "s"} attached`}>
      <Icon path={icons.image} size={12} />
      {count}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
