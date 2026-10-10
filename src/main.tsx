import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  browserSessionPersistence,
  onIdTokenChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  ShieldCheck,
  Flag,
  Users,
  Package,
  LogOut,
  ArrowUpRight,
  Search,
  BarChart3,
} from "lucide-react";
import { auth, db, functions, configured, POLICY_VERSION } from "./firebase";
import "./style.css";
import { Analytics } from "./Analytics";

type Row = { id: string } & DocumentData;
type RecordTab = "reports" | "users" | "listings";
type Tab = RecordTab | "analytics";
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please retry.";
const text = (value: unknown) => (typeof value === "string" ? value : "");
const date = (value: unknown) =>
  value &&
  typeof value === "object" &&
  "toDate" in value &&
  typeof value.toDate === "function"
    ? value.toDate().toLocaleString()
    : "—";
const safeImage = (value: unknown) => {
  try {
    const u = new URL(text(value));
    return u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let generation = 0;
    const stop = onIdTokenChanged(auth, (candidate) => {
      const current = ++generation;
      setUser(null);
      setChecking(true);
      void (async () => {
        try {
          if (!candidate) return;
          const token = await candidate.getIdTokenResult();
          if (current !== generation) return;
          if (
            token.claims.moderator !== true ||
            token.signInProvider !== "password"
          ) {
            await signOut(auth);
            setError(
              "Access denied. Only accounts with moderator: true can use this panel.",
            );
            return;
          }
          setError("");
          setUser(candidate);
        } catch (e) {
          if (current === generation) {
            setError(errorMessage(e));
            await signOut(auth);
          }
        } finally {
          if (current === generation) setChecking(false);
        }
      })();
    });
    const refresh = window.setInterval(
      () => {
        if (auth.currentUser)
          void auth.currentUser.getIdToken(true).catch(() => signOut(auth));
      },
      5 * 60 * 1000,
    );
    return () => {
      generation++;
      stop();
      window.clearInterval(refresh);
    };
  }, []);
  if (!configured)
    return (
      <div className="login">
        <h1>Firebase configuration needed</h1>
        <p>
          Copy .env.example to .env.local, add the Firebase web configuration,
          and restart the server.
        </p>
      </div>
    );
  if (checking)
    return (
      <div className="login">
        <p role="status">Checking access…</p>
      </div>
    );
  if (!user) return <Login error={error} setError={setError} />;
  return <Access key={user.uid} user={user} />;
}
function Login({
  error,
  setError,
}: {
  error: string;
  setError: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <div className="brand">
        <ShieldCheck /> Secondhand <span>ADMIN</span>
      </div>
      <h1>
        A safer marketplace
        <br />
        starts here.
      </h1>
      <p>
        Sign in with your moderator account to review reports and manage the
        community.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await setPersistence(auth, browserSessionPersistence);
            await signInWithEmailAndPassword(
              auth,
              String(data.get("email")),
              String(data.get("password")),
            );
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            disabled={busy}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={busy}>
          {busy ? "Signing in…" : "Sign in to admin"} <ArrowUpRight size={16} />
        </button>
      </form>
      <small>Access is restricted to authorised moderators.</small>
    </main>
  );
}
function Access({ user }: { user: User }) {
  const [state, setState] = useState<
    "loading" | "ready" | "consent" | "restricted" | "error"
  >("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stopped = false;
    return onSnapshot(
      doc(db, "accountStates", user.uid),
      (snap) => {
        stopped = snap.exists();
        if (stopped) {
          setState("restricted");
          return;
        }
        void getDoc(doc(db, "policyAcceptances", user.uid))
          .then((consent) => {
            if (!stopped)
              setState(
                consent.data()?.version === POLICY_VERSION
                  ? "ready"
                  : "consent",
              );
          })
          .catch((e) => {
            setError(errorMessage(e));
            setState("error");
          });
      },
      (e) => {
        setError(errorMessage(e));
        setState("error");
      },
    );
  }, [user.uid]);
  if (state === "ready") return <Dashboard user={user} />;
  return (
    <main className="login">
      <div className="brand">
        <ShieldCheck /> Secondhand Admin
      </div>
      <h1>
        {state === "restricted"
          ? "Account restricted"
          : state === "consent"
            ? "Community rules"
            : state === "error"
              ? "Unable to verify access"
              : "Checking account…"}
      </h1>
      {state === "consent" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await httpsCallable(
                functions,
                "acceptPolicy",
              )({ version: POLICY_VERSION, accepted: true });
              setState("ready");
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            No scams, prohibited items, harassment, threats, sexual or hateful
            content, or spam. Review evidence fairly, protect private report
            information, and record a reason for each decision.
          </p>
          <p>
            <a
              href="https://secondhandlanka.lk/terms"
              target="_blank"
              rel="noreferrer"
            >
              Read terms and community rules
            </a>
          </p>
          <label className="check">
            <input type="checkbox" required /> I accept the community rules.
          </label>
          <button disabled={busy}>Accept and continue</button>
        </form>
      )}
      {state === "restricted" && (
        <p>
          Suspended accounts and accounts being deleted cannot access the panel.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="secondary" onClick={() => void signOut(auth)}>
        Sign out
      </button>
      {state === "error" && (
        <button className="secondary" onClick={() => window.location.reload()}>
          Retry
        </button>
      )}
    </main>
  );
}
function Dashboard({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>("reports");
  const [owner, setOwner] = useState("");
  const [reportStatus, setReportStatus] = useState("open");
  const [version, setVersion] = useState(0);
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <ShieldCheck /> Secondhand<span>ADMIN</span>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {(
            [
              ["reports", Flag, "Reports"],
              ["users", Users, "Users"],
              ["listings", Package, "Listings"],
              ["analytics", BarChart3, "Analytics"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setOwner("");
              }}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="account">
          <small>Signed in as</small>
          <p>{user.email}</p>
          <button className="secondary" onClick={() => void signOut(auth)}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <span>Community operations</span>
          <span className="badge">Moderator access</span>
        </header>
        <div className="heading">
          <div>
            <p className="eyebrow">SECONDHAND LANKA</p>
            <h1>
              {tab === "analytics"
                ? "Marketplace analytics"
                : tab === "reports"
                  ? "Moderation queue"
                  : tab === "users"
                    ? "Marketplace members"
                    : "Marketplace listings"}
            </h1>
            <p>
              {tab === "analytics"
                ? "Understand marketplace growth, buyer interest, and community activity."
                : tab === "reports"
                  ? "Review the evidence. Make a decision. Keep the community safe."
                  : tab === "users"
                    ? "Inspect member profiles and their listings."
                    : "Browse listing details, sellers, and publication status."}
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => setVersion((v) => v + 1)}
          >
            Refresh
          </button>
        </div>
        {tab === "reports" && (
          <div className="tabs">
            {["open", "resolved"].map((status) => (
              <button
                className={reportStatus === status ? "selected" : "secondary"}
                key={status}
                onClick={() => setReportStatus(status)}
              >
                {status === "open" ? "Open reports" : "Review history"}
              </button>
            ))}
          </div>
        )}
        {tab === "listings" && (
          <form
            className="filter"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setOwner(String(data.get("owner")).trim());
            }}
            key={owner}
          >
            <Search size={18} />
            <input
              aria-label="Seller UID"
              name="owner"
              placeholder="Filter by exact seller UID"
              defaultValue={owner}
            />
            <button>Filter</button>
            {owner && (
              <button
                type="button"
                className="secondary"
                onClick={() => setOwner("")}
              >
                Clear
              </button>
            )}
          </form>
        )}
        {tab === "analytics" ? (
          <Analytics version={version} />
        ) : (
          <Records
            key={`${tab}:${owner}:${reportStatus}:${version}`}
            tab={tab}
            owner={owner}
            status={reportStatus}
            refresh={() => setVersion((v) => v + 1)}
            inspectSeller={(uid) => {
              setOwner(uid);
              setTab("listings");
            }}
          />
        )}
      </main>
    </div>
  );
}
function Records({
  tab,
  owner,
  status,
  refresh,
  inspectSeller,
}: {
  tab: RecordTab;
  owner: string;
  status: string;
  refresh: () => void;
  inspectSeller: (uid: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  async function fetchPage(
    after: QueryDocumentSnapshot | null,
    cancelled = () => false,
  ) {
    setLoading(true);
    setError("");
    try {
      const constraints: QueryConstraint[] =
        tab === "reports"
          ? [where("status", "==", status), orderBy("createdAt", "asc")]
          : tab === "listings" && owner
            ? [where("ownerId", "==", owner)]
            : [orderBy(documentId())];
      if (after) constraints.push(startAfter(after));
      const snap = await getDocs(
        query(
          collection(db, tab === "users" ? "profiles" : tab),
          ...constraints,
          limit(25),
        ),
      );
      if (cancelled()) return;
      const incoming = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setRows((old) => (after ? [...old, ...incoming] : incoming));
      setCursor(snap.docs.at(-1) || null);
      setMore(snap.size === 25);
    } catch (e) {
      if (!cancelled()) setError(errorMessage(e));
    } finally {
      if (!cancelled()) setLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    void fetchPage(null, () => cancelled);
    return () => {
      cancelled = true;
    };
    // Records is keyed by all query inputs; every input change remounts the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      {error && (
        <div role="alert" className="error">
          {error}
          <button className="secondary" onClick={() => void fetchPage(cursor)}>
            Retry
          </button>
        </div>
      )}
      <section className="panel">
        <div className="panel-head">
          <h2>
            {tab === "reports"
              ? "Reports"
              : tab === "users"
                ? "Users"
                : "Listings"}
          </h2>
          <span>{rows.length} loaded</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  {tab === "reports"
                    ? "Reason / content"
                    : tab === "users"
                      ? "Member"
                      : "Item"}
                </th>
                <th>
                  {tab === "reports"
                    ? "Reported member"
                    : tab === "users"
                      ? "District"
                      : "Seller"}
                </th>
                <th>{tab === "users" ? "Joined" : "Status"}</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>
                      {text(
                        tab === "reports"
                          ? row.reason
                          : tab === "users"
                            ? row.displayName
                            : row.title,
                      ) || "Unnamed"}
                    </strong>
                    <small>
                      {tab === "reports"
                        ? `${text(row.kind)} · ${date(row.createdAt)}`
                        : row.id}
                    </small>
                  </td>
                  <td className="mono">
                    {text(
                      tab === "reports"
                        ? row.targetUid
                        : tab === "users"
                          ? row.district
                          : row.ownerId,
                    )}
                  </td>
                  <td>
                    {tab === "users" ? (
                      date(row.createdAt)
                    ) : (
                      <span className={`status ${text(row.status)}`}>
                        {text(row.status)}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="secondary compact"
                      onClick={() => setSelected(row)}
                    >
                      {tab === "reports" && status === "open"
                        ? "Review"
                        : "View"}
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="empty">
            {loading
              ? "Loading…"
              : error
                ? "Could not load records."
                : "No records found."}
          </div>
        )}
        <div className="panel-footer">
          <small>25 records per page</small>
          {more && (
            <button
              className="secondary"
              disabled={loading}
              onClick={() => void fetchPage(cursor)}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </section>
      {selected && (
        <Details
          row={selected}
          tab={tab}
          close={() => setSelected(null)}
          refresh={refresh}
          inspectSeller={inspectSeller}
        />
      )}
    </>
  );
}
function Details({
  row,
  tab,
  close,
  refresh,
  inspectSeller,
}: {
  row: Row;
  tab: RecordTab;
  close: () => void;
  refresh: () => void;
  inspectSeller: (uid: string) => void;
}) {
  const [action, setAction] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accountStatus, setAccountStatus] = useState("Checking…");
  useEffect(() => {
    if (tab !== "users") return;
    let active = true;
    void getDoc(doc(db, "accountStates", row.id))
      .then((snap) => {
        if (active)
          setAccountStatus(snap.exists() ? text(snap.data().status) : "Active");
      })
      .catch((e) => {
        if (active) setAccountStatus(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [row.id, tab]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  const evidence = tab === "reports" ? row.evidence || {} : row;
  const images = Array.isArray(evidence.images)
    ? evidence.images
    : evidence.photoURL
      ? [evidence.photoURL]
      : [];
  return (
    <dialog
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
      aria-labelledby="detail-title"
    >
      <div className="dialog-head">
        <div>
          <p className="eyebrow">
            {tab === "reports" ? "REPORT EVIDENCE" : tab.toUpperCase()}
          </p>
          <h2 id="detail-title">
            {text(
              evidence.title || evidence.displayName || evidence.listingTitle,
            ) || "Record details"}
          </h2>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={close}
          aria-label="Close details"
        >
          Close
        </button>
      </div>
      <div className="detail-body">
        <p className="mono">ID: {row.id}</p>
        {tab === "reports" && (
          <>
            <h3>{text(row.reason)}</h3>
            <p>{text(row.details) || "No additional details."}</p>
            <p className="mono">
              Reporter: {text(row.reporterId)}
              <br />
              Reported member: {text(row.targetUid)}
              <br />
              Target: {text(row.targetId)}
            </p>
          </>
        )}
        <p className="prewrap">{text(evidence.description || evidence.bio)}</p>
        <div className="images">
          {images.map(
            (url: unknown, i: number) =>
              safeImage(url) && (
                <img
                  key={i}
                  src={safeImage(url)}
                  alt={`Evidence ${i + 1}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ),
          )}
        </div>
        {Array.isArray(evidence.messages) && (
          <div className="messages">
            <h3>Reported conversation · recent messages</h3>
            {evidence.messages.map((m: DocumentData, i: number) => (
              <div key={i}>
                <small className="mono">{text(m.senderId)}</small>
                <p className="prewrap">{text(m.text)}</p>
              </div>
            ))}
          </div>
        )}
        {tab === "listings" && (
          <>
            <dl>
              <dt>Price</dt>
              <dd>{Number(row.price).toLocaleString()} LKR</dd>
              <dt>Status</dt>
              <dd>{text(row.status)}</dd>
              <dt>Category / condition</dt>
              <dd>
                {text(row.category)} / {text(row.condition)}
              </dd>
              <dt>Location</dt>
              <dd>
                {text(row.district)} · {text(row.location)}
              </dd>
              <dt>Seller UID</dt>
              <dd className="mono">{text(row.ownerId)}</dd>
            </dl>
            <p>
              Removal and suspension actions are available when reviewing an
              open report.
            </p>
          </>
        )}
        {tab === "users" && (
          <>
            <dl>
              <dt>District</dt>
              <dd>{text(row.district)}</dd>
              <dt>Account status</dt>
              <dd>{accountStatus}</dd>
              <dt>Joined</dt>
              <dd>{date(row.createdAt)}</dd>
            </dl>
            <button onClick={() => inspectSeller(row.id)}>
              View this member’s listings
              <ArrowUpRight size={16} />
            </button>
          </>
        )}
        {tab === "reports" && row.status === "resolved" && (
          <div className="decision">
            <h3>Review decision</h3>
            <p>
              {text(row.action)} · {date(row.resolvedAt)}
            </p>
            <p className="prewrap">{text(row.note)}</p>
            <small className="mono">Moderator: {text(row.moderatorId)}</small>
          </div>
        )}
        {tab === "reports" && row.status === "open" && (
          <form
            className="review"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await httpsCallable(
                  functions,
                  "reviewReport",
                )({ reportId: row.id, action, note: note.trim() });
                refresh();
                close();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Record a decision</h3>
            <label>
              Action
              <select
                required
                value={action}
                onChange={(e) => setAction(e.target.value)}
                disabled={busy}
              >
                <option value="">Choose an action</option>
                <option value="dismiss">Dismiss report</option>
                {row.kind === "listing" && (
                  <option value="removeListing">Remove listing</option>
                )}
                <option value="suspendUser">Suspend member</option>
              </select>
            </label>
            {action && (
              <p>
                {action === "suspendUser"
                  ? "Suspension stops member activity and removes their listings. They can appeal through support."
                  : action === "removeListing"
                    ? "This permanently removes the listing. Its owner cannot restore it."
                    : "Dismiss this report without restricting the member."}
              </p>
            )}
            <label>
              Review reason
              <textarea
                required
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                rows={3}
              />
            </label>
            <label className="check">
              <input key={action} type="checkbox" required disabled={busy} /> I
              reviewed the evidence and confirm this action.
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button disabled={busy || !action || !note.trim()}>
              {busy ? "Saving…" : "Confirm decision"}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
