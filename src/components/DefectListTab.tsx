import React, { useMemo, useState } from 'react';
import { Camera, CheckCircle2, Edit3, Pen, Plus, Search, Trash2 } from 'lucide-react';
import type { AppLanguage, DefectItem, ProjectFile } from '../types/inspection';
import { UI_TEXT, translateDefectStatus, translateSeverity } from '../i18n/translations';
import { compressImageFile, getFloorNameById } from '../utils/imageUtils';

interface DefectListTabProps {
  lang: AppLanguage;
  project: ProjectFile;
  onEditDefect: (defectId: string | null) => void;
  onAnnotateDefectPhoto: (defectId: string, side: 'before' | 'after') => void;
  onDeleteDefect: (defectId: string) => void;
  onCycleStatus: (defectId: string) => void;
  onUpdateDefectPhoto: (defectId: string, field: 'beforeImg' | 'afterImg', dataUrl: string) => void;
  onOpenLightbox: (src: string, caption: string) => void;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'danger') => void;
}

export const DefectListTab: React.FC<DefectListTabProps> = ({
  lang,
  project,
  onEditDefect,
  onAnnotateDefectPhoto,
  onDeleteDefect,
  onCycleStatus,
  onUpdateDefectPhoto,
  onOpenLightbox,
  onNotify,
}) => {
  const t = UI_TEXT[lang];
  const [search, setSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const allZones = useMemo(
    () => Array.from(new Set(project.defects.map((d) => d.zone).filter(Boolean))),
    [project.defects]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return project.defects
      .filter((d) => {
        if (floorFilter !== 'all' && d.floorId !== floorFilter) return false;
        if (zoneFilter !== 'all' && d.zone !== zoneFilter) return false;
        if (severityFilter !== 'all' && d.severity !== severityFilter) return false;
        if (statusFilter !== 'all' && d.status !== statusFilter) return false;
        if (q) {
          const hay = `#${d.number} ${d.title} ${d.zone} ${d.cause} ${d.solution}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.number || 0) - (b.number || 0));
  }, [project.defects, search, floorFilter, zoneFilter, severityFilter, statusFilter]);

  const handleQuickPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    defectId: string,
    field: 'beforeImg' | 'afterImg'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 2560, 0.95);
      onUpdateDefectPhoto(defectId, field, compressed);
      onNotify(
        field === 'beforeImg'
          ? lang === 'en'
            ? 'Before photo attached'
            : 'แนบรูปก่อนแก้ไข (Before) เรียบร้อยแล้ว'
          : lang === 'en'
          ? 'After photo attached'
          : 'แนบรูปหลังแก้ไข (After) เรียบร้อยแล้ว',
        'success'
      );
    } catch {
      onNotify(
        lang === 'en' ? 'Failed to upload photo' : 'ไม่สามารถอัปโหลดรูปภาพได้',
        'danger'
      );
    }
  };

  const getSeverityStyle = (sev: DefectItem['severity']) => {
    if (sev === 'เร่งด่วน') return 'text-rose-700 font-bold';
    if (sev === 'เล็กน้อย') return 'text-blue-700 font-semibold';
    return 'text-amber-700 font-semibold';
  };

  const getStatusBtnStyle = (st: DefectItem['status']) => {
    if (st === 'แก้ไขแล้ว')
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
    if (st === 'กำลังแก้ไข')
      return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100';
    return 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100';
  };

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.listSearchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white"
            >
              <option value="all">{t.allFloorsOpt}</option>
              {project.floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white max-w-[210px]"
            >
              <option value="all">{t.allZonesOpt}</option>
              {allZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white"
            >
              <option value="all">{t.allSeverityOpt}</option>
              <option value="เร่งด่วน">{translateSeverity('เร่งด่วน', lang)}</option>
              <option value="ปานกลาง">{translateSeverity('ปานกลาง', lang)}</option>
              <option value="เล็กน้อย">{translateSeverity('เล็กน้อย', lang)}</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white"
            >
              <option value="all">{t.allStatusOpt}</option>
              <option value="รอแก้ไข">{translateDefectStatus('รอแก้ไข', lang)}</option>
              <option value="กำลังแก้ไข">{translateDefectStatus('กำลังแก้ไข', lang)}</option>
              <option value="แก้ไขแล้ว">{translateDefectStatus('แก้ไขแล้ว', lang)}</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => onEditDefect(null)}
            className="px-4 py-2 rounded-xl brand-bg hover:opacity-95 text-white text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t.addDefectBtn}
          </button>
        </div>
      </section>

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
          <p className="text-sm font-semibold">{t.noDefectsFound}</p>
          <p className="text-xs text-slate-400 mt-1">{t.noDefectsHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((d) => {
            const floorName = getFloorNameById(project, d.floorId);
            return (
              <article
                key={d.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono-num font-bold text-slate-900">#{d.number}</span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className={getSeverityStyle(d.severity)}>
                        {translateSeverity(d.severity, lang)}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => onCycleStatus(d.id)}
                        title={t.cycleStatusTooltip}
                        className={`px-2.5 py-0.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${getStatusBtnStyle(
                          d.status
                        )}`}
                      >
                        {translateDefectStatus(d.status, lang)}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEditDefect(d.id)}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        {t.editPhotoBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteDefect(d.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer"
                        title={t.deleteBtn}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h4 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                    {d.title}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {floorName} <span aria-hidden="true">·</span> {d.zone}
                  </p>

                  {!d.hideCause && d.cause && (
                    <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                      <strong className="text-slate-800">{t.causeLabel}:</strong> {d.cause}
                    </p>
                  )}
                  {!d.hideSolution && d.solution && (
                    <p className="text-xs text-emerald-800 bg-emerald-50/70 border border-emerald-200/70 rounded-xl px-3 py-2 mt-2 leading-relaxed">
                      <strong>{t.solutionLabel}:</strong> {d.solution}
                    </p>
                  )}
                </div>

                {/* Before / After Comparison */}
                <div className="grid grid-cols-2 gap-3 mt-4 pt-3.5 border-t border-slate-100">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[11px] font-bold text-rose-600 truncate">
                        {t.beforeLabel}
                      </span>
                      {d.beforeImg && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onAnnotateDefectPhoto(d.id, 'before')}
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5 cursor-pointer"
                            title={t.annotatePhotoBtn}
                          >
                            <Pen className="w-3 h-3" />
                            <span>{t.annotatePhotoBtn}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditDefect(d.id)}
                            className="text-[11px] text-slate-500 hover:text-blue-600 cursor-pointer"
                          >
                            {t.changePhotoBtn}
                          </button>
                        </div>
                      )}
                    </div>
                    {d.beforeImg ? (
                      <img
                        src={d.beforeImg}
                        alt={`#${d.number} ${t.beforeLabel}`}
                        referrerPolicy="no-referrer"
                        onClick={() =>
                          onOpenLightbox(d.beforeImg!, `#${d.number} ${d.title} — ${t.beforeLabel}`)
                        }
                        className="w-full h-32 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity"
                      />
                    ) : (
                      <label className="w-full h-32 rounded-xl border border-dashed border-rose-300 bg-rose-50/30 hover:bg-rose-50 text-xs text-rose-600 font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors">
                        <Camera className="w-4 h-4" />
                        <span>{t.addBeforePhotoBtn}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleQuickPhoto(e, d.id, 'beforeImg')}
                        />
                      </label>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[11px] font-bold text-emerald-700 truncate">
                        {t.afterLabel}
                      </span>
                      {d.afterImg && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onAnnotateDefectPhoto(d.id, 'after')}
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5 cursor-pointer"
                            title={t.annotatePhotoBtn}
                          >
                            <Pen className="w-3 h-3" />
                            <span>{t.annotatePhotoBtn}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditDefect(d.id)}
                            className="text-[11px] text-slate-500 hover:text-blue-600 cursor-pointer"
                          >
                            {t.changePhotoBtn}
                          </button>
                        </div>
                      )}
                    </div>
                    {d.afterImg ? (
                      <img
                        src={d.afterImg}
                        alt={`#${d.number} ${t.afterLabel}`}
                        referrerPolicy="no-referrer"
                        onClick={() =>
                          onOpenLightbox(d.afterImg!, `#${d.number} ${d.title} — ${t.afterLabel}`)
                        }
                        className="w-full h-32 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity"
                      />
                    ) : (
                      <label className="w-full h-32 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 hover:bg-emerald-50 text-xs text-emerald-700 font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{t.addAfterPhotoBtn}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleQuickPhoto(e, d.id, 'afterImg')}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
