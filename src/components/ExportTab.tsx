import {isDngFile,decodeDngToJpeg,imageUploadError} from '../utils/dngImage';
import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Download,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AppLanguage,
  BrandConfig,
  ProjectFile,
  ReportBookData,
  ReportCustomExportSettings,
} from '../types/inspection';
import { UI_TEXT } from '../i18n/translations';
import { renderFloorplanZonesToPng } from '../utils/imageUtils';
import {
  buildTable2RowsFromSteps,
  createDefaultClosingSummary,
  createDefaultCustomExportSettings,
  createDefaultInspectionSteps,
  createDefaultIntroText,
  createDefaultReportBookData,
  isValidReportImageDataUrl,
  loadReportBookData,
  resolveCoverImage,
  PROPERTY_CONDITION_OPTIONS,
  sanitizeReportImageUrl,
  saveReportBookData,
} from '../utils/reportBook';

export { buildSharedReportHtml } from '../utils/imageUtils';

async function prepareReportPhoto(file: File): Promise<string> {
  if(isDngFile(file))return decodeDngToJpeg(file,4096,0.98);
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result && result.startsWith('data:image/')) {
        resolve(result);
      } else {
        reject(new Error('Invalid image Data URL'));
      }
    };
    reader.onerror = () => {
      reject(reader.error || new Error('FileReader error'));
    };
    reader.readAsDataURL(file);
  });

  if (
    file.type === 'image/svg+xml' ||
    file.name.toLowerCase().endsWith('.svg') ||
    rawDataUrl.startsWith('data:image/svg+xml')
  ) {
    return rawDataUrl;
  }

  // Store the original file instead of resizing/re-encoding report photos.
  // The AI path has its own independent thumbnail preparation.
  await new Promise<void>((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>img.naturalWidth&&img.naturalHeight?resolve():reject(new Error('Invalid image'));
    img.onerror=()=>reject(new Error('Unsupported image'));
    img.src=rawDataUrl;
  });
  return rawDataUrl;
}

interface ExportTabProps {
  lang: AppLanguage;
  project: ProjectFile;
  brand: BrandConfig;
  isExportingPdf: boolean;
  onExportPDF: (reportBook: ReportBookData) => void;
  onExportWord: (reportBook: ReportBookData) => void;
  onExportExcel: (reportBook: ReportBookData) => void;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'danger') => void;
}

type BuilderSection = 'cover' | 'intro' | 'steps' | 'summary' | 'custom';

function sanitizeLoadedReportBook(data: ReportBookData): ReportBookData {
  return {
    ...data,
    locationMapImg: sanitizeReportImageUrl(data.locationMapImg),
    frontHouseImg: sanitizeReportImageUrl(data.frontHouseImg),
    coverImageMode: data.coverImageMode === 'custom' || data.coverImageMode === 'none' ? data.coverImageMode : 'front-house',
    coverCustomImg: sanitizeReportImageUrl(data.coverCustomImg),
    extraZonePlanImgs: (data.extraZonePlanImgs || [])
      .map((img) => sanitizeReportImageUrl(img))
      .filter((img) => img.length > 0),
    customExport: {
      ...createDefaultCustomExportSettings(),
      ...(data.customExport || {}),
    },
  };
}

