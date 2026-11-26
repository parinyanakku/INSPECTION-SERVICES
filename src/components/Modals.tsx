import React, { useEffect, useRef, useState } from 'react';
import { Pen, X } from 'lucide-react';
import type {
  AppLanguage,
  BrandConfig,
  DefectItem,
  DefectStatus,
  FloorPlan,
  FloorZone,
  ProjectFile,
  ProjectStatus,
  SeverityLevel,
} from '../types/inspection';
import { DEFAULT_BRAND, ZONE_COLOR_PRESETS } from '../data/defaultData';
import {
  UI_TEXT,
  translateDefectStatus,
  translateProjectStatus,
  translateSeverity,
} from '../i18n/translations';
import { compressImageFile, getDefaultSaveAsFilename } from '../utils/imageUtils';
import { DefaultGearLogoSvg } from './BrandLogo';
import {
  MarkupCanvasEditor,
  type MarkupCanvasEditorHandle,
} from './MarkupCanvasEditor';

/* ============================================================================
 * 1. BRAND SETTINGS MODAL
 * ============================================================================ */
interface BrandSettingsModalProps {
  lang: AppLanguage;
  brand: BrandConfig;
  onClose: () => void;
  onSave: (next: BrandConfig) => void;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'danger') => void;
}

export const BrandSettingsModal: React.FC<BrandSettingsModalProps> = ({
  lang,
  brand,
  onClose,
  onSave,
  onNotify,
}) => {
  const t = UI_TEXT[lang];
  const [form, setForm] = useState<BrandConfig>({ ...brand });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file, 360, 0.85);
      setForm((prev) => ({ ...prev, customLogoDataUrl: dataUrl }));
    } catch {
      onNotify(
        lang === 'en' ? 'Failed to read logo file' : 'ไม่สามารถอ่านไฟล์รูปโลโก้ได้',
        'danger'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs z-40 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-base">{t.brandModalTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="w-20 h-20 rounded-xl bg-white border border-slate-200 p-1.5 flex items-center justify-center shrink-0">
              {form.customLogoDataUrl ? (
                <img
                  src={form.customLogoDataUrl}
                  alt="Logo preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <DefaultGearLogoSvg className="w-full h-full" />
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <div className="text-sm font-bold text-slate-800">{t.logoSectionTitle}</div>
              <p className="text-xs text-slate-500 mt-0.5">{t.logoSectionSub}</p>
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-2.5">
                <label className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer">
                  {t.uploadLogoBtn}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, customLogoDataUrl: null }))}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  {t.resetLogoBtn}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.companyNameLabel}
              </label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.subtitleLabel}
              </label>
              <input
                type="text"
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.inspectorNameLabel}
              </label>
              <input
                type="text"
                value={form.inspectorName}
                onChange={(e) => setForm({ ...form, inspectorName: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.licenseNoLabel}
              </label>
              <input
                type="text"
                value={form.licenseNo}
                onChange={(e) => setForm({ ...form, licenseNo: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{t.taglineLabel}</label>
            <input
              type="text"
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-end">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.contactLabel}
              </label>
              <input
                type="text"
                value={form.contactInfo}
                onChange={(e) => setForm({ ...form, contactInfo: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.accentColorLabel}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.accentColor || '#1e3a8a'}
                  onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                  className="w-12 h-10 rounded-xl border border-slate-300 cursor-pointer p-1"
                />
                <span className="text-xs text-slate-500 font-mono-num">{form.accentColor}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
          >
            {t.cancelBtn}
          </button>
          <button
            type="button"
            onClick={() =>
              onSave({
                ...form,
                companyName: form.companyName.trim() || DEFAULT_BRAND.companyName,
                subtitle: form.subtitle.trim() || DEFAULT_BRAND.subtitle,
                inspectorName: form.inspectorName.trim() || DEFAULT_BRAND.inspectorName,
                licenseNo: form.licenseNo.trim() || DEFAULT_BRAND.licenseNo,
              })
            }
            className="px-5 py-2 rounded-xl brand-bg text-white text-sm font-semibold cursor-pointer"
          >
            {t.saveBrandBtn}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. PROJECT CREATE / EDIT MODAL
 * ============================================================================ */
interface ProjectModalProps {
  lang: AppLanguage;
  project: ProjectFile | null;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    name: string;
    houseNo: string;
    clientName: string;
    address: string;
    inspectionDate: string;
    projectStatus: ProjectStatus;
  }) => void;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'danger') => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  lang,
  project,
  onClose,
  onSave,
  onNotify,
}) => {
  const t = UI_TEXT[lang];
  const todayFormatted = new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'th-TH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const [name, setName] = useState(project?.name || '');
  const [houseNo, setHouseNo] = useState(project?.houseNo || '');
  const [clientName, setClientName] = useState(project?.clientName || '');
  const [address, setAddress] = useState(project?.address || '');
  const [inspectionDate, setInspectionDate] = useState(project?.inspectionDate || todayFormatted);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>(
    project?.projectStatus || 'กำลังดำเนินการ'
  );

  const handleSubmit = () => {
    if (!name.trim()) {
      onNotify(
        lang === 'en' ? 'Please enter project name' : 'กรุณากรอกชื่อแฟ้มโครงการ',
        'warning'
      );
      return;
    }
    onSave({
      id: project?.id,
      name: name.trim(),
      houseNo: houseNo.trim(),
      clientName: clientName.trim(),
      address: address.trim(),
      inspectionDate: inspectionDate.trim(),
      projectStatus,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs z-40 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-base">
            {project ? t.projectModalEditTitle : t.projectModalCreateTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.projectNameLabel}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.projectNamePlaceholder}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.houseNoLabel}
              </label>
              <input
                type="text"
                value={houseNo}
                onChange={(e) => setHouseNo(e.target.value)}
                placeholder="123/45"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.clientNameLabel}
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={lang === 'en' ? 'e.g. Mr. Somchai' : 'เช่น คุณสมชาย ใจดี'}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.addressLabel}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={
                lang === 'en' ? 'e.g. The Park Village, Khon Kaen' : 'เช่น หมู่บ้านเดอะปาร์ค จ.ขอนแก่น'
              }
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.inspectionDateLabel}
              </label>
              <input
                type="text"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.projectStatusLabel}
              </label>
              <select
                value={projectStatus}
                onChange={(e) => setProjectStatus(e.target.value as ProjectStatus)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="กำลังดำเนินการ">
                  {translateProjectStatus('กำลังดำเนินการ', lang)}
                </option>
                <option value="ตรวจเสร็จสิ้น">
                  {translateProjectStatus('ตรวจเสร็จสิ้น', lang)}
                </option>
              </select>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
          >
            {t.cancelBtn}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 rounded-xl brand-bg text-white text-sm font-semibold cursor-pointer"
          >
            {project ? t.saveChangesBtn : t.createProjectSubmitBtn}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 3. PHOTO ANNOTATE MODAL (DRAW PEN / CIRCLE / ARROW / RECT / TEXT ON PHOTO)
 * ============================================================================ */
interface PhotoAnnotateModalProps {
  lang: AppLanguage;
  side: 'before' | 'after';
  initialImageSrc: string | null;
  onClose: () => void;
  onSavePhoto: (dataUrl: string | null) => void;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'danger') => void;
}

