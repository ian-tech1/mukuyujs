import { btnGhost, inputClass } from "@/components/school/gate";
import { reportChoicesForDownload, reportTermIds, type ReportDownloadScope, type ReportExamChoice, type ReportTermChoice } from "@/lib/school/report-period";

export function ReportRangeOptions({
  idPrefix,
  yearName,
  currentTermId,
  terms,
  choices,
  scope,
  onScope,
  selectedTermIds,
  onSelectedTerms,
  selectedExamKeys,
  onSelectedExams,
  showTermNames,
  onShowTermNames,
  orientation,
  onOrientation,
}: {
  idPrefix: string;
  yearName: string;
  currentTermId: string;
  terms: ReportTermChoice[];
  choices: ReportExamChoice[];
  scope: ReportDownloadScope;
  onScope: (scope: ReportDownloadScope) => void;
  selectedTermIds: string[];
  onSelectedTerms: (termIds: string[]) => void;
  selectedExamKeys: string[];
  onSelectedExams: (examKeys: string[]) => void;
  showTermNames: boolean;
  onShowTermNames: (show: boolean) => void;
  orientation: "portrait" | "landscape";
  onOrientation: (orientation: "portrait" | "landscape") => void;
}) {
  const orderedTerms = [...terms].sort((a, b) => a.sort - b.sort);
  const exportTermIds = reportTermIds(scope, currentTermId, orderedTerms, selectedTermIds);
  const exportChoices = reportChoicesForDownload(choices, scope, exportTermIds, selectedExamKeys);
  const selectionSummary = scope === "current"
    ? `Current selected term · ${orderedTerms.find((term) => term.id === currentTermId)?.name ?? "Selected term"} · ${exportChoices.length} exam${exportChoices.length === 1 ? "" : "s"}`
    : scope === "year"
      ? `Whole academic year · ${orderedTerms.length} term${orderedTerms.length === 1 ? "" : "s"} · ${exportChoices.length} exam${exportChoices.length === 1 ? "" : "s"}`
      : `Custom selection · ${exportTermIds.length} term${exportTermIds.length === 1 ? "" : "s"} · ${exportChoices.length} exam${exportChoices.length === 1 ? "" : "s"}`;

  function toggleTerm(termId: string, checked: boolean) {
    const termExamKeys = choices.filter((choice) => choice.termId === termId).map((choice) => choice.key);
    onSelectedTerms(checked ? [...new Set([...selectedTermIds, termId])] : selectedTermIds.filter((id) => id !== termId));
    onSelectedExams(checked ? [...new Set([...selectedExamKeys, ...termExamKeys])] : selectedExamKeys.filter((key) => !termExamKeys.includes(key)));
  }

  function toggleExam(key: string, checked: boolean) {
    onSelectedExams(checked ? [...new Set([...selectedExamKeys, key])] : selectedExamKeys.filter((item) => item !== key));
  }

  return (
    <section className="space-y-3 rounded-md border border-line bg-card p-4" aria-labelledby={`${idPrefix}-title`}>
      <div>
        <h2 id={`${idPrefix}-title`} className="font-serif text-xl text-navy">Report-card download options</h2>
        <p className="text-sm text-muted">The selected academic year follows the year selector. Current selected-term reporting remains the default.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="min-w-56 text-sm font-medium" htmlFor={`${idPrefix}-scope`}>Download range
          <select id={`${idPrefix}-scope`} className={`${inputClass} mt-1`} value={scope} onChange={(event) => onScope(event.target.value as ReportDownloadScope)}>
            <option value="current">Current selected term</option>
            <option value="year">Whole academic year</option>
            <option value="custom">Choose terms and exams</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={showTermNames} onChange={(event) => onShowTermNames(event.target.checked)} />Show term names on downloaded reports</label>
        <label className="min-w-40 text-sm font-medium" htmlFor={`${idPrefix}-orientation`}>PDF page orientation
          <select id={`${idPrefix}-orientation`} className={`${inputClass} mt-1`} value={orientation} onChange={(event) => onOrientation(event.target.value as "portrait" | "landscape")}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
      </div>
      {scope === "custom" ? (
        <div className="grid gap-4 rounded-md border border-line bg-paper/50 p-3 md:grid-cols-2">
          <fieldset className="min-w-0 space-y-2">
            <legend className="font-semibold text-navy">Terms to include</legend>
            <div className="flex flex-wrap gap-2">
              <button className={`${btnGhost} px-2 py-1 text-xs`} type="button" onClick={() => {
                onSelectedTerms(orderedTerms.map((term) => term.id));
                onSelectedExams(choices.map((choice) => choice.key));
              }}>Select all terms</button>
              <button className={`${btnGhost} px-2 py-1 text-xs`} type="button" onClick={() => { onSelectedTerms([]); onSelectedExams([]); }}>Clear terms</button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {orderedTerms.map((term) => <label key={term.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedTermIds.includes(term.id)} onChange={(event) => toggleTerm(term.id, event.target.checked)} />{term.name}</label>)}
            </div>
          </fieldset>
          <fieldset className="min-w-0 space-y-2">
            <legend className="font-semibold text-navy">Exams to include</legend>
            {selectedTermIds.length ? (
              <div className="max-h-56 space-y-3 overflow-y-auto">
                {orderedTerms.filter((term) => selectedTermIds.includes(term.id)).map((term) => {
                  const termChoices = choices.filter((choice) => choice.termId === term.id);
                  return <div key={term.id}>
                    <h3 className="text-sm font-medium text-muted">{term.name}</h3>
                    {termChoices.length ? <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                      {termChoices.map((choice) => <label key={choice.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedExamKeys.includes(choice.key)} onChange={(event) => toggleExam(choice.key, event.target.checked)} />{choice.examName}</label>)}
                    </div> : <p className="mt-1 text-xs text-muted">No active exams are configured for this term.</p>}
                  </div>;
                })}
              </div>
            ) : <p className="text-sm text-muted">Select one or more terms to choose their exams.</p>}
          </fieldset>
        </div>
      ) : null}
      <div className="space-y-1 border-t border-line pt-3">
        <p aria-live="polite" className="text-sm font-semibold text-navy">Export selection: {selectionSummary} · {yearName} · Term names {showTermNames ? "will be shown" : "will be hidden"}</p>
        {scope === "custom" ? <p className="text-xs text-muted">Selected terms: {orderedTerms.filter((term) => exportTermIds.includes(term.id)).map((term) => term.name).join(", ") || "none"}. Selected exams: {exportChoices.length}.</p> : null}
        <p className="text-xs text-muted">Combined reports average scores across the chosen exam columns. Attendance, previous-term comparisons, closing/opening dates, and term-specific comments are omitted because they belong to a single term.</p>
      </div>
    </section>
  );
}
