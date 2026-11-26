import React from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, Printer } from 'lucide-react';
import type { AppLanguage, ProjectFile } from '../types/inspection';
import { UI_TEXT } from '../i18n/translations';

interface ExportTabProps {
  lang: AppLanguage;
  project: ProjectFile;
  isExportingPdf: boolean;
  onExportPDF: () => void;
  onPrintReport: () => void;
  onExportWord: () => void;
  onExportExcel: () => void;
}

export const ExportTab: React.FC<ExportTabProps> = ({
  lang,
  project,
  isExportingPdf,
  onExportPDF,
  onPrintReport,
  onExportWord,
  onExportExcel,
}) => {
  const t = UI_TEXT[lang];
  const total = project.defects.length;
  const urgent = project.defects.filter((d) => d.severity === 'เร่งด่วน').length;
  const fixed = project.defects.filter((d) => d.status === 'แก้ไขแล้ว').length;
  const withBefore = project.defects.filter((d) => d.beforeImg).length;
  const withAfter = project.defects.filter((d) => d.afterImg).length;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="mb-6 pb-4 border-b border-slate-100">
        <h3 className="text-lg sm:text-xl font-bold text-slate-900">{t.exportTitle}</h3>
        <p className="text-xs sm:text-sm text-slate-500 mt-1.5 tabular-nums flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {t.statTotal} <strong className="text-slate-900">{total}</strong> {t.exportItemsUnit}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.statUrgent} <strong className="text-rose-600">{urgent}</strong> {t.exportItemsUnit}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.statFixed} <strong className="text-emerald-700">{fixed}</strong> {t.exportItemsUnit}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.exportBeforeCountLabel} <strong className="text-slate-800">{withBefore}</strong>{' '}
            {t.exportPhotosUnit}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.exportAfterCountLabel} <strong className="text-slate-800">{withAfter}</strong>{' '}
            {t.exportPhotosUnit}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 flex flex-col justify-between">
          <div>
            <div className="w-11 h-11 rounded-lg bg-rose-600 text-white flex items-center justify-center mb-3.5">
              <Download className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-base">{t.pdfCardTitle}</h4>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed mb-5">
              {t.pdfCardDesc}
            </p>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              disabled={isExportingPdf}
              onClick={onExportPDF}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isExportingPdf ? t.pdfGeneratingBtn : t.pdfDownloadBtn}
            </button>
            <button
              type="button"
              onClick={onPrintReport}
              className="w-full py-2 px-4 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              {t.pdfPrintBtn}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 flex flex-col justify-between">
          <div>
            <div className="w-11 h-11 rounded-lg bg-blue-700 text-white flex items-center justify-center mb-3.5">
              <FileText className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-base">{t.wordCardTitle}</h4>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed mb-5">
              {t.wordCardDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={onExportWord}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            {t.wordDownloadBtn}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 flex flex-col justify-between">
          <div>
            <div className="w-11 h-11 rounded-lg bg-emerald-600 text-white flex items-center justify-center mb-3.5">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900 text-base">{t.excelCardTitle}</h4>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed mb-5">
              {t.excelCardDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={onExportExcel}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t.excelDownloadBtn}
          </button>
        </div>
      </div>
    </section>
  );
};