export const PhotoAnnotateModal: React.FC<PhotoAnnotateModalProps> = ({
  lang,
  side,
  initialImageSrc,
  onClose,
  onSavePhoto,
  onNotify,
}) => {
  const t = UI_TEXT[lang];
  const [imageSrc, setImageSrc] = useState<string | null>(initialImageSrc);
  const editorRef = useRef<MarkupCanvasEditorHandle | null>(null);

  const handleSave = () => {
    const exported = editorRef.current?.exportDataUrl() ?? imageSrc;
    onSavePhoto(exported);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[60] flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full overflow-hidden max-h-[94vh] flex flex-col">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-sm sm:text-base">
            {side === 'before' ? t.annotateModalBeforeTitle : t.annotateModalAfterTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto">
          <MarkupCanvasEditor
            lang={lang}
            imageSrc={imageSrc}
            onImageChange={setImageSrc}
            onNotify={onNotify}
            editorRef={editorRef}
          />
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
          >
            {t.cancelBtn}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl brand-bg text-white text-sm font-semibold cursor-pointer"
          >
            {t.saveAnnotatedPhotoBtn}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 4. DEFECT EDIT / CREATE MODAL (WITH BEFORE & AFTER PHOTOS + ANNOTATION)
 * ============================================================================ */
interface DefectEditModalProps {
  lang: AppLanguage;
  project: ProjectFile;
  defect: DefectItem | null;
  defaultFloorId: string;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    title: string;
    floorId: string;
    zone: string;
    severity: SeverityLevel;
    status: DefectStatus;
    cause: string;
    solution: string;
    beforeImg: string | null;
    afterImg: string | null;
  }) => void;
  onDelete?: (defectId: string) => void;
  onOpenLightbox: (src: string, caption: string) => void;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning' | 'danger') => void;
}

export const DefectEditModal: React.FC<DefectEditModalProps> = ({
  lang,
  project,
  defect,
  defaultFloorId,
  onClose,
  onSave,
  onDelete,
  onOpenLightbox,
  onNotify,
}) => {
  const t = UI_TEXT[lang];
  const initialFloorId = defect?.floorId || defaultFloorId || project.floors[0]?.id || '';
  const initialFloor = project.floors.find((f) => f.id === initialFloorId) || project.floors[0];

  const [title, setTitle] = useState(defect?.title || '');
  const [floorId, setFloorId] = useState(initialFloorId);
  const [zone, setZone] = useState(defect?.zone || initialFloor?.zones[0]?.name || '');
  const [severity, setSeverity] = useState<SeverityLevel>(defect?.severity || 'ปานกลาง');
  const [status, setStatus] = useState<DefectStatus>(defect?.status || 'รอแก้ไข');
  const [cause, setCause] = useState(defect?.cause || '');
  const [solution, setSolution] = useState(defect?.solution || '');
  const [beforeImg, setBeforeImg] = useState<string | null>(defect?.beforeImg || null);
  const [afterImg, setAfterImg] = useState<string | null>(defect?.afterImg || null);
  const [annotatingSide, setAnnotatingSide] = useState<'before' | 'after' | null>(null);

  const selectedFloorObj = project.floors.find((f) => f.id === floorId) || project.floors[0];

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    side: 'before' | 'after'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 960, 0.78);
      if (side === 'before') setBeforeImg(compressed);
      else setAfterImg(compressed);
    } catch {
      onNotify(
        lang === 'en' ? 'Failed to read image file' : 'ไม่สามารถอ่านไฟล์รูปภาพได้',
        'danger'
      );
    }
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      onNotify(
        lang === 'en' ? 'Please enter defect title' : 'กรุณากรอกหัวข้อรายการ Defect',
        'warning'
      );
      return;
    }
    onSave({
      id: defect?.id,
      title: title.trim(),
      floorId,
      zone: zone.trim() || (lang === 'en' ? 'Unspecified Zone' : 'ไม่ระบุโซน'),
      severity,
      status,
      cause: cause.trim(),
      solution: solution.trim(),
      beforeImg,
      afterImg,
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs z-40 flex items-center justify-center p-3 sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full overflow-hidden max-h-[92vh] flex flex-col">
          <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
            <h3 className="font-bold text-base">
              {defect
                ? `${t.defectModalEditTitle} #${defect.number}`
                : t.defectModalCreateTitle}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-300 hover:text-white p-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4 overflow-y-auto">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.defectItemTitleLabel}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.defectTitlePlaceholder}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.floorLabel}
                </label>
                <select
                  value={floorId}
                  onChange={(e) => setFloorId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                >
                  {project.floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.zoneLabel}
                </label>
                <input
                  list="dmZoneListReact"
                  type="text"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="dmZoneListReact">
                  {(selectedFloorObj?.zones || []).map((z) => (
                    <option key={z.id} value={z.name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.severityLabel}
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                >
                  <option value="เร่งด่วน">{translateSeverity('เร่งด่วน', lang)}</option>
                  <option value="ปานกลาง">{translateSeverity('ปานกลาง', lang)}</option>
                  <option value="เล็กน้อย">{translateSeverity('เล็กน้อย', lang)}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.statusLabel}
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DefectStatus)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                >
                  <option value="รอแก้ไข">{translateDefectStatus('รอแก้ไข', lang)}</option>
                  <option value="กำลังแก้ไข">{translateDefectStatus('กำลังแก้ไข', lang)}</option>
                  <option value="แก้ไขแล้ว">{translateDefectStatus('แก้ไขแล้ว', lang)}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.causeLabel}
              </label>
              <textarea
                rows={2}
                value={cause}
                onChange={(e) => setCause(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.solutionLabel}
              </label>
              <textarea
                rows={2}
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Before / After Photos */}
            <div className="pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-sm font-bold text-slate-900">{t.photoComparisonHeading}</h4>
                <span className="text-xs text-slate-400">{t.clickToZoomHint}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/30">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                    <span className="text-xs font-bold text-rose-700">{t.beforeLabel}</span>
                    <div className="flex flex-wrap gap-1">
                      <label className="text-[11px] px-2 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 font-semibold cursor-pointer">
                        {t.uploadOrChangeBtn}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(e, 'before')}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setAnnotatingSide('before')}
                        className="text-[11px] px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Pen className="w-3 h-3" />
                        {t.annotatePhotoBtn}
                      </button>
                      {beforeImg && (
                        <button
                          type="button"
                          onClick={() => setBeforeImg(null)}
                          className="text-[11px] px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold cursor-pointer"
                        >
                          {t.deleteBtn}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="h-44 rounded-lg bg-slate-100 border border-dashed border-slate-300 overflow-hidden flex items-center justify-center">
                    {beforeImg ? (
                      <img
                        src={beforeImg}
                        alt={t.beforeLabel}
                        referrerPolicy="no-referrer"
                        onClick={() => onOpenLightbox(beforeImg, t.beforeLabel)}
                        className="w-full h-full object-cover cursor-zoom-in"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">{t.noBeforePhoto}</span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/30">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                    <span className="text-xs font-bold text-emerald-700">{t.afterLabel}</span>
                    <div className="flex flex-wrap gap-1">
                      <label className="text-[11px] px-2 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 font-semibold cursor-pointer">
                        {t.uploadOrChangeBtn}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(e, 'after')}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setAnnotatingSide('after')}
                        className="text-[11px] px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Pen className="w-3 h-3" />
                        {t.annotatePhotoBtn}
                      </button>
                      {afterImg && (
                        <button
                          type="button"
                          onClick={() => setAfterImg(null)}
                          className="text-[11px] px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold cursor-pointer"
                        >
                          {t.deleteBtn}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="h-44 rounded-lg bg-slate-100 border border-dashed border-slate-300 overflow-hidden flex items-center justify-center">
                    {afterImg ? (
                      <img
                        src={afterImg}
                        alt={t.afterLabel}
                        referrerPolicy="no-referrer"
                        onClick={() => onOpenLightbox(afterImg, t.afterLabel)}
                        className="w-full h-full object-cover cursor-zoom-in"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">{t.noAfterPhoto}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
            <div>
              {defect && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(defect.id)}
                  className="text-xs px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold cursor-pointer"
                >
                  {t.deleteThisDefectBtn}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="px-5 py-2 rounded-xl brand-bg text-white text-sm font-semibold cursor-pointer"
              >
                {t.saveDefectBtn}
              </button>
            </div>
          </div>
        </div>
      </div>

      {annotatingSide && (
        <PhotoAnnotateModal
          lang={lang}
          side={annotatingSide}
          initialImageSrc={annotatingSide === 'before' ? beforeImg : afterImg}
          onClose={() => setAnnotatingSide(null)}
          onSavePhoto={(dataUrl) => {
            if (annotatingSide === 'before') setBeforeImg(dataUrl);
            else setAfterImg(dataUrl);
            setAnnotatingSide(null);
            onNotify(
              lang === 'en' ? 'Annotated photo saved' : 'บันทึกภาพที่ขีดเขียนเรียบร้อยแล้ว',
              'success'
            );
          }}
          onNotify={onNotify}
        />
      )}
    </>
  );
};

/* ============================================================================
 * 5. ZONE EDIT MODAL
 * ============================================================================ */
interface ZoneEditModalProps {
  lang: AppLanguage;
  floor: FloorPlan;
  zone: FloorZone;
  onClose: () => void;
  onSaveName: (zoneId: string, newName: string, bg: string, border: string) => void;
  onDelete: (zoneId: string) => void;
}

export const ZoneEditModal: React.FC<ZoneEditModalProps> = ({
  lang,
  floor,
  zone,
  onClose,
  onSaveName,
  onDelete,
}) => {
  const t = UI_TEXT[lang];
  const [name, setName] = useState(zone.name);
  const [bg, setBg] = useState(zone.bg);
  const [border, setBorder] = useState(zone.border);

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs z-40 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-base">
            {t.zoneModalTitle} ({floor.name})
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t.zoneNameLabel}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t.zoneColorLabel}
            </label>
            <div className="flex flex-wrap gap-2">
              {ZONE_COLOR_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setBg(p.bg);
                    setBorder(p.border);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-transform cursor-pointer ${
                    border === p.border ? 'scale-105 ring-2 ring-slate-400' : ''
                  }`}
                  style={{ background: p.bg, borderColor: p.border, color: p.border }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between">
          <button
            type="button"
            onClick={() => onDelete(zone.id)}
            className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold cursor-pointer"
          >
            {t.deleteZoneBtn}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-semibold cursor-pointer"
            >
              {t.closeBtn}
            </button>
            <button
              type="button"
              onClick={() => {
                if (name.trim()) onSaveName(zone.id, name.trim(), bg, border);
              }}
              className="px-5 py-2 rounded-xl brand-bg text-white text-sm font-semibold cursor-pointer"
            >
              {t.saveSimpleBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 6. SAVE AS JSON MODAL
 * ============================================================================ */
interface SaveAsJsonModalProps {
  lang: AppLanguage;
  projects: ProjectFile[];
  onClose: () => void;
  onConfirmSaveAs: (fileName: string, scope: string) => void;
}

export const SaveAsJsonModal: React.FC<SaveAsJsonModalProps> = ({
  lang,
  projects,
  onClose,
  onConfirmSaveAs,
}) => {
  const t = UI_TEXT[lang];
  const [fileName, setFileName] = useState(() => getDefaultSaveAsFilename('TIS_Inspection'));
  const [scope, setScope] = useState('ALL');

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs z-40 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-base">{t.saveAsModalTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t.fileNameLabel}
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-teal-500 font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t.scopeLabel}
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="ALL">
                {t.scopeAllOpt} ({projects.length} {t.scopeFilesUnit}) {t.scopeBrandSuffix}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.defects.length} {t.exportItemsUnit})
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{t.saveAsNote}</p>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
          >
            {t.cancelBtn}
          </button>
          <button
            type="button"
            onClick={() => onConfirmSaveAs(fileName, scope)}
            className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold cursor-pointer"
          >
            {t.saveJsonBtn}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 7. CONFIRMATION MODAL & LIGHTBOX
 * ============================================================================ */
interface ConfirmModalProps {
  lang: AppLanguage;
  title: string;
  message: string;
  confirmText?: string;
  confirmStyle?: 'danger' | 'primary';
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  lang,
  title,
  message,
  confirmText,
  confirmStyle = 'danger',
  onConfirm,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  return (
    <div
      className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-base">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 text-sm text-slate-600 leading-relaxed">{message}</div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
          >
            {t.cancelBtn}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              confirmStyle === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-blue-700 hover:bg-blue-800 text-white'
            }`}
          >
            {confirmText || t.confirmDefaultBtn}
          </button>
        </div>
      </div>
    </div>
  );
};

interface LightboxModalProps {
  lang: AppLanguage;
  src: string;
  caption: string;
  onClose: () => void;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  lang,
  src,
  caption,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-slate-950/92 z-[70] flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl flex items-center justify-between gap-3 text-white mb-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs sm:text-sm font-semibold bg-white/15 px-3.5 py-1.5 rounded-xl truncate">
          {caption || t.fullscreenDefault}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer"
        >
          {t.closeLightboxBtn}
        </button>
      </div>
      <img
        src={src}
        alt={caption || t.fullscreenDefault}
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[84vh] max-w-full rounded-xl object-contain border border-white/15 bg-black/30"
      />
    </div>
  );
};
