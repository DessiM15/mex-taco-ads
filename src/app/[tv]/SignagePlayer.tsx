"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface AdItem {
  src: string;
  type: "image" | "video";
  // The last day this ad plays (YYYY-MM-DD, restaurant time), when the portal
  // gave one. Checked here too, so an ad still comes down on its day if the
  // TV can't reach the portal to be told.
  until?: string | null;
}

// Where the loop came from: the portal's live list, the last list this TV
// saved, or the files baked into this app.
type Source = "portal" | "saved" | "files";

interface Loop {
  version: string;
  ads: AdItem[];
  source: Source;
}

// The portal decides what plays. Each TV address maps to a location and a
// screen number there. A new location's TVs open /play?venue=<id>&screen=<n>
// instead, so nothing here needs editing when one is added.
const PORTAL = "https://smartscaleagent.com";
const SCREENS: Record<string, { venue: string; screen: number }> = {
  tv1: { venue: "mex-taco-house", screen: 1 },
  tv2: { venue: "mex-taco-house", screen: 2 },
};
const POLL_INTERVAL = 2 * 60 * 1000;
const POLL_TIMEOUT = 15000;

// An image is held at full opacity for HOLD_DURATION, then the next ad
// crossfades in on top of it. So each ad is fully visible for exactly 10s
// and the slot pitch is 10.5s.
const HOLD_DURATION = 10000;
const CROSSFADE_DURATION = 500;
const SLOT_DURATION = HOLD_DURATION + CROSSFADE_DURATION;
const VIDEO_TIMEOUT = 30000;
const RELOAD_HOUR = 4;
const CST_OFFSET = -6;

interface Slot {
  index: number;
  // Index of the ad being faded out from, or null once the fade is over.
  prev: number | null;
  // Absolute timestamp at which the *next* ad starts fading in. Deadlines are
  // absolute rather than "now + 10500" so a timer that fires late on slow TV
  // hardware doesn't push the following one out — the error can't accumulate.
  fadeAt: number;
}

function getCSThour(): number {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  let cstHour = utcHour + CST_OFFSET;
  if (cstHour < 0) cstHour += 24;
  return cstHour + utcMinutes / 60;
}

// Today's date in restaurant time, to compare against an ad's last day.
function restaurantDate(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return "";
  }
}

function stillRunning(ad: AdItem, today: string): boolean {
  return !ad.until || !today || today <= ad.until;
}

function storageKey(venue: string, screen: number): string {
  return `signage:${venue}:${screen}`;
}

function readSaved(venue: string, screen: number): Loop | null {
  try {
    const raw = window.localStorage.getItem(storageKey(venue, screen));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { version?: string; ads?: AdItem[] };
    if (!saved.version || !Array.isArray(saved.ads) || saved.ads.length === 0) return null;
    return { version: saved.version, ads: saved.ads, source: "saved" };
  } catch {
    return null;
  }
}

function writeSaved(venue: string, screen: number, loop: Loop) {
  try {
    window.localStorage.setItem(
      storageKey(venue, screen),
      JSON.stringify({ version: loop.version, ads: loop.ads }),
    );
  } catch {}
}

// The files that ship with this app. The last resort, and what plays for a
// screen the portal has no slides for yet.
async function loadFiles(tv: string): Promise<Loop | null> {
  try {
    const res = await fetch(`/ads/${tv}/manifest.json`);
    if (!res.ok) return null;
    const manifest = (await res.json()) as string[];
    const ads = manifest
      .map((filename): AdItem | null => {
        const ext = filename.split(".").pop()?.toLowerCase();
        if (!ext) return null;
        if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
          return { src: `/ads/${tv}/${filename}`, type: "image" };
        }
        if (["mp4", "webm"].includes(ext)) {
          return { src: `/ads/${tv}/${filename}`, type: "video" };
        }
        return null;
      })
      .filter((item): item is AdItem => item !== null);
    return ads.length > 0 ? { version: `files:${manifest.join(",")}`, ads, source: "files" } : null;
  } catch {
    return null;
  }
}

