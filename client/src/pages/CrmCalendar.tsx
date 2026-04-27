import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery } from "@tanstack/react-query";
import type { Interaction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Phone, Mail, MapPin, Video, MessageCircle, ArrowUpRight, ArrowDownLeft, Bell, Bot, FilePlus, FileEdit, ListTodo } from "lucide-react";

type InteractionWithNames = Interaction & { customerName?: string; contactName?: string };

const INTERACTION_TYPE_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  phone_call: Phone,
  visit: MapPin,
  whatsapp: MessageCircle,
  video_call: Video,
  offer_created: FilePlus,
  offer_versioned: FileEdit,
  todo: ListTodo,
};

const INTERACTION_TYPE_LABELS: Record<string, string> = {
  email: "Email",
  phone_call: "Phone Call",
  visit: "Visit",
  whatsapp: "WhatsApp",
  video_call: "Video Call",
  offer_created: "Offerta creata",
  offer_versioned: "Nuova versione offerta",
  todo: "To Do",
};

const TYPE_COLORS: Record<string, string> = {
  email: "bg-blue-500",
  phone_call: "bg-green-500",
  visit: "bg-amber-500",
  whatsapp: "bg-emerald-500",
  video_call: "bg-violet-500",
  offer_created: "bg-indigo-500",
  offer_versioned: "bg-indigo-400",
  todo: "bg-sky-500",
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CrmCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "agenda">("month");

  const dateFrom = new Date(year, month, 1).toISOString();
  const dateTo = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data: interactions = [] } = useQuery<InteractionWithNames[]>({
    queryKey: ["/api/interactions/calendar?dateFrom=" + dateFrom + "&dateTo=" + dateTo],
  });

  const interactionsByDate = useMemo(() => {
    const map: Record<string, InteractionWithNames[]> = {};
    interactions.forEach(i => {
      const d = new Date(i.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(i);
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    return map;
  }, [interactions]);

  const navigateMonth = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setMonth(newMonth);
    setYear(newYear);
    setSelectedDate(null);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const selectedInteractions = selectedDate ? (interactionsByDate[selectedDate] || []) : [];

  const sortedAllInteractions = useMemo(() => {
    return [...interactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [interactions]);

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Calendar"
          subtitle={`${MONTH_NAMES[month]} ${year}`}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant={view === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("month")}
                data-testid="button-view-month"
              >
                Month
              </Button>
              <Button
                variant={view === "agenda" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("agenda")}
                data-testid="button-view-agenda"
              >
                Agenda
              </Button>
            </div>
          }
        />

        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)} data-testid="button-prev-month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-xl font-semibold min-w-[200px] text-center" data-testid="text-current-month">
            {MONTH_NAMES[month]} {year}
          </h2>
          <Button variant="outline" size="icon" onClick={() => navigateMonth(1)} data-testid="button-next-month">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDate(todayKey); }}
            data-testid="button-today"
          >
            Today
          </Button>
        </div>

        {view === "month" ? (
          <div className="flex gap-6">
            <div className="flex-1">
              <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border border-border">
                {DAY_HEADERS.map(d => (
                  <div key={d} className="bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                    {d}
                  </div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-card min-h-[80px]" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayInteractions = interactionsByDate[dateKey] || [];
                  const isToday = dateKey === todayKey;
                  const isSelected = dateKey === selectedDate;

                  return (
                    <div
                      key={day}
                      className={`bg-card min-h-[80px] p-1 cursor-pointer transition-colors hover:bg-accent/50 ${
                        isSelected ? "ring-2 ring-primary ring-inset" : ""
                      } ${isToday ? "bg-primary/5" : ""}`}
                      onClick={() => setSelectedDate(dateKey)}
                      data-testid={`calendar-day-${dateKey}`}
                    >
                      <div className={`text-xs font-medium px-1 ${isToday ? "text-primary font-bold" : "text-foreground"}`}>
                        {day}
                      </div>
                      <div className="mt-0.5 space-y-0.5">
                        {dayInteractions.slice(0, 3).map(inter => {
                          const colorClass = TYPE_COLORS[inter.type] || "bg-gray-500";
                          return (
                            <div key={inter.id} className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] truncate bg-accent/60">
                              <div className={`w-1.5 h-1.5 rounded-full ${colorClass} shrink-0`} />
                              <span className="truncate">{inter.customerName || "—"}</span>
                            </div>
                          );
                        })}
                        {dayInteractions.length > 3 && (
                          <div className="text-[10px] text-muted-foreground px-1">
                            +{dayInteractions.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="w-80 shrink-0">
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-semibold text-foreground mb-3" data-testid="text-selected-date">
                  {selectedDate ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Select a day"}
                </h3>
                {selectedDate ? (
                  selectedInteractions.length > 0 ? (
                    <div className="space-y-3">
                      {selectedInteractions.map(inter => (
                        <InteractionCard key={inter.id} interaction={inter} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-interactions">No interactions this day</p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">Click a day to view interactions</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedAllInteractions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="empty-agenda">
                No interactions this month
              </div>
            ) : (
              sortedAllInteractions.map(inter => (
                <InteractionCard key={inter.id} interaction={inter} showDate />
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function InteractionCard({ interaction, showDate }: { interaction: InteractionWithNames; showDate?: boolean }) {
  const TypeIcon = INTERACTION_TYPE_ICONS[interaction.type] || Mail;
  const isInbound = interaction.direction === "inbound";
  const hasReminder = interaction.reminders && interaction.reminders.length > 0;
  const d = new Date(interaction.date);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background hover:border-primary/20 transition-colors" data-testid={`calendar-interaction-${interaction.id}`}>
      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
        isInbound ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
      }`}>
        <TypeIcon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium">{INTERACTION_TYPE_LABELS[interaction.type] || interaction.type}</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {isInbound ? "In" : "Out"}
          </Badge>
          {interaction.autoGenerated && <Bot className="w-3 h-3 text-muted-foreground" />}
          {hasReminder && <Bell className="w-3 h-3 text-amber-500" />}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {showDate ? d.toLocaleString() : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {interaction.customerName && <span className="ml-2 font-medium text-foreground">{interaction.customerName}</span>}
          {interaction.contactName && <span className="ml-1">· {interaction.contactName}</span>}
        </div>
        {interaction.notes && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{interaction.notes}</p>
        )}
      </div>
    </div>
  );
}