export const ExportTab: React.FC<ExportTabProps> = ({
  lang,
  project,
  brand,
  isExportingPdf,
  onExportPDF,
  onExportWord,
  onExportExcel,
  onNotify,
}) => {
  const t = UI_TEXT[lang];
  const [activeSection, setActiveSection] = useState<BuilderSection>('cover');
  const [reportBook, setReportBook] = useState<ReportBookData>(() =>
    sanitizeLoadedReportBook(loadReportBookData(project, lang))
  );
  const [isCustomCondition, setIsCustomCondition] = useState<boolean>(() => {
    const initial = loadReportBookData(project, lang);
    return !PROPERTY_CONDITION_OPTIONS[lang].includes(initial.propertyCondition);
  });
  const [zonePreviewMap, setZonePreviewMap] = useState<Record<string, string>>({});
  const [dragTarget, setDragTarget] = useState<
    'locationMapImg' | 'frontHouseImg' | 'coverCustomImg' | 'extraZone' | null
  >(null);

  const customConditionInputRef = useRef<HTMLInputElement | null>(null);
  const lastProjectIdRef = useRef<string>(project.id);
  const reportBookRef = useRef<ReportBookData>(reportBook);
  reportBookRef.current = reportBook;

  // Sync only when switching to a different project
  useEffect(() => {
    if (lastProjectIdRef.current !== project.id) {
      lastProjectIdRef.current = project.id;
      const loaded = sanitizeLoadedReportBook(loadReportBookData(project, lang));
      reportBookRef.current = loaded;
      setReportBook(loaded);
      setIsCustomCondition(
        !PROPERTY_CONDITION_OPTIONS[lang].includes(loaded.propertyCondition)
      );
    }
  }, [project, lang]);

  // Render Studio Zone Floorplan previews for Section 3 (Figure 3)
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      project.floors.map(async (fl) => {
        const png = await renderFloorplanZonesToPng(fl);
        return [fl.id, png] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      entries.forEach(([id, png]) => {
        if (png) next[id] = png;
      });
      setZonePreviewMap(next);
    });
    return () => {
      cancelled = true;
    };
  }, [project.id, project.floors]);

  const updateBook = (updater: (prev: ReportBookData) => ReportBookData) => {
    const next = updater(reportBookRef.current);
    reportBookRef.current = next;
    setReportBook(next);
    // Persist separately so QuotaExceededError never blocks UI state or PDF/Word export
    try {
      saveReportBookData(project.id, next);
    } catch {
      // Ignore localStorage quota limits gracefully
    }
  };

  const updateCustomExport = (
    updater: (prev: ReportCustomExportSettings) => ReportCustomExportSettings
  ) => {
    updateBook((prev) => ({
      ...prev,
      customExport: updater({
        ...createDefaultCustomExportSettings(),
        ...(prev.customExport || {}),
      }),
    }));
  };

  const unsupportedImageMessage =
    lang === 'en'
      ? 'Unable to display this image. Please use a JPG, PNG, or WebP file (HEIC files are not supported by browsers).'
      : 'ไม่สามารถแสดงรูปภาพนี้ได้ กรุณาใช้ไฟล์รูปภาพสกุล JPG, PNG หรือ WebP (หากอัปโหลดไฟล์ HEIC เบราว์เซอร์อาจไม่รองรับ)';

  const processReportPhotoFile = async (
    file: File | undefined,
    target: 'locationMapImg' | 'frontHouseImg' | 'coverCustomImg' | 'extraZone'
  ) => {
    if (!file) return;
    try {
      const dataUrl = await prepareReportPhoto(file);
      if (!isValidReportImageDataUrl(dataUrl)) {
        throw new Error('Invalid image output');
      }
      if (target === 'coverCustomImg') {
        updateBook((prev) => ({ ...prev, coverCustomImg: dataUrl }));
      } else if (target === 'extraZone') {
        updateBook((prev) => ({
          ...prev,
          extraZonePlanImgs: [...prev.extraZonePlanImgs, dataUrl],
        }));
      } else {
        updateBook((prev) => ({ ...prev, [target]: dataUrl }));
      }
      onNotify(
        lang === 'en' ? 'Report photo uploaded' : 'อัปโหลดภาพประกอบรายงานเรียบร้อยแล้ว',
        'success'
      );
    } catch {
      onNotify(imageUploadError(file,lang,unsupportedImageMessage), 'danger');
    }
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'locationMapImg' | 'frontHouseImg' | 'coverCustomImg' | 'extraZone'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    await processReportPhotoFile(file, target);
  };

  const handleDropPhoto = async (
    e: React.DragEvent<HTMLElement>,
    target: 'locationMapImg' | 'frontHouseImg' | 'coverCustomImg' | 'extraZone'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTarget(null);
    const file = e.dataTransfer.files?.[0];
    await processReportPhotoFile(file, target);
  };

  const handleResetAllDefaults = () => {
    const fresh = createDefaultReportBookData(project, lang);
    reportBookRef.current = fresh;
    setReportBook(fresh);
    setIsCustomCondition(false);
    try {
      saveReportBookData(project.id, fresh);
    } catch {
      // Ignore storage quota errors
    }
    onNotify(
      lang === 'en' ? 'Report builder reset to defaults' : 'รีเซ็ตข้อมูลเล่มรายงานเป็นค่าเริ่มต้นแล้ว',
      'info'
    );
  };

  const total = project.defects.length;
  const urgent = project.defects.filter((d) => d.severity === 'เร่งด่วน').length;
  const fixed = project.defects.filter((d) => d.status === 'แก้ไขแล้ว').length;
  const withBefore = project.defects.filter((d) => d.beforeImg).length;
  const withAfter = project.defects.filter((d) => d.afterImg).length;

  const conditionPresets = PROPERTY_CONDITION_OPTIONS[lang];
  const coverMode = reportBook.coverImageMode || 'front-house';
  const coverPreview = resolveCoverImage(reportBook);
  const customSettings: ReportCustomExportSettings = {
    ...createDefaultCustomExportSettings(),
    ...(reportBook.customExport || {}),
  };

  const sortedProjectDefects = [...project.defects].sort(
    (a, b) => (a.number || 0) - (b.number || 0)
  );
  const customFilteredDefects = sortedProjectDefects.filter((d) => {
    if (customSettings.defectSelectionMode === 'manual') {
      return customSettings.selectedDefectIds.includes(d.id);
    }
    if (customSettings.defectStatusFilter === 'pending_only' && d.status === 'แก้ไขแล้ว') {
      return false;
    }
    if (customSettings.defectStatusFilter === 'fixed_only' && d.status !== 'แก้ไขแล้ว') {
      return false;
    }
    if (customSettings.defectSeverityFilter === 'urgent_only' && d.severity !== 'เร่งด่วน') {
      return false;
    }
    return true;
  });

  const enabledSectionsCount = [
    customSettings.includeCover,
    customSettings.includeToc,
    customSettings.includeIntro,
    customSettings.includeStepsAndZones,
    customSettings.includeDefectTable,
    customSettings.includeSummaryTable2,
  ].filter(Boolean).length;

  const sectionTabs: Array<{ id: BuilderSection; label: string }> = [
    { id: 'cover', label: t.reportCat1Tab },
    { id: 'intro', label: t.reportCat2Tab },
    { id: 'steps', label: t.reportCat3Tab },
    { id: 'summary', label: t.reportCat4Tab },
    { id: 'custom', label: t.reportCat5Tab },
  ];

  return (
    <div className="space-y-5">
      {/* Top Export Action Cards (PDF / Word / Excel) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="mb-5 pb-4 border-b border-slate-100">
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

        <fieldset className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <legend className="px-1 text-sm font-bold text-slate-800">{lang==='en'?'Report table layout':'รูปแบบตารางรายงาน'}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(['before_only','before_after'] as const).map(mode=>{
              const selected=(customSettings.defectTableMode||'before_after')===mode;
              return <label key={mode} className={'flex gap-2 items-start rounded-lg border p-3 cursor-pointer '+(selected?'border-blue-400 bg-blue-50':'border-slate-200 bg-white')}>
                <input type="radio" name="report-table-layout" checked={selected} onChange={()=>updateCustomExport(prev=>({...prev,defectTableMode:mode}))} className="mt-1 accent-blue-600"/>
                <div className="min-w-0"><div className="text-sm font-semibold text-slate-800">{mode==='before_only'?(lang==='en'?'First inspection':'ตรวจครั้งแรก'):(lang==='en'?'Follow-up inspection':'ตรวจติดตาม')}</div>
                  <div className="text-xs text-slate-600">{mode==='before_only'?(lang==='en'?'Before photo only · wider details':'ไม่มีคอลัมน์ภาพหลังแก้ไข · ขยายภาพและรายละเอียด'):(lang==='en'?'Before and after photos':'มีภาพก่อนและหลังแก้ไข')}</div>
                </div>
              </label>;
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">{lang==='en'?'Applies to PDF, Word and Excel. Saved photos are not deleted.':'ใช้ร่วมกันทั้ง PDF, Word และ Excel ไม่ลบภาพหลังแก้ไขจากโครงการ'}</p>
        </fieldset>
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
            <button
              type="button"
              disabled={isExportingPdf}
              onClick={() => {
                if (enabledSectionsCount === 0) {
                  onNotify(t.customNoSectionWarning, 'warning');
                  setActiveSection('custom');
                  return;
                }
                onExportPDF(reportBookRef.current);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isExportingPdf ? t.pdfGeneratingBtn : t.pdfDownloadBtn}
            </button>
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
              onClick={() => {
                if (enabledSectionsCount === 0) {
                  onNotify(t.customNoSectionWarning, 'warning');
                  setActiveSection('custom');
                  return;
                }
                onExportWord(reportBookRef.current);
              }}
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
              onClick={() => {
                if (enabledSectionsCount === 0) {onNotify(t.customNoSectionWarning, 'warning');setActiveSection('custom');return;}
                onExportExcel(reportBookRef.current);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t.excelDownloadBtn}
            </button>
          </div>
        </div>
      </section>

      {/* Complete Report Book Data Builder Form (4 Categories) */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Builder Header */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl brand-bg text-white flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {t.reportBuilderTitle}
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {t.reportBuilderAutoSavedBadge}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{t.reportBuilderSub}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetAllDefaults}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t.reportBuilderResetBtn}
          </button>
        </div>

        {/* 4 Category Switcher Tabs */}
        <div className="px-5 sm:px-6 pt-3 bg-white border-b border-slate-200 flex flex-wrap gap-1.5">
          {sectionTabs.map((tab) => {
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'border-blue-700 text-blue-800 bg-blue-50/70'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Builder Content Body */}
        <div className="p-5 sm:p-6">
          {/* CATEGORY 1: COVER PAGE */}
          {activeSection === 'cover' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t.coverTitleLabel}
                  </label>
                  <input
                    type="text"
                    value={reportBook.coverTitle}
                    onChange={(e) =>
                      updateBook((prev) => ({ ...prev, coverTitle: e.target.value }))
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t.coverConditionLabel}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={
                        !isCustomCondition && conditionPresets.includes(reportBook.propertyCondition)
                          ? reportBook.propertyCondition
                          : '__custom__'
                      }
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomCondition(true);
                          // Do not carry the selected preset into a new custom entry.
                          updateBook((prev) => ({
                            ...prev,
                            propertyCondition: '',
                          }));
                          setTimeout(() => customConditionInputRef.current?.focus(), 0);
                        } else {
                          setIsCustomCondition(false);
                          updateBook((prev) => ({
                            ...prev,
                            propertyCondition: e.target.value,
                          }));
                        }
                      }}
                      className="sm:w-52 px-3 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                    >
                      {conditionPresets.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                      <option value="__custom__">
                        {lang === 'en' ? 'Custom' : 'กำหนดเอง'}
                      </option>
                    </select>
                    <input
                      ref={customConditionInputRef}
                      type="text"
                      value={reportBook.propertyCondition}
                      readOnly={!isCustomCondition && conditionPresets.includes(reportBook.propertyCondition)}
                      aria-label={t.coverConditionLabel}
                      onChange={(e) => {
                        if(!isCustomCondition && conditionPresets.includes(reportBook.propertyCondition))return;
                        const val = e.target.value;
                        setIsCustomCondition(true);
                        updateBook((prev) => ({
                          ...prev,
                          propertyCondition: val,
                        }));
                      }}
                      placeholder={lang === 'en' ? 'Custom' : 'กำหนดเอง'}
                      className="flex-1 min-w-0 px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-100 read-only:text-slate-600 read-only:cursor-default"
                    />
                  </div>
                </div>
              </div>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <label htmlFor="report-cover-image-mode" className="block text-sm font-bold text-slate-800">{lang==='en'?'Cover image':'รูปภาพหน้าปก'}</label>
                <select id="report-cover-image-mode" value={coverMode} onChange={ev=>{
                  const mode=ev.target.value;
                  if(mode==='front-house'||mode==='custom'||mode==='none')updateBook(prev=>({...prev,coverImageMode:mode}));
                }} className="w-full sm:max-w-md px-3 py-2.5 text-sm rounded-xl border border-slate-300 bg-white">
                  <option value="front-house">{lang==='en'?'Use front house photo (Figure 2)':'ใช้ภาพด้านหน้าบ้าน (รูปที่ 2)'}</option>
                  <option value="custom">{lang==='en'?'Upload a custom cover photo':'อัปโหลดรูปหน้าปกเอง'}</option>
                  <option value="none">{lang==='en'?'No cover image':'ไม่ใช้รูปหน้าปก'}</option>
                </select>
                <p className="text-xs text-slate-600">{coverMode==='front-house'?(lang==='en'?'Automatically uses the photo from Introduction & Site Photos.':'ดึงภาพจากหัวข้อ 2. บทนำ & รูปหน้างาน โดยอัตโนมัติ'):coverMode==='custom'?(lang==='en'?'This photo is separate from Figure 2.':'รูปนี้ใช้เฉพาะหน้าปก ไม่เปลี่ยนภาพด้านหน้าบ้านในรูปที่ 2'):(lang==='en'?'The cover is exported without a photo. Figure 2 is unchanged.':'หน้าปกจะไม่มีรูปภาพ โดยรูปที่ 2 ยังคงเดิม')}</p>
                {coverMode!=='none'&&(
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    {coverPreview?<img src={coverPreview} alt={lang==='en'?'Cover photo preview':'ตัวอย่างภาพหน้าปก'} className="mx-auto max-h-56 max-w-full object-contain rounded"/>:<div className="flex min-h-24 items-center justify-center text-xs text-slate-500">{lang==='en'?'No photo selected yet':'ยังไม่มีรูปภาพหน้าปก'}</div>}
                    {coverMode==='custom'&&<div className="flex flex-wrap items-center gap-2 mt-3">
                      <label className="inline-flex items-center gap-2 cursor-pointer border border-slate-300 rounded-lg px-3 py-2 bg-white text-xs font-semibold"><Upload className="w-4 h-4"/>{lang==='en'?'Upload / replace photo':'อัปโหลด / เปลี่ยนรูป'}
                        <input type="file" className="sr-only" onChange={ev=>void handlePhotoUpload(ev,'coverCustomImg')}/>
                      </label>
                      {reportBook.coverCustomImg&&<button type="button" onClick={()=>updateBook(prev=>({...prev,coverCustomImg:''}))} className="inline-flex items-center gap-1 text-xs text-rose-700 rounded-lg px-3 py-2 bg-rose-50"><Trash2 className="w-4 h-4"/>{lang==='en'?'Remove custom photo':'ลบรูปที่อัปโหลดเอง'}</button>}
                    </div>}
                    {coverMode==='front-house'&&<button type="button" onClick={()=>setActiveSection('intro')} className="mt-3 text-xs font-semibold text-blue-700 underline">{lang==='en'?'Go to Figure 2':'ไปยังรูปที่ 2 เพื่อเพิ่มหรือเปลี่ยนภาพหน้าบ้าน'}</button>}
                  </div>
                )}
              </section>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {t.coverLocationLabel}
                </label>
                <div className="relative flex items-center">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={reportBook.locationText}
                    onChange={(e) =>
                      updateBook((prev) => ({ ...prev, locationText: e.target.value }))
                    }
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t.coverClientLabel}
                  </label>
                  <div className="space-y-2">
                    {reportBook.clientName.split(/\r?\n/).map((owner,index,owners)=><div key={index} className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 shrink-0">{index+1}.</span>
                      <input type="text" value={owner} aria-label={(lang==='en'?'Owner ':'เจ้าของบ้านคนที่ ')+(index+1)}
                        onChange={e=>updateBook(prev=>({...prev,clientName:owners.map((v,i)=>i===index?e.target.value:v).join('\n')}))}
                        placeholder={lang==='en'?'Full name':'ชื่อ-นามสกุล'} className="min-w-0 w-full px-3 py-2 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"/>
                      {owners.length>1&&<button type="button" onClick={()=>updateBook(prev=>({...prev,clientName:owners.filter((_,i)=>i!==index).join('\n')}))} aria-label={lang==='en'?'Remove owner':'ลบเจ้าของบ้าน'} className="shrink-0 text-rose-600 px-2 py-2">×</button>}
                    </div>)}
                    <button type="button" onClick={()=>updateBook(prev=>({...prev,clientName:prev.clientName+'\n'}))} className="rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700">+ {lang==='en'?'Add owner':'เพิ่มเจ้าของบ้าน'}</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t.coverDateLabel}
                  </label>
                  <input
                    type="text"
                    value={reportBook.inspectionDate}
                    onChange={(e) =>
                      updateBook((prev) => ({ ...prev, inspectionDate: e.target.value }))
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* White-Label Inspector Info Preview */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-slate-700">
                      {t.coverInspectorPreviewLabel}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {brand.companyName} — {brand.inspectorName} ({brand.licenseNo})
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.coverEditBrandHint}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CATEGORY 2: INTRODUCTION & SITE PHOTOS */}
          {activeSection === 'intro' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Figure 1: Project Location Map */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragTarget('locationMapImg');
                  }}
                  onDragLeave={() => setDragTarget(null)}
                  onDrop={(e) => handleDropPhoto(e, 'locationMapImg')}
                  className={`p-4 rounded-xl border transition-colors space-y-2.5 ${
                    dragTarget === 'locationMapImg'
                      ? 'border-blue-500 bg-blue-50/70'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-bold text-slate-800">{t.fig1Label}</span>
                    {reportBook.locationMapImg && (
                      <button
                        type="button"
                        onClick={() =>
                          updateBook((prev) => ({ ...prev, locationMapImg: '' }))
                        }
                        className="text-xs px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t.figDeleteBtn}
                      </button>
                    )}
                  </div>

                  {reportBook.locationMapImg ? (
                    <div className="space-y-2">
                      <img
                        src={reportBook.locationMapImg}
                        alt={t.fig1Label}
                        onError={() => {
                          updateBook((prev) => ({ ...prev, locationMapImg: '' }));
                          onNotify(unsupportedImageMessage, 'warning');
                        }}
                        className="object-contain w-full h-48 bg-slate-50 rounded-lg border border-slate-200"
                      />
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        {t.figChangeBtn}
                        <input
                          type="file"

                          className="hidden"
                          onChange={(e) => handlePhotoUpload(e, 'locationMapImg')}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="h-48 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 flex flex-col items-center justify-center text-center p-4 cursor-pointer transition-colors">
                      <ImagePlus className="w-8 h-8 text-slate-400 mb-2" />
                      <span className="text-xs font-semibold text-slate-600">{t.figEmptyHint}</span>
                      <span className="mt-2 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                        {t.figUploadBtn}
                      </span>
                      <input
                        type="file"

                        className="hidden"
                        onChange={(e) => handlePhotoUpload(e, 'locationMapImg')}
                      />
                    </label>
                  )}
                </div>

                {/* Figure 2: Front House Photo */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragTarget('frontHouseImg');
                  }}
                  onDragLeave={() => setDragTarget(null)}
                  onDrop={(e) => handleDropPhoto(e, 'frontHouseImg')}
                  className={`p-4 rounded-xl border transition-colors space-y-2.5 ${
                    dragTarget === 'frontHouseImg'
                      ? 'border-blue-500 bg-blue-50/70'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-bold text-slate-800">{t.fig2Label}</span>
                    {reportBook.frontHouseImg && (
                      <button
                        type="button"
                        onClick={() =>
                          updateBook((prev) => ({ ...prev, frontHouseImg: '' }))
                        }
                        className="text-xs px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t.figDeleteBtn}
                      </button>
                    )}
                  </div>

                  {reportBook.frontHouseImg ? (
                    <div className="space-y-2">
                      <img
                        src={reportBook.frontHouseImg}
                        alt={t.fig2Label}
                        onError={() => {
                          updateBook((prev) => ({ ...prev, frontHouseImg: '' }));
                          onNotify(unsupportedImageMessage, 'warning');
                        }}
                        className="object-contain w-full h-48 bg-slate-50 rounded-lg border border-slate-200"
                      />
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        {t.figChangeBtn}
                        <input
                          type="file"

                          className="hidden"
                          onChange={(e) => handlePhotoUpload(e, 'frontHouseImg')}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="h-48 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 flex flex-col items-center justify-center text-center p-4 cursor-pointer transition-colors">
                      <ImagePlus className="w-8 h-8 text-slate-400 mb-2" />
                      <span className="text-xs font-semibold text-slate-600">{t.figEmptyHint}</span>
                      <span className="mt-2 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                        {t.figUploadBtn}
                      </span>
                      <input
                        type="file"

                        className="hidden"
                        onChange={(e) => handlePhotoUpload(e, 'frontHouseImg')}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Introduction Text */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs sm:text-sm font-bold text-slate-700">
                    {t.introContentLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateBook((prev) => ({
                        ...prev,
                        introContent: createDefaultIntroText(
                          project,
                          prev.locationText,
                          lang
                        ),
                      }))
                    }
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {t.introResetTemplateBtn}
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={reportBook.introContent}
                  onChange={(e) =>
                    updateBook((prev) => ({ ...prev, introContent: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* CATEGORY 3: INSPECTION STEPS & FIGURE 3 ZONES */}
          {activeSection === 'steps' && (
            <div className="space-y-5">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <label className="text-xs sm:text-sm font-bold text-slate-800">
                    {t.stepsListLabel}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateBook((prev) => ({
                          ...prev,
                          inspectionSteps: createDefaultInspectionSteps(lang),
                        }))
                      }
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                    >
                      {t.stepsResetBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateBook((prev) => ({
                          ...prev,
                          inspectionSteps: [...prev.inspectionSteps, ''],
                        }))
                      }
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t.stepsAddBtn}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {reportBook.inspectionSteps.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="w-7 h-9 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={step}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateBook((prev) => ({
                            ...prev,
                            inspectionSteps: prev.inspectionSteps.map((s, sIdx) =>
                              sIdx === idx ? val : s
                            ),
                          }));
                        }}
                        className="flex-1 px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {reportBook.inspectionSteps.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateBook((prev) => ({
                              ...prev,
                              inspectionSteps: prev.inspectionSteps.filter(
                                (_, sIdx) => sIdx !== idx
                              ),
                            }))
                          }
                          className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto Figure 3: Studio Zone Floorplans */}
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-blue-950">{t.fig3AutoTitle}</h4>
                  <p className="text-xs text-blue-800/80 mt-0.5">{t.fig3AutoDesc}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {project.floors.map((fl) => (
                    <div
                      key={fl.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-center"
                    >
                      <div className="text-xs font-bold text-slate-800 mb-2">
                        {fl.name} ({fl.zones.length} {t.zonesWord})
                      </div>
                      {zonePreviewMap[fl.id] ? (
                        <img
                          src={zonePreviewMap[fl.id]}
                          alt={fl.name}
                          className="w-full aspect-[4/3] object-contain rounded-lg border border-slate-100 bg-slate-50"
                        />
                      ) : (
                        <div className="w-full aspect-[4/3] rounded-lg bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                          {fl.name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Optional Additional Zone Plan Images */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragTarget('extraZone');
                  }}
                  onDragLeave={() => setDragTarget(null)}
                  onDrop={(e) => handleDropPhoto(e, 'extraZone')}
                  className={`pt-3 mt-1 border-t border-blue-200/70 rounded-xl p-3 transition-colors ${
                    dragTarget === 'extraZone' ? 'bg-blue-100/70 ring-2 ring-blue-400' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-slate-700">{t.fig3ExtraLabel}</span>
                    <label className="text-xs px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold cursor-pointer">
                      {t.fig3ExtraAddBtn}
                      <input
                        type="file"

                        className="hidden"
                        onChange={(e) => handlePhotoUpload(e, 'extraZone')}
                      />
                    </label>
                  </div>
                  {reportBook.extraZonePlanImgs.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {reportBook.extraZonePlanImgs.map((imgSrc, idx) => (
                        <div
                          key={idx}
                          className="relative rounded-xl border border-slate-200 bg-white p-2"
                        >
                          <img
                            src={imgSrc}
                            alt={`Extra plan ${idx + 1}`}
                            onError={() => {
                              updateBook((prev) => ({
                                ...prev,
                                extraZonePlanImgs: prev.extraZonePlanImgs.filter(
                                  (_, pIdx) => pIdx !== idx
                                ),
                              }));
                              onNotify(unsupportedImageMessage, 'warning');
                            }}
                            className="object-contain w-full h-48 bg-slate-50 rounded-lg border border-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateBook((prev) => ({
                                ...prev,
                                extraZonePlanImgs: prev.extraZonePlanImgs.filter(
                                  (_, pIdx) => pIdx !== idx
                                ),
                              }))
                            }
                            className="mt-1.5 w-full py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer"
                          >
                            {t.figDeleteBtn}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* CATEGORY 4: SUMMARY & TABLE 2 */}
          {activeSection === 'summary' && (
            <div className="space-y-5">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <label className="text-xs sm:text-sm font-bold text-slate-800">
                    {t.table2TitleLabel}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateBook((prev) => ({
                          ...prev,
                          table2Rows: buildTable2RowsFromSteps(
                            prev.inspectionSteps,
                            lang,
                            prev.table2Rows
                          ),
                        }))
                      }
                      className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold cursor-pointer"
                    >
                      {t.table2SyncStepsBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateBook((prev) => ({
                          ...prev,
                          table2Rows: [
                            ...prev.table2Rows,
                            {
                              id: `t2_${Date.now()}`,
                              item: '',
                              finding: '',
                            },
                          ],
                        }))
                      }
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                    >
                      {t.table2AddRowBtn}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                        <th className="py-2.5 px-3 w-14 text-center font-bold">{t.table2ColNo}</th>
                        <th className="py-2.5 px-3 font-bold">{t.table2ColItem}</th>
                        <th className="py-2.5 px-3 w-64 sm:w-80 font-bold">{t.table2ColFinding}</th>
                        <th className="py-2.5 px-2 w-12" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {reportBook.table2Rows.map((row, idx) => (
                        <tr key={row.id} className="bg-white">
                          <td className="py-2 px-3 text-center font-bold text-slate-700 align-top pt-3">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-2 align-top">
                            <textarea
                              rows={2}
                              value={row.item}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateBook((prev) => ({
                                  ...prev,
                                  table2Rows: prev.table2Rows.map((r) =>
                                    r.id === row.id ? { ...r, item: val } : r
                                  ),
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-2 px-2 align-top">
                            <textarea
                              rows={2}
                              value={row.finding}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateBook((prev) => ({
                                  ...prev,
                                  table2Rows: prev.table2Rows.map((r) =>
                                    r.id === row.id ? { ...r, finding: val } : r
                                  ),
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-2 px-2 text-center align-top pt-3">
                            {reportBook.table2Rows.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateBook((prev) => ({
                                    ...prev,
                                    table2Rows: prev.table2Rows.filter((r) => r.id !== row.id),
                                  }))
                                }
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Closing Summary Paragraph */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs sm:text-sm font-bold text-slate-700">
                    {t.closingSummaryLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateBook((prev) => ({
                        ...prev,
                        closingSummary: createDefaultClosingSummary(project, lang),
                      }))
                    }
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                  >
                    {t.closingSummaryRefreshBtn}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={reportBook.closingSummary}
                  onChange={(e) =>
                    updateBook((prev) => ({ ...prev, closingSummary: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* CATEGORY 5: CUSTOM EXPORT SETTINGS */}
          {activeSection === 'custom' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0">
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      {t.customTabTitle}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">{t.customTabDesc}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateCustomExport(() => createDefaultCustomExportSettings())
                    }
                    className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-semibold cursor-pointer"
                  >
                    {t.customPresetFullBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateCustomExport((prev) => ({
                        ...prev,
                        includeCover: false,
                        includeToc: false,
                        includeIntro: false,
                        includeStepsAndZones: false,
                        includeDefectTable: true,
                        includeSummaryTable2: false,
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    {t.customPresetTableOnlyBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateCustomExport(() => createDefaultCustomExportSettings())
                    }
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {t.customResetBtn}
                  </button>
                </div>
              </div>

              {enabledSectionsCount === 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{t.customNoSectionWarning}</span>
                </div>
              )}

              {/* Section Toggles */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="text-xs sm:text-sm font-bold text-slate-800">
                  {t.customSectionsHeading}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(
                    [
                      ['includeCover', t.customSecCover],
                      ['includeToc', t.customSecToc],
                      ['includeIntro', t.customSecIntro],
                      ['includeStepsAndZones', t.customSecSteps],
                      ['includeDefectTable', t.customSecTable1],
                      ['includeSummaryTable2', t.customSecSummary],
                    ] as Array<[keyof ReportCustomExportSettings, string]>
                  ).map(([fieldKey, label]) => {
                    const checked = Boolean(customSettings[fieldKey]);
                    return (
                      <label
                        key={fieldKey}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs sm:text-sm font-semibold cursor-pointer transition-colors ${
                          checked
                            ? 'bg-white border-blue-300 text-slate-900'
                            : 'bg-slate-100/70 border-slate-200 text-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextVal = e.target.checked;
                            updateCustomExport((prev) => ({
                              ...prev,
                              [fieldKey]: nextVal,
                            }));
                          }}
                          className="w-4 h-4 accent-blue-700 rounded cursor-pointer"
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Table 1 Layout & Defect Filters */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-4">
                <div className="text-xs sm:text-sm font-bold text-slate-800">
                  {t.customLayoutHeading}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {t.customPerPageLabel}
                    </label>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                      {lang==='en'?'A4 landscape · up to 3 defects per page':'A4 แนวนอน · สูงสุด 3 รายการต่อหน้า'}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{lang==='en'?'Other report pages remain portrait. Long details may use fewer rows.':'หน้าอื่นเป็นแนวตั้งตามเดิม หากข้อความยาว ระบบอาจลดจำนวนแถว'}</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {t.customStatusFilterLabel}
                    </label>
                    <select
                      value={customSettings.defectStatusFilter}
                      onChange={(e) => {
                        const val = e.target.value as ReportCustomExportSettings['defectStatusFilter'];
                        updateCustomExport((prev) => ({
                          ...prev,
                          defectStatusFilter: val,
                        }));
                      }}
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">{t.allStatusOpt}</option>
                      <option value="pending_only">
                        {lang === 'en'
                          ? 'Pending / Repaired but incomplete only'
                          : 'เฉพาะรอแก้ไข / แก้แล้วแต่ยังไม่เรียบร้อย'}
                      </option>
                      <option value="fixed_only">
                        {lang === 'en' ? 'Fixed only' : 'เฉพาะที่แก้ไขแล้ว'}
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {t.customSeverityFilterLabel}
                    </label>
                    <select
                      value={customSettings.defectSeverityFilter}
                      onChange={(e) => {
                        const val = e.target.value as ReportCustomExportSettings['defectSeverityFilter'];
                        updateCustomExport((prev) => ({
                          ...prev,
                          defectSeverityFilter: val,
                        }));
                      }}
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">{t.allSeverityOpt}</option>
                      <option value="urgent_only">
                        {lang === 'en' ? 'Urgent only' : 'เฉพาะระดับเร่งด่วน'}
                      </option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customSettings.showCauseDetails}
                      onChange={(e) =>
                        updateCustomExport((prev) => ({
                          ...prev,
                          showCauseDetails: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-blue-700 rounded cursor-pointer"
                    />
                    {t.customShowCauseLabel}
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customSettings.showSolutionDetails}
                      onChange={(e) =>
                        updateCustomExport((prev) => ({
                          ...prev,
                          showSolutionDetails: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-blue-700 rounded cursor-pointer"
                    />
                    {t.customShowSolutionLabel}
                  </label>
                </div>

                {/* Defect Selection Mode: Filter vs Manual Pick */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700">
                      {t.customDefectSelectionModeLabel}
                    </span>
                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateCustomExport((prev) => ({
                            ...prev,
                            defectSelectionMode: 'filter',
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          customSettings.defectSelectionMode === 'filter'
                            ? 'bg-white text-blue-800 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {t.customModeFilter}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateCustomExport((prev) => ({
                            ...prev,
                            defectSelectionMode: 'manual',
                            selectedDefectIds:
                              prev.selectedDefectIds.length > 0
                                ? prev.selectedDefectIds
                                : sortedProjectDefects.map((d) => d.id),
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          customSettings.defectSelectionMode === 'manual'
                            ? 'bg-white text-blue-800 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {t.customModeManual}
                      </button>
                    </div>
                  </div>

                  {customSettings.defectSelectionMode === 'manual' && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-600">
                          {lang === 'en'
                            ? `Selected ${customFilteredDefects.length} of ${sortedProjectDefects.length} items`
                            : `เลือกไว้ ${customFilteredDefects.length} จากทั้งหมด ${sortedProjectDefects.length} ข้อ`}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateCustomExport((prev) => ({
                                ...prev,
                                selectedDefectIds: sortedProjectDefects.map((d) => d.id),
                              }))
                            }
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold cursor-pointer"
                          >
                            {t.customSelectAllBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateCustomExport((prev) => ({
                                ...prev,
                                selectedDefectIds: [],
                              }))
                            }
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer"
                          >
                            {t.customClearAllBtn}
                          </button>
                        </div>
                      </div>

                      <div className="max-h-52 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                        {sortedProjectDefects.map((d) => {
                          const isChecked = customSettings.selectedDefectIds.includes(d.id);
                          return (
                            <label
                              key={d.id}
                              className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer ${
                                isChecked
                                  ? 'bg-white border-blue-300 text-slate-900'
                                  : 'bg-slate-100/60 border-slate-200 text-slate-500'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  updateCustomExport((prev) => ({
                                    ...prev,
                                    selectedDefectIds: checked
                                      ? Array.from(new Set([...prev.selectedDefectIds, d.id]))
                                      : prev.selectedDefectIds.filter((id) => id !== d.id),
                                  }));
                                }}
                                className="w-3.5 h-3.5 mt-0.5 accent-blue-700 shrink-0 cursor-pointer"
                              />
                              <span className="leading-snug">
                                <strong className="text-blue-800">#{d.number}</strong> {d.title}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Extra Footer Note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {t.customFooterNoteLabel}
                </label>
                <input
                  type="text"
                  value={customSettings.customFooterNote}
                  onChange={(e) =>
                    updateCustomExport((prev) => ({
                      ...prev,
                      customFooterNote: e.target.value,
                    }))
                  }
                  placeholder={t.customFooterNotePlaceholder}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Live Export Summary Banner */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-950">
                <div>
                  <strong>{t.customPreviewSummaryLabel}</strong>{' '}
                  {lang === 'en'
                    ? `${enabledSectionsCount} sections · ${customFilteredDefects.length} defects (up to 3/page)`
                    : `เปิดใช้งาน ${enabledSectionsCount} ส่วน · รายการ Defect ${customFilteredDefects.length} ข้อ (สูงสุด 3 ข้อ/หน้า)`}
                </div>
                <span className="font-semibold text-blue-700">
                  {lang === 'en'
                    ? 'Applies to PDF & Word'
                    : 'มีผลทันทีเมื่อกดส่งออก PDF / Word'}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
