import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameDay, isToday as dfnsIsToday, parseISO, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayAgenda } from "./DayAgenda";
import type { RecapEvent } from "@shared/recap";

interface Props {
  /** Currently focused day (the URL anchor). */
  anchor: Date;
  /** Wide event window already fetched by the page (≈ ±14 days around anchor).
   *  Used both as the source for the rendered panes and as the cross-day
   *  satellite pool for each DayAgenda. */
  allEvents: RecapEvent[];
  /** Called when the focused day changes (snap, edge button, ←/→ keys, satellite click). */
  onAnchorChange: (d: Date) => void;
  onSelect: (e: RecapEvent) => void;
  isLoading?: boolean;
}

/** How many days to render on either side of the centre. 7 panes total — keeps
 *  swipes free for a few "throws" before we need to recentre the window. */
const WINDOW_RADIUS = 3;

/** Debounce window for snap detection (ms). Native scroll-snap settles within
 *  ~100‑200ms after the user releases the swipe; we wait a touch longer so we
 *  only update the URL anchor once. */
const SNAP_SETTLE_MS = 140;

export function DayCarousel({ anchor, allEvents, onAnchorChange, onSelect, isLoading }: Props) {
  // The "centre" of the rendered window. Stays put while the user explores
  // nearby days, recenters when the anchor would land on the very first/last
  // pane (so the user can keep swiping without hitting a wall).
  const [windowCenter, setWindowCenter] = useState<Date>(() => startOfDay(anchor));

  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = -WINDOW_RADIUS; i <= WINDOW_RADIUS; i++) arr.push(addDays(windowCenter, i));
    return arr;
  }, [windowCenter]);

  // Recentre when the anchor reaches (or jumps past) an edge pane, so further
  // swipes remain possible. For "far" jumps (e.g. satellite chip to a day
  // outside the visible window) we first slide smoothly to the matching edge
  // pane to acknowledge direction, then swap the window underneath. For edge
  // jumps (Math.abs(offset) === WINDOW_RADIUS) we recentre immediately — the
  // align effect will then perform the (invisible) instant jump.
  // Tracks the last anchor we processed, so we can distinguish anchor changes
  // (which may need a recentre) from manual window shifts via the strip arrows
  // (which must NOT pull the window back to the anchor).
  const lastAnchorMsRef = useRef<number>(+startOfDay(anchor));
  useEffect(() => {
    const a = startOfDay(anchor);
    if (+a === lastAnchorMsRef.current) return;
    lastAnchorMsRef.current = +a;
    const offset = Math.round((+a - +windowCenter) / 86_400_000);
    if (Math.abs(offset) < WINDOW_RADIUS) return;

    const scroller = scrollerRef.current;
    const edgeIdx = offset > 0 ? days.length - 1 : 0;
    const edgePane = paneRefs.current[edgeIdx];
    if (Math.abs(offset) > WINDOW_RADIUS && scroller && edgePane) {
      // Far jump: animate to edge, then recentre after the slide settles.
      ignoreUntilRef.current = Date.now() + 600;
      scroller.scrollTo({ left: edgePane.offsetLeft, behavior: "smooth" });
      const t = window.setTimeout(() => setWindowCenter(a), 360);
      return () => window.clearTimeout(t);
    }
    setWindowCenter(a);
  }, [anchor, windowCenter, days]);

  // Bucket events per day for the rendered window. Each pane only gets the
  // events that actually fall on its day; cross‑day relations stay available
  // through `allEvents` for the satellite feature.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, RecapEvent[]>();
    for (const d of days) map.set(format(d, "yyyy-MM-dd"), []);
    for (const e of allEvents) {
      const k = format(parseISO(e.date), "yyyy-MM-dd");
      const list = map.get(k);
      if (list) list.push(e);
    }
    return map;
  }, [days, allEvents]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const paneRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** While > Date.now() the scroll listener will not push anchor updates back —
   *  used to suppress feedback loops when WE are the ones programmatically
   *  scrolling (smooth-scroll triggers `scroll` events too). */
  const ignoreUntilRef = useRef(0);
  const settleTimerRef = useRef<number | null>(null);
  /** Tracks whether the next "scroll to anchor" should be instantaneous (true
   *  on initial mount or right after a window recentre — avoids jarring slides
   *  across a freshly mounted window). */
  const needsInstantJumpRef = useRef(true);
  const prevWindowCenterRef = useRef<number>(+windowCenter);

  // Programmatically align the scroller to the pane that matches `anchor`.
  useEffect(() => {
    const idx = days.findIndex(d => isSameDay(d, anchor));
    if (idx < 0) return;
    const pane = paneRefs.current[idx];
    const scroller = scrollerRef.current;
    if (!pane || !scroller) return;

    if (prevWindowCenterRef.current !== +windowCenter) {
      needsInstantJumpRef.current = true;
      prevWindowCenterRef.current = +windowCenter;
    }
    const instant = needsInstantJumpRef.current;
    needsInstantJumpRef.current = false;

    ignoreUntilRef.current = Date.now() + (instant ? 200 : 600);
    scroller.scrollTo({ left: pane.offsetLeft, behavior: instant ? "auto" : "smooth" });
  }, [anchor, days, windowCenter]);

  const handleScroll = useCallback(() => {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      if (Date.now() < ignoreUntilRef.current) return;
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const centre = scroller.scrollLeft + scroller.clientWidth / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < paneRefs.current.length; i++) {
        const p = paneRefs.current[i];
        if (!p) continue;
        const c = p.offsetLeft + p.offsetWidth / 2;
        const d = Math.abs(c - centre);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const newDay = days[bestIdx];
      if (newDay && !isSameDay(newDay, anchor)) {
        onAnchorChange(newDay);
      }
    }, SNAP_SETTLE_MS);
  }, [anchor, days, onAnchorChange]);

  // Mouse drag-to-pan support for desktops without a trackpad. Touch input is
  // delegated to the browser (native scrolling + snap), and the wheel works as
  // usual; we only intercept primary-button mouse drags.
  const dragRef = useRef<{ startX: number; startScrollLeft: number; pointerId: number } | null>(null);
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    dragRef.current = {
      startX: e.clientX,
      startScrollLeft: scroller.scrollLeft,
      pointerId: e.pointerId,
    };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const scroller = scrollerRef.current;
    if (!drag || !scroller || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 4 && !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      scroller.style.scrollSnapType = "none";
      scroller.style.cursor = "grabbing";
    }
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      e.preventDefault();
      scroller.scrollLeft = drag.startScrollLeft - dx;
    }
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const scroller = scrollerRef.current;
    if (!drag || !scroller || drag.pointerId !== e.pointerId) return;
    const captured = (e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId);
    dragRef.current = null;
    if (captured) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      scroller.style.cursor = "";
      // Restore snap and snap to the closest pane manually (mandatory snap
      // doesn't always re-engage instantly after a programmatic scrollLeft).
      const centre = scroller.scrollLeft + scroller.clientWidth / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < paneRefs.current.length; i++) {
        const p = paneRefs.current[i];
        if (!p) continue;
        const c = p.offsetLeft + p.offsetWidth / 2;
        const d = Math.abs(c - centre);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      scroller.style.scrollSnapType = "";
      const target = paneRefs.current[bestIdx];
      if (target) {
        ignoreUntilRef.current = Date.now() + 600;
        scroller.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
        const newDay = days[bestIdx];
        if (newDay && !isSameDay(newDay, anchor)) onAnchorChange(newDay);
      }
    }
  };

  // Keyboard ←/→ navigation (when the carousel has focus).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onAnchorChange(addDays(anchor, -1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onAnchorChange(addDays(anchor, 1));
    }
  };

  const prevDay = addDays(anchor, -1);
  const nextDay = addDays(anchor, 1);

  return (
    <div
      className="outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      data-testid="recap-day-carousel"
    >
      {/* Mini-strip: 7 clickable days from the current window. Lets the user
          jump straight to a day instead of swiping/arrowing one at a time. */}
      <div
        className="flex items-stretch gap-1 mb-2 px-1"
        data-testid="recap-day-strip"
      >
        <button
          type="button"
          onClick={() => setWindowCenter((c) => addDays(c, -(WINDOW_RADIUS * 2 + 1)))}
          title={`Settimana precedente (${format(addDays(days[0], -1), "d MMM", { locale: it })})`}
          aria-label="Settimana precedente"
          data-testid="button-day-strip-prev-week"
          className="shrink-0 inline-flex items-center justify-center w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover-elevate"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div
          className="flex-1 flex items-stretch gap-1"
          role="tablist"
          aria-label="Giorni della settimana"
        >
        {days.map((d) => {
          const active = isSameDay(d, anchor);
          const isToday = dfnsIsToday(d);
          const count = eventsByDay.get(format(d, "yyyy-MM-dd"))?.length ?? 0;
          return (
            <button
              key={format(d, "yyyy-MM-dd")}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onAnchorChange(d)}
              title={format(d, "EEEE d MMMM yyyy", { locale: it })}
              data-testid={`button-day-strip-${format(d, "yyyy-MM-dd")}`}
              className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-md border text-[11px] leading-tight transition-colors hover-elevate ${
                active
                  ? "bg-primary text-primary-foreground border-primary font-semibold"
                  : isToday
                    ? "bg-primary/10 text-foreground border-primary/40"
                    : "bg-background text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <span className="capitalize text-[10px] opacity-80">
                {format(d, "EEE", { locale: it })}
              </span>
              <span className="font-medium tabular-nums">
                {format(d, "dd/MM", { locale: it })}
              </span>
              {count > 0 && (
                <span
                  className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full text-[9px] font-semibold tabular-nums shadow-sm ${
                    active
                      ? "bg-primary-foreground text-primary"
                      : "bg-primary text-primary-foreground"
                  }`}
                  data-testid={`badge-day-strip-count-${format(d, "yyyy-MM-dd")}`}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          );
        })}
        </div>
        <button
          type="button"
          onClick={() => setWindowCenter((c) => addDays(c, WINDOW_RADIUS * 2 + 1))}
          title={`Settimana successiva (${format(addDays(days[days.length - 1], 1), "d MMM", { locale: it })})`}
          aria-label="Settimana successiva"
          data-testid="button-day-strip-next-week"
          className="shrink-0 inline-flex items-center justify-center w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover-elevate"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="relative">
      {/* Edge hint / quick jump: previous day */}
      <button
        type="button"
        onClick={() => onAnchorChange(prevDay)}
        className="inline-flex absolute left-2 top-2 z-20 items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur rounded-full px-2 py-1 border shadow-sm hover-elevate"
        title={`Vai a ${format(prevDay, "EEEE d MMMM", { locale: it })}`}
        data-testid="button-day-prev-hint"
      >
        <ChevronLeft className="w-3 h-3" />
        <span className="capitalize">{format(prevDay, "EEE d MMM", { locale: it })}</span>
      </button>
      <button
        type="button"
        onClick={() => onAnchorChange(nextDay)}
        className="inline-flex absolute right-2 top-2 z-20 items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur rounded-full px-2 py-1 border shadow-sm hover-elevate"
        title={`Vai a ${format(nextDay, "EEEE d MMMM", { locale: it })}`}
        data-testid="button-day-next-hint"
      >
        <span className="capitalize">{format(nextDay, "EEE d MMM", { locale: it })}</span>
        <ChevronRight className="w-3 h-3" />
      </button>

      {/* Position dots — one per rendered pane, the active one is wider. */}
      <div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-background/85 backdrop-blur rounded-full px-2.5 py-1 border shadow-sm"
        data-testid="recap-day-carousel-indicator"
      >
        {days.map((d, i) => {
          const active = isSameDay(d, anchor);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onAnchorChange(d)}
              className={`h-1.5 rounded-full transition-all ${
                active
                  ? "w-5 bg-primary"
                  : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70"
              }`}
              title={format(d, "EEEE d MMMM", { locale: it })}
              data-testid={`button-day-dot-${format(d, "yyyy-MM-dd")}`}
              aria-label={format(d, "EEEE d MMMM yyyy", { locale: it })}
              aria-current={active ? "true" : undefined}
            />
          );
        })}
      </div>

      {/* The scroller: native horizontal scroll with mandatory snapping.
          Each pane is exactly the scroller's width so swiping moves day-by-day. */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar cursor-grab"
        style={{
          // Hide scrollbar across browsers without affecting layout.
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          // Keep horizontal swipes self-contained.
          overscrollBehaviorX: "contain",
          // Allow native horizontal swipe AND vertical page scroll on touch.
          touchAction: "pan-x pan-y pinch-zoom",
        }}
      >
        {days.map((d, i) => (
          <div
            key={format(d, "yyyy-MM-dd")}
            ref={(el) => { paneRefs.current[i] = el; }}
            className="shrink-0 w-full snap-center"
            style={{ scrollSnapStop: "always" }}
            data-testid={`recap-day-pane-${format(d, "yyyy-MM-dd")}`}
          >
            <DayAgenda
              events={eventsByDay.get(format(d, "yyyy-MM-dd")) ?? []}
              allEvents={allEvents}
              day={d}
              onSelect={onSelect}
              onNavigateToDay={(target) => onAnchorChange(startOfDay(target))}
              isLoading={isLoading}
              forbidInnerHorizontalScroll
            />
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