// Asks the portal what to play, and in the same breath tells it this screen
// is alive and what it is showing. Returns:
//   a Loop   - the portal has a list for this screen
//   "empty"  - the portal answered, and has nothing for this screen
//   null     - the portal couldn't be reached; keep playing what we have
async function askPortal(
  venue: string,
  screen: number,
  playing: number,
  source: Source,
): Promise<Loop | "empty" | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POLL_TIMEOUT);
  try {
    const res = await fetch(
      `${PORTAL}/api/screens/${encodeURIComponent(venue)}/${screen}?playing=${playing}&source=${source}`,
      { cache: "no-store", signal: controller.signal },
    );
    if (res.status === 404) return "empty";
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ok?: boolean;
      ready?: boolean;
      version?: string;
      slides?: { src?: string; type?: string; until?: string | null }[];
    };
    if (!json.ok || !Array.isArray(json.slides)) return null;
    const ads = json.slides
      .filter((s) => s.src && (s.type === "image" || s.type === "video"))
      .map((s): AdItem => ({ src: String(s.src), type: s.type as "image" | "video", until: s.until ?? null }));
    if (!json.ready || ads.length === 0) return "empty";
    return { version: `portal:${json.version ?? ""}`, ads, source: "portal" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function scheduleNightlyReload() {
  let reloadedToday = false;
  const check = () => {
    const cstHour = getCSThour();
    if (cstHour >= RELOAD_HOUR && cstHour < RELOAD_HOUR + 2 / 60 && !reloadedToday) {
      reloadedToday = true;
      // Reloading with no connection would swap a working loop for a blank
      // page. The list itself refreshes every two minutes, so tonight's
      // reload can wait for tomorrow.
      if (navigator.onLine !== false) window.location.reload();
    }
    // Reset flag after the window passes
    if (cstHour >= RELOAD_HOUR + 2 / 60) {
      reloadedToday = false;
    }
  };
  setInterval(check, 30000);
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      let wakeLock = await (navigator as any).wakeLock.request("screen");
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible") {
          try {
            wakeLock = await (navigator as any).wakeLock.request("screen");
          } catch {}
        }
      });
    }
  } catch {}
}

