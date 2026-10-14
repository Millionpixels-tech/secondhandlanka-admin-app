import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { TicketAttachments } from "./PhotoViewer";
type Ticket = {
  id: string;
  userId: string;
  subject: string;
  category?: string;
  subcategory?: string;
  images?: string[];
  status: string;
  version: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
type Update = {
  id: string;
  text: string;
  role: string;
  status: string;
  createdAt?: Timestamp;
};
const statuses = ["open", "in-progress", "resolved", "closed"];
const label = (value: string) => value.replace(/-/g, " ");
const date = (value?: Timestamp) => value?.toDate().toLocaleString() || "—";
const queueDate = (value?: Timestamp) => {
  if (!value) return "—";
  const updated = value.toDate();
  return updated.toDateString() === new Date().toDateString()
    ? updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : updated.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        ...(updated.getFullYear() !== new Date().getFullYear()
          ? { year: "numeric" }
          : {}),
      });
};
export function Tickets({ version }: { version: number }) {
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setRows([]);
    setError("");
    setLoading(true);
    const target =
      status === "all"
        ? query(collection(db, "tickets"), orderBy("updatedAt", "desc"))
        : query(
            collection(db, "tickets"),
            where("status", "==", status),
            orderBy("updatedAt", "desc"),
          );
    return onSnapshot(
      target,
      (snapshot) => {
        setRows(
          snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Ticket),
        );
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [status, version]);
  return (
    <div className="ticket-workspace">
      <section className="ticket-queue" aria-label="Ticket queue">
        <div className="ticket-queue-header">
          <div className="ticket-panel-heading">
            <h2>Tickets</h2>
            <span>{loading ? "…" : rows.length}</span>
          </div>
          <label className="ticket-filter">
            Filter by status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setSelected(null);
              }}
            >
              {["all", ...statuses].map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "All statuses" : label(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ticket-list">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {loading && (
            <p className="ticket-queue-note" role="status">
              Loading tickets…
            </p>
          )}
          {!loading && !error && !rows.length && (
            <p className="ticket-queue-note">No tickets with this status.</p>
          )}
          {rows.map((ticket) => (
            <button
              className={`ticket-row${selected === ticket.id ? " is-selected" : ""}`}
              key={ticket.id}
              aria-pressed={selected === ticket.id}
              onClick={() => setSelected(ticket.id)}
            >
              <div className="ticket-row-heading">
                <strong title={ticket.subject}>{ticket.subject}</strong>
              </div>
              <div className="ticket-row-meta">
                <span
                  className={`ticket-status ticket-status-${ticket.status}`}
                >
                  {label(ticket.status)}
                </span>
                <small title={`Updated ${date(ticket.updatedAt)}`}>
                  {queueDate(ticket.updatedAt)}
                </small>
              </div>
            </button>
          ))}
        </div>
      </section>
      <div className="ticket-detail-pane">
        {selected ? (
          <TicketDetail key={selected} id={selected} />
        ) : (
          <div className="ticket-selection-empty">
            <h2>Select a ticket</h2>
            <p>
              Choose a request on the left to view its details and reply to the
              member.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TicketDetail({ id }: { id: string }) {
  const conversation = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [status, setStatus] = useState("");
  const [text, setText] = useState("");
  const [updateId, setUpdateId] = useState(
    () => doc(collection(db, "tickets", id, "updates")).id,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () =>
      onSnapshot(
        doc(db, "tickets", id),
        (snapshot) => {
          setLoading(false);
          if (!snapshot.exists()) {
            setTicket(null);
            setError("Ticket unavailable.");
            return;
          }
          const next = { ...snapshot.data(), id } as Ticket;
          setTicket(next);
          setStatus(next.status);
        },
        (e) => {
          setLoading(false);
          setTicket(null);
          setError(e.message);
        },
      ),
    [id],
  );
  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, "tickets", id, "updates"),
          orderBy("createdAt", "asc"),
        ),
        (snapshot) =>
          setUpdates(
            snapshot.docs.map(
              (doc) => ({ ...doc.data(), id: doc.id }) as Update,
            ),
          ),
        (e) => setError(e.message),
      ),
    [id],
  );
  useEffect(() => {
    if (followLatest.current && conversation.current) {
      conversation.current.scrollTop = conversation.current.scrollHeight;
    }
  }, [updates, ticket]);
  return (
    <section className="ticket-detail" aria-label="Ticket details">
      {loading && <p role="status">Loading ticket…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {ticket && (
        <>
          <div className="ticket-detail-header">
            <div className="ticket-detail-title">
              <span className="ticket-row-id">Ticket #{id}</span>
              <h2>{ticket.subject}</h2>
            </div>
            <span className={`ticket-status ticket-status-${ticket.status}`}>
              {label(ticket.status)}
            </span>
          </div>
          <div
            className="ticket-chat-messages"
            ref={conversation}
            aria-label="Ticket conversation"
            onScroll={() => {
              const pane = conversation.current;
              if (pane)
                followLatest.current =
                  pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80;
            }}
          >
            {updates.map((update) => {
              const initial = update.id === id;
              const support = update.role === "moderator";
              return (
                <div className="ticket-chat-entry" key={update.id}>
                  <article
                    className={`ticket-chat-bubble${support ? " from-support" : " from-member"}`}
                  >
                    <strong>{support ? "Support team" : "Member"}</strong>
                    {initial && (
                      <div className="ticket-submitted-details">
                        <b>{ticket.subject}</b>
                        {ticket.category && (
                          <span>
                            {ticket.category} · {ticket.subcategory}
                          </span>
                        )}
                        <span>Ticket #{id}</span>
                        <span>Member: {ticket.userId}</span>
                      </div>
                    )}
                    <p>{update.text}</p>
                    <div className="ticket-message-meta">
                      <small>{date(update.createdAt)}</small>
                      {support && <span>{label(update.status)}</span>}
                    </div>
                  </article>
                  {initial && !!ticket.images?.length && (
                    <article className="ticket-chat-bubble from-member ticket-attachment-bubble">
                      <strong>Member · Attachments</strong>
                      <TicketAttachments images={ticket.images} />
                      <small>{date(update.createdAt)}</small>
                    </article>
                  )}
                </div>
              );
            })}
          </div>
          <form
            className="ticket-reply-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              followLatest.current = true;
              setError("");
              try {
                await httpsCallable(
                  functions,
                  "updateTicket",
                )({ id, updateId, text, status, version: ticket.version });
                setText("");
                setUpdateId(doc(collection(db, "tickets", id, "updates")).id);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Unable to update ticket.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Update status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={busy}
              >
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reply to member
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={3000}
                required
                disabled={busy}
                rows={3}
              />
            </label>

            <button disabled={busy || !text.trim()}>
              {busy ? "Sending…" : "Send update"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
