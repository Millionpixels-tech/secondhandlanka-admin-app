import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

type Activity = { members: number; listings: number; conversations: number };
type Breakdown = { name: string; count: number }[];
type Summary = {
  generatedAt: string;
  days: number;
  timezone: string;
  totals: {
    members: number;
    listings: number;
    active: number;
    sold: number;
    removed: number;
    openReports: number;
    resolvedReports: number;
  };
  previous: Activity;
  daily: (Activity & { date: string })[];
  categories: Breakdown;
  districts: Breakdown;
};
const number = (value: number) => value.toLocaleString();
function comparison(current: number, previous: number) {
  if (!previous)
    return current
      ? "No activity in the previous period"
      : "No change from the previous period";
  const percent = ((current - previous) / previous) * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}% vs previous period`;
}
function BreakdownPanel({ title, rows }: { title: string; rows: Breakdown }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span>Current listings</span>
      </div>
      <div className="analytics-breakdown">
        {rows
          .filter((row) => row.count > 0)
          .map((row) => (
            <div key={row.name}>
              <div className="analytics-bar-label">
                <span>{row.name}</span>
                <strong>{number(row.count)}</strong>
              </div>
              <div className="analytics-bar-track" aria-hidden="true">
                <div style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        {!rows.some((row) => row.count > 0) && (
          <p>No listings in these locations or categories yet.</p>
        )}
      </div>
    </section>
  );
}
export function Analytics({ version }: { version: number }) {
  const [days, setDays] = useState(30);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError("");
    void httpsCallable<{ days: number }, Summary>(
      functions,
      "getMarketplaceAnalytics",
      { timeout: 120_000 },
    )({ days })
      .then((result) => {
        if (!cancelled) setData(result.data);
      })
      .catch((error) => {
        if (!cancelled)
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load analytics.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, version, retry]);
  const activity = data?.daily.reduce<Activity>(
    (sum, day) => ({
      members: sum.members + day.members,
      listings: sum.listings + day.listings,
      conversations: sum.conversations + day.conversations,
    }),
    { members: 0, listings: 0, conversations: 0 },
  );
  const max = Math.max(
    1,
    ...(data?.daily.flatMap((day) => [day.listings, day.conversations]) ?? []),
  );
  return (
    <div className="analytics">
      <div className="analytics-toolbar">
        <label>
          Reporting period
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {[7, 30, 90].map((value) => (
              <option value={value} key={value}>
                Last {value} days
              </option>
            ))}
          </select>
        </label>
        <small>Calendar days in Sri Lanka · Today is partial</small>
      </div>
      {loading && (
        <div className="panel empty" role="status">
          Loading marketplace analytics…
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            className="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {data && activity && (
        <>
          <div className="analytics-cards">
            {(
              [
                [
                  "New member profiles",
                  activity.members,
                  comparison(activity.members, data.previous.members),
                ],
                [
                  "New listings",
                  activity.listings,
                  comparison(activity.listings, data.previous.listings),
                ],
                [
                  "New buyer enquiries",
                  activity.conversations,
                  comparison(
                    activity.conversations,
                    data.previous.conversations,
                  ),
                ],
                [
                  "Listings marked sold",
                  data.totals.sold,
                  "Current total · Seller reported",
                ],
              ] as const
            ).map(([label, value, detail]) => (
              <section className="panel analytics-card" key={label}>
                <small>{label}</small>
                <strong>{number(value)}</strong>
                <p>{detail}</p>
              </section>
            ))}
          </div>
          <section className="panel">
            <div className="panel-head">
              <h2>Daily marketplace activity</h2>
              <span>Last {data.days} days</span>
            </div>
            <div className="analytics-chart-legend">
              <span>● New listings</span>
              <span>● Buyer enquiries</span>
            </div>
            <div
              className="analytics-chart"
              role="img"
              aria-label="Daily new listings and buyer enquiries. Exact counts are available in the daily data table below."
            >
              {data.daily.map((day) => (
                <div
                  className="analytics-chart-day"
                  key={day.date}
                  title={`${day.date}: ${day.listings} listings, ${day.conversations} enquiries`}
                >
                  <div style={{ height: `${(day.listings / max) * 100}%` }} />
                  <div
                    style={{ height: `${(day.conversations / max) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="panel-footer">
              <small>{data.daily[0]?.date}</small>
              <small>{data.daily.at(-1)?.date}</small>
            </div>
            <details className="analytics-daily">
              <summary>View daily counts</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>New profiles</th>
                      <th>New listings</th>
                      <th>Buyer enquiries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((day) => (
                      <tr key={day.date}>
                        <td>{day.date}</td>
                        <td>{number(day.members)}</td>
                        <td>{number(day.listings)}</td>
                        <td>{number(day.conversations)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <div className="analytics-grid">
            <section className="panel">
              <div className="panel-head">
                <h2>Marketplace now</h2>
              </div>
              <dl className="analytics-totals">
                {(
                  [
                    ["Member profiles", data.totals.members],
                    ["Total listings", data.totals.listings],
                    ["Active listings", data.totals.active],
                    ["Marked sold", data.totals.sold],
                    ["Removed listings", data.totals.removed],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{number(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>Moderation now</h2>
              </div>
              <dl className="analytics-totals">
                <div>
                  <dt>Open reports</dt>
                  <dd>{number(data.totals.openReports)}</dd>
                </div>
                <div>
                  <dt>Resolved reports</dt>
                  <dd>{number(data.totals.resolvedReports)}</dd>
                </div>
              </dl>
            </section>
            <BreakdownPanel
              title="Listings by category"
              rows={data.categories}
            />
            <BreakdownPanel
              title="Listings by district"
              rows={data.districts}
            />
          </div>
          <p className="analytics-note">
            Updated {new Date(data.generatedAt).toLocaleString()}. Results may
            be cached for one minute. Counts reflect records still stored,
            including removed listings. Deleted records are excluded; historical
            totals can change. Category and district charts include all listing
            statuses and recognised marketplace options. Member counts are
            profiles, not all authentication accounts. Enquiries count
            conversations started, which may not contain a message. Previous
            periods include the same portion of their final day. Views,
            favourites, revenue and sale dates are not tracked here.
          </p>
        </>
      )}
    </div>
  );
}