export default function SignagePlayer({
  tv,
  venue,
  screen,
}: {
  tv: string;
  venue?: string;
  screen?: number;
}) {
  const [ads, setAds] = useState<AdItem[]>([]);
  const [slot, setSlot] = useState<Slot>({ index: 0, prev: null, fadeAt: 0 });
  const preloadedVideos = useRef<Set<string>>(new Set());
  // What is on screen now, and a newer list waiting for the current ad to end.
  const current = useRef<Loop | null>(null);
  const waiting = useRef<Loop | null>(null);

  const target = venue && screen ? { venue, screen } : SCREENS[tv];

  // Start a loop from the top. Only used when nothing is playing yet.
  const begin = useCallback((loop: Loop) => {
    current.current = loop;
    waiting.current = null;
    setAds(loop.ads);
    setSlot({ index: 0, prev: null, fadeAt: Date.now() + SLOT_DURATION });
  }, []);

  // Take a newer list. It is swapped in when the current ad finishes rather
  // than mid-ad, so nothing is cut off on screen.
  const offer = useCallback(
    (loop: Loop) => {
      if (!current.current) return begin(loop);
      if (current.current.version === loop.version) {
        waiting.current = null;
        return;
      }
      waiting.current = loop;
    },
    [begin],
  );

  // Find something to play, best source first, then keep asking the portal.
  useEffect(() => {
    let stopped = false;

    const check = async (first: boolean) => {
      if (!target) {
        if (first) {
          const files = await loadFiles(tv);
          if (!stopped && files) begin(files);
          else if (!stopped) setTimeout(() => window.location.reload(), 10000);
        }
        return;
      }

      const playingNow = current.current;
      const answer = await askPortal(
        target.venue,
        target.screen,
        playingNow ? playingNow.ads.length : 0,
        playingNow ? playingNow.source : "files",
      );
      if (stopped) return;

      if (answer && answer !== "empty") {
        writeSaved(target.venue, target.screen, answer);
        offer(answer);
        return;
      }

      // The portal has nothing for this screen: play the shipped files.
      // The portal couldn't be reached: keep what's playing; if nothing is
      // yet, use the last saved list, then the shipped files.
      if (answer === "empty" || !current.current) {
        const saved = answer === "empty" ? null : readSaved(target.venue, target.screen);
        const fallback = saved ?? (await loadFiles(tv));
        if (stopped) return;
        if (fallback) offer(fallback);
        else if (first) setTimeout(() => window.location.reload(), 10000);
      }
    };

    check(true);
    const poll = setInterval(() => check(false), POLL_INTERVAL);
    return () => {
      stopped = true;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tv, target?.venue, target?.screen]);

  // Wake lock and nightly reload
  useEffect(() => {
    requestWakeLock();
    scheduleNightlyReload();
  }, []);

  const advance = useCallback(() => {
    const now = Date.now();

    // A newer list is waiting, or an ad in this one has passed its last day:
    // switch lists on the boundary between two ads.
    const today = restaurantDate();
    const next = waiting.current;
    const running = (next ?? current.current)?.ads.filter((ad) => stillRunning(ad, today));
    const base = next ?? current.current;
    if (base && running && running.length > 0 && (next || running.length !== base.ads.length)) {
      current.current = { ...base, ads: running };
      waiting.current = null;
      preloadedVideos.current = new Set();
      setAds(running);
      // Carry on from where the loop was: the ad after the one that just
      // played, if it is still in the new list. Starting again from the top
      // on every change would show the first ads more often than the last.
      // A clean cut rather than a crossfade, because the outgoing ad belongs
      // to the old list.
      setSlot((s) => {
        const justPlayed = ads[s.index]?.src;
        const found = running.findIndex((ad) => ad.src === justPlayed);
        const index = found >= 0 ? (found + 1) % running.length : Math.min(s.index, running.length - 1);
        return { index, prev: null, fadeAt: now + SLOT_DURATION };
      });
      return;
    }

    setSlot((s) => {
      const nextIndex = (s.index + 1) % ads.length;
      let fadeAt = s.fadeAt + SLOT_DURATION;
      // Resync if we're outside a sane window — the ad ended early (video), the
      // Fire Stick was suspended, or the clock jumped.
      if (fadeAt < now || fadeAt > now + SLOT_DURATION) {
        fadeAt = now + SLOT_DURATION;
      }
      return {
        index: nextIndex,
        prev: nextIndex === s.index ? null : s.index,
        fadeAt,
      };
    });
  }, [ads]);

  // Hold the current ad, then hand off to the next one. Recomputing the delay
  // from the absolute deadline keeps this effect idempotent and drift-free.
  useEffect(() => {
    if (ads.length === 0) return;
    const currentAd = ads[slot.index];
    const delay =
      currentAd.type === "video" ? VIDEO_TIMEOUT : Math.max(0, slot.fadeAt - Date.now());
    const timer = setTimeout(advance, delay);
    return () => clearTimeout(timer);
  }, [slot, ads, advance]);

  // Drop the outgoing layer once it's fully covered.
  useEffect(() => {
    if (slot.prev === null) return;
    const timer = setTimeout(() => {
      setSlot((s) => (s.prev === null ? s : { ...s, prev: null }));
    }, CROSSFADE_DURATION + 100);
    return () => clearTimeout(timer);
  }, [slot.index, slot.prev]);

  // Fetch the next ad while the current one is on screen, so the crossfade
  // never waits on the network.
  useEffect(() => {
    if (ads.length < 2) return;
    const nextAd = ads[(slot.index + 1) % ads.length];
    if (nextAd.type === "image") {
      const preload = new window.Image();
      preload.src = nextAd.src;
      return;
    }
    // A cold video can still be buffering when its slot comes up on a Fire
    // Stick, which shows as a frozen first frame. Warm it once per session —
    // after that the browser cache serves it on every loop.
    if (preloadedVideos.current.has(nextAd.src)) return;
    preloadedVideos.current.add(nextAd.src);
    const preload = document.createElement("video");
    preload.preload = "auto";
    preload.muted = true;
    preload.src = nextAd.src;
    preload.load();
  }, [slot.index, ads]);

  if (ads.length === 0) {
    return <div style={{ width: "100vw", height: "100vh", background: "#000" }} />;
  }

  const layerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    position: "absolute",
    top: 0,
    left: 0,
  };

  // Outgoing layer first, incoming second. Both come from one keyed list so
  // that when an ad moves from incoming to outgoing React *moves* its DOM node
  // rather than remounting it — a video keeps its last painted frame instead of
  // reloading to a blank one under the crossfade.
  const layers: { ad: AdItem; index: number; isCurrent: boolean }[] = [];
  if (slot.prev !== null) {
    layers.push({ ad: ads[slot.prev], index: slot.prev, isCurrent: false });
  }
  layers.push({ ad: ads[slot.index], index: slot.index, isCurrent: true });

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {/* Outgoing ad stays at full opacity underneath — the incoming one fades
          in over it, so the crossfade never dips through black. */}
      {layers.map(({ ad, index, isCurrent }) => {
        const style: React.CSSProperties = {
          ...layerStyle,
          zIndex: isCurrent ? 2 : 1,
          animation: `ad-fade-in ${CROSSFADE_DURATION}ms ease-in-out both`,
        };
        return ad.type === "image" ? (
          <img
            key={`${index}-${ad.src}`}
            src={ad.src}
            alt=""
            onError={isCurrent ? advance : undefined}
            style={style}
          />
        ) : (
          <video
            key={`${index}-${ad.src}`}
            src={ad.src}
            autoPlay
            muted
            playsInline
            preload="auto"
            // Some Fire Stick browsers ignore the autoplay attribute on a node
            // that mounts mid-animation; nudging it keeps playback starting the
            // instant the ad hits the screen. Muted, so it's never blocked.
            onLoadedData={(e) => {
              e.currentTarget.play().catch(() => {});
            }}
            onEnded={isCurrent ? advance : undefined}
            onError={isCurrent ? advance : undefined}
            style={style}
          />
        );
      })}
    </div>
  );
}
