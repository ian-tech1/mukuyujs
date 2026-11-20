import type { Grade, Stream, Subject, StaffMember, TimetableEntry, TimetablePeriod } from "@/lib/school/model";

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr"];
const COLORS = ["#e0f2fe", "#dcfce7", "#fef9c3", "#fce7f3", "#e0e7ff", "#ffedd5", "#ccfbf1", "#fae8ff", "#fee2e2"];

export function subjectFace(subject: Subject | undefined) {
  const key = subject?.shortName.trim().toUpperCase() ?? "";
  const known: Record<string, string> = { MATH: "maths", ENG: "eng", KIS: "kisw", SST: "sst", CRE: "cre", SCI: "int. sci", AGR: "agric", "C/A": "cas", PRE: "pre-tech" };
  return known[key] || subject?.shortName.toLowerCase() || subject?.name.toLowerCase() || "lesson";
}

export function coveredPeriodIds(entry: TimetableEntry, periods: TimetablePeriod[]) {
  const sorted = [...periods].sort((a, b) => a.sort - b.sort);
  const start = sorted.find((period) => period.id === entry.periodId);
  if (!start) return [entry.periodId];
  const ids = [start.id];
  for (const period of sorted) {
    if (period.sort <= start.sort || ids.length >= (entry.blockLength || 1)) continue;
    if (period.isBreak || period.sort !== sorted.find((item) => item.id === ids[ids.length - 1])!.sort + 1) break;
    ids.push(period.id);
  }
  return ids;
}

function initialsFor(entry: TimetableEntry, staff: StaffMember[]) {
  const own = entry.teacherInitials?.trim();
  if (own) return own.toUpperCase();
  const member = staff.find((person) => person.id === entry.teacherUserId);
  if (member?.initials?.trim()) return member.initials.trim().toUpperCase();
  return entry.teacherName.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 4).toUpperCase();
}

export function classCode(grade: Grade | undefined, stream: Stream | undefined) {
  if (grade?.level && stream) return `${grade.level}${stream.name.replace(/\s+/g, "")}`.toUpperCase();
  return `${grade?.name ?? "Class"}${stream ? ` ${stream.name}` : ""}`.trim();
}

type SheetProps = {
  title: string;
  schoolName?: string;
  subtitle?: string;
  periods: TimetablePeriod[];
  entries: TimetableEntry[];
  subjects: Subject[];
  staff: StaffMember[];
  grades: Grade[];
  streams: Stream[];
  mode: "class" | "teacher" | "room" | "subject";
  editable: boolean;
  onCell: (day: number, periodId: string, entry: TimetableEntry | null) => void;
};

export function AscTimetableSheet({ title, schoolName, subtitle, periods, entries, subjects, staff, grades, streams, mode, editable, onCell }: SheetProps) {
  const columns = [...periods].sort((a, b) => a.sort - b.sort);
  const colorFor = new Map(subjects.map((subject, index) => [subject.id, subjectConstraintsColor(index)]));
  return (
    <section className="overflow-x-auto rounded-xl border border-stone-400 bg-white shadow-card">
      <header className="relative border-b border-stone-300 px-3 py-3 text-center">
        {schoolName ? <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-navy">{schoolName}</p> : null}
        <p className="font-serif text-xl font-bold tracking-wide text-navy">{title}</p>
        {subtitle ? <p className="mt-1 text-xs text-stone-600 sm:absolute sm:right-3 sm:top-3 sm:mt-0">{subtitle}</p> : null}
      </header>
      <table className="w-full min-w-[68rem] border-collapse text-center">
        <thead>
          <tr>
            <th className="w-14 border border-stone-400 bg-stone-100" />
            {columns.map((period) => (
              <th key={period.id} className={`border border-stone-400 px-1 py-1 ${period.isBreak ? "bg-amber-50" : "bg-stone-100"}`}>
                <div className="text-xs font-bold uppercase text-navy">{period.isBreak ? period.label : period.label}</div>
                <div className="text-[10px] font-normal text-muted">{period.startTime}–{period.endTime}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_LABELS.map((day, dayIndex) => (
            <tr key={day}>
              <th className="border border-stone-400 bg-stone-50 font-serif text-lg text-navy">{day}</th>
              {columns.map((period) => {
                if (period.isBreak) {
                  if (dayIndex !== 0) return null;
                  return (
                    <td key={period.id} rowSpan={5} className="border border-stone-400 bg-amber-50 px-1">
                      <div className="flex h-full min-h-[22rem] items-center justify-center">
                        <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-700">{period.label}</span>
                      </div>
                    </td>
                  );
                }
                const cellEntries = entries.filter((entry) => entry.dayOfWeek === dayIndex + 1 && coveredPeriodIds(entry, columns).includes(period.id));
                return (
                  <td key={period.id} className="h-24 border border-stone-300 align-middle p-1">
                    {cellEntries.length ? cellEntries.map((entry) => {
                      const subject = subjects.find((item) => item.id === entry.subjectId);
                      const grade = grades.find((item) => item.id === entry.gradeId);
                      const stream = streams.find((item) => item.id === entry.streamId);
                      const who = mode === "class" ? initialsFor(entry, staff) : mode === "teacher" ? classCode(grade, stream) : `${subjectFace(subject)} · ${initialsFor(entry, staff)}`;
                      const what = mode === "class" || mode === "teacher" ? subjectFace(subject) : classCode(grade, stream);
                      return (
                        <button key={entry.id} type="button" title={entry.blockLength > 1 ? `${entry.blockLength} consecutive periods` : "Single period"} disabled={!editable} onClick={() => onCell(dayIndex + 1, entry.periodId, entry)} className="block w-full rounded px-1 py-1 text-navy disabled:cursor-default" style={{ background: colorFor.get(entry.subjectId) }}>
                          <span className="block text-sm font-semibold leading-tight">{what}</span>
                          <span className="mt-1 block text-[10px] uppercase tracking-wide text-stone-600">{who}</span>
                          {entry.blockLength > 1 ? <span className="block text-[10px] font-bold text-indigo-900">{entry.blockLength === 2 ? "Double" : "Triple"} · {entry.blockLength} periods</span> : null}
                          {entry.locked ? <span className="text-[10px] font-semibold text-amber-800">Pinned</span> : null}
                        </button>
                      );
                    }) : editable ? <button type="button" className="h-full w-full text-[11px] text-stone-300" onClick={() => onCell(dayIndex + 1, period.id, null)}> </button> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function subjectConstraintsColor(index: number) {
  return COLORS[index % COLORS.length];
}
