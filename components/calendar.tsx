"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dateKey } from "@/lib/dates";
export function JournalCalendar({
  month,
  setMonth,
  date,
  setDate,
  entryDates,
  onNavigate,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  date: string;
  setDate: (d: string) => void;
  entryDates: string[];
  onNavigate: () => void;
}) {
  const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
  const offset =
    (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <div className="calendar">
      <div className="calendar-title">
        <strong>
          {month.toLocaleDateString("en", { month: "long", year: "numeric" })}
        </strong>
        <button
          aria-label="Previous month"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
        >
          <ChevronLeft size={16} />
        </button>
        <button
          aria-label="Next month"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="calendar-grid">
        {weekdays.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={"blank" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
          const key = dateKey(d);
          return (
            <button
              key={key}
              aria-label={key}
              className={`${date === key ? "chosen" : ""} ${entryDates.includes(key) ? "has-entry" : ""}`}
              onClick={() => {
                setDate(date === key ? "" : key);
                onNavigate();
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
