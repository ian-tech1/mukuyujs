import { useMemo, useState } from "react";
import { inputClass } from "@/components/school/gate";
import { calendarFor, periodMarks, type Workspace } from "@/lib/school/model";

export function useSchoolPeriod(ws: Workspace) {
  const [yearId, setYearId] = useState(ws.profile.activeYearId || ws.years[0]?.id || "y2026");
  const [termId, setTermId] = useState(ws.profile.activeTermId || ws.terms[2]?.id || "t3");
  const marks = useMemo(() => periodMarks(ws.marks, yearId, termId), [ws.marks, yearId, termId]);
  const calendar = calendarFor(ws.calendars, yearId, termId);
  const current = yearId === ws.profile.activeYearId && termId === ws.profile.activeTermId;
  return { yearId, termId, setYearId, setTermId, marks, calendar, current };
}

export function PeriodBar({
  ws,
  yearId,
  termId,
  onYear,
  onTerm,
}: {
  ws: Workspace;
  yearId: string;
  termId: string;
  onYear: (id: string) => void;
  onTerm: (id: string) => void;
}) {
  const calendar = calendarFor(ws.calendars, yearId, termId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={`${inputClass} max-w-[8rem]`} value={yearId} onChange={(event) => onYear(event.target.value)}>
        {ws.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
      </select>
      <select className={`${inputClass} max-w-[8rem]`} value={termId} onChange={(event) => onTerm(event.target.value)}>
        {ws.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
      </select>
      <p className="text-xs text-muted">
        Closing {calendar?.closingDate || "not set"} · Opening {calendar?.openingDate || "not set"}
        {yearId === ws.profile.activeYearId && termId === ws.profile.activeTermId ? " · current term" : ""}
      </p>
    </div>
  );
}
