import type {
  AppLanguage,
  FloorElement,
  FloorElementType,
  FloorPlan,
  FloorZone,
} from '../types/inspection';

export type CustomTemplateId = 'blank' | 'townhome_1f' | 'townhome_2f' | 'detached_1f';

export interface QuickRoomPreset {
  key: string;
  labelTh: string;
  labelEn: string;
  w: number;
  h: number;
  bg: string;
  border: string;
}

export const QUICK_ROOM_PRESETS: QuickRoomPreset[] = [
  {
    key: 'living',
    labelTh: 'ห้องนั่งเล่น',
    labelEn: 'Living Room',
    w: 40,
    h: 30,
    bg: '#dbeafe',
    border: '#2563eb',
  },
  {
    key: 'bedroom',
    labelTh: 'ห้องนอน',
    labelEn: 'Bedroom',
    w: 35,
    h: 30,
    bg: '#fef3c7',
    border: '#d97706',
  },
  {
    key: 'bathroom',
    labelTh: 'ห้องน้ำ',
    labelEn: 'Bathroom',
    w: 22.5,
    h: 20,
    bg: '#fce7f3',
    border: '#db2777',
  },
  {
    key: 'kitchen',
    labelTh: 'ห้องครัว',
    labelEn: 'Kitchen',
    w: 35,
    h: 22.5,
    bg: '#dcfce7',
    border: '#16a34a',
  },
  {
    key: 'garage',
    labelTh: 'โรงจอดรถ',
    labelEn: 'Garage',
    w: 45,
    h: 25,
    bg: '#ffedd5',
    border: '#ea580c',
  },
  {
    key: 'stairs',
    labelTh: 'โถงบันได',
    labelEn: 'Stair Hall',
    w: 25,
    h: 20,
    bg: '#e0e7ff',
    border: '#4f46e5',
  },
  {
    key: 'balcony',
    labelTh: 'ระเบียง',
    labelEn: 'Balcony',
    w: 30,
    h: 15,
    bg: '#f1f5f9',
    border: '#475569',
  },
];

export interface ArchitecturalElementPreset {
  type: FloorElementType;
  labelTh: string;
  labelEn: string;
  defaultW: number;
  defaultH: number;
  defaultLabelTh?: string;
  defaultLabelEn?: string;
}

export const ARCHITECTURAL_ELEMENT_PRESETS: ArchitecturalElementPreset[] = [
  {
    type: 'door',
    labelTh: 'ประตู',
    labelEn: 'Door',
    defaultW: 10,
    defaultH: 10,
  },
  {
    type: 'window',
    labelTh: 'หน้าต่าง',
    labelEn: 'Window',
    defaultW: 15,
    defaultH: 4,
  },
  {
    type: 'stairs',
    labelTh: 'บันได',
    labelEn: 'Stairs',
    defaultW: 17.5,
    defaultH: 15,
  },
  {
    type: 'wall',
    labelTh: 'ผนังกั้น',
    labelEn: 'Wall',
    defaultW: 25,
    defaultH: 3,
  },
  {
    type: 'entrance',
    labelTh: 'ทิศหน้าบ้าน',
    labelEn: 'Front / Entrance',
    defaultW: 32.5,
    defaultH: 6,
    defaultLabelTh: 'หน้าบ้าน / ทางเข้า',
    defaultLabelEn: 'FRONT / ENTRANCE',
  },
];

export function createArchitecturalElement(
  type: FloorElementType,
  lang: AppLanguage,
  index = 0
): FloorElement {
  const preset =
    ARCHITECTURAL_ELEMENT_PRESETS.find((p) => p.type === type) ||
    ARCHITECTURAL_ELEMENT_PRESETS[0];
  const offset = (index % 5) * 3;
  const x = Math.min(90 - preset.defaultW, 40 + offset);
  const y = type === 'entrance' ? 91 : Math.min(90 - preset.defaultH, 40 + offset);

  return {
    id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    x,
    y,
    w: preset.defaultW,
    h: preset.defaultH,
    rotation: 0,
    label:
      type === 'entrance'
        ? lang === 'en'
          ? preset.defaultLabelEn
          : preset.defaultLabelTh
        : undefined,
  };
}

export function buildCustomTemplateData(
  templateId: CustomTemplateId,
  lang: AppLanguage
): { zones: FloorZone[]; elements: FloorElement[] } {
  const ts = Date.now();
  const isEn = lang === 'en';

  if (templateId === 'townhome_1f') {
    return {
      zones: [
        {
          id: `z_${ts}_1`,
          name: isEn ? 'Kitchen / Laundry' : 'ห้องครัว / ซักล้าง',
          x: 5,
          y: 5,
          w: 90,
          h: 20,
          bg: '#dcfce7',
          border: '#16a34a',
        },
        {
          id: `z_${ts}_2`,
          name: isEn ? 'Living & Dining Hall' : 'ห้องนั่งเล่น / โถงรับแขก',
          x: 5,
          y: 27.5,
          w: 60,
          h: 40,
          bg: '#dbeafe',
          border: '#2563eb',
        },
        {
          id: `z_${ts}_3`,
          name: isEn ? 'Staircase' : 'โถงบันได',
          x: 67.5,
          y: 27.5,
          w: 27.5,
          h: 20,
          bg: '#e0e7ff',
          border: '#4f46e5',
        },
        {
          id: `z_${ts}_4`,
          name: isEn ? 'Bathroom 1F' : 'ห้องน้ำชั้น 1',
          x: 67.5,
          y: 50,
          w: 27.5,
          h: 17.5,
          bg: '#fce7f3',
          border: '#db2777',
        },
        {
          id: `z_${ts}_5`,
          name: isEn ? 'Garage / Front Yard' : 'โรงจอดรถ / หน้าบ้าน',
          x: 5,
          y: 70,
          w: 90,
          h: 22.5,
          bg: '#ffedd5',
          border: '#ea580c',
        },
      ],
      elements: [
        { id: `el_${ts}_1`, type: 'door', x: 25, y: 62.5, w: 10, h: 10, rotation: 0 },
        { id: `el_${ts}_2`, type: 'door', x: 60, y: 55, w: 7.5, h: 7.5, rotation: 90 },
        { id: `el_${ts}_3`, type: 'door', x: 30, y: 20, w: 10, h: 10, rotation: 180 },
        { id: `el_${ts}_4`, type: 'window', x: 42.5, y: 65.5, w: 15, h: 4, rotation: 0 },
        { id: `el_${ts}_5`, type: 'stairs', x: 70, y: 30, w: 22.5, h: 15, rotation: 0 },
        {
          id: `el_${ts}_6`,
          type: 'entrance',
          x: 32.5,
          y: 93,
          w: 35,
          h: 5.5,
          rotation: 0,
          label: isEn ? 'FRONT / ENTRANCE' : 'หน้าบ้าน / ทางเข้า',
        },
      ],
    };
  }

  if (templateId === 'townhome_2f') {
    return {
      zones: [
        {
          id: `z_${ts}_1`,
          name: isEn ? 'Bedroom 2' : 'ห้องนอน 2',
          x: 5,
          y: 5,
          w: 57.5,
          h: 32.5,
          bg: '#e0e7ff',
          border: '#4f46e5',
        },
        {
          id: `z_${ts}_2`,
          name: isEn ? 'Bathroom 2F' : 'ห้องน้ำชั้น 2',
          x: 65,
          y: 5,
          w: 30,
          h: 32.5,
          bg: '#fce7f3',
          border: '#db2777',
        },
        {
          id: `z_${ts}_3`,
          name: isEn ? 'Stair Hall 2F' : 'โถงบันไดชั้น 2',
          x: 5,
          y: 40,
          w: 90,
          h: 20,
          bg: '#f1f5f9',
          border: '#475569',
        },
        {
          id: `z_${ts}_4`,
          name: isEn ? 'Master Bedroom' : 'ห้องนอนใหญ่ (Master)',
          x: 5,
          y: 62.5,
          w: 65,
          h: 30,
          bg: '#fef3c7',
          border: '#d97706',
        },
        {
          id: `z_${ts}_5`,
          name: isEn ? 'Front Balcony' : 'ระเบียงหน้าบ้าน',
          x: 72.5,
          y: 62.5,
          w: 22.5,
          h: 30,
          bg: '#dbeafe',
          border: '#2563eb',
        },
      ],
      elements: [
        { id: `el_${ts}_1`, type: 'stairs', x: 67.5, y: 42.5, w: 25, h: 15, rotation: 0 },
        { id: `el_${ts}_2`, type: 'door', x: 22.5, y: 57.5, w: 10, h: 10, rotation: 0 },
        { id: `el_${ts}_3`, type: 'door', x: 22.5, y: 32.5, w: 10, h: 10, rotation: 180 },
        { id: `el_${ts}_4`, type: 'door', x: 75, y: 32.5, w: 7.5, h: 7.5, rotation: 180 },
        { id: `el_${ts}_5`, type: 'window', x: 25, y: 90.5, w: 20, h: 4, rotation: 0 },
        {
          id: `el_${ts}_6`,
          type: 'entrance',
          x: 32.5,
          y: 93,
          w: 35,
          h: 5.5,
          rotation: 0,
          label: isEn ? 'FRONT / BALCONY SIDE' : 'ด้านหน้าบ้าน',
        },
      ],
    };
  }

  if (templateId === 'detached_1f') {
    return {
      zones: [
        {
          id: `z_${ts}_1`,
          name: isEn ? 'Kitchen & Dining' : 'ห้องครัว & ทานอาหาร',
          x: 5,
          y: 5,
          w: 45,
          h: 32.5,
          bg: '#dcfce7',
          border: '#16a34a',
        },
        {
          id: `z_${ts}_2`,
          name: isEn ? 'Bathroom 1F' : 'ห้องน้ำชั้น 1',
          x: 52.5,
          y: 5,
          w: 20,
          h: 22.5,
          bg: '#fce7f3',
          border: '#db2777',
        },
        {
          id: `z_${ts}_3`,
          name: isEn ? 'Stair Hall' : 'โถงบันได',
          x: 75,
          y: 5,
          w: 20,
          h: 32.5,
          bg: '#e0e7ff',
          border: '#4f46e5',
        },
        {
          id: `z_${ts}_4`,
          name: isEn ? 'Living Room' : 'ห้องนั่งเล่น / รับแขก',
          x: 5,
          y: 40,
          w: 52.5,
          h: 32.5,
          bg: '#dbeafe',
          border: '#2563eb',
        },
        {
          id: `z_${ts}_5`,
          name: isEn ? 'Ground Bedroom' : 'ห้องนอนล่าง / อเนกประสงค์',
          x: 60,
          y: 40,
          w: 35,
          h: 32.5,
          bg: '#fef3c7',
          border: '#d97706',
        },
        {
          id: `z_${ts}_6`,
          name: isEn ? '2-Car Garage' : 'โรงจอดรถ (2 คัน)',
          x: 5,
          y: 75,
          w: 90,
          h: 17.5,
          bg: '#ffedd5',
          border: '#ea580c',
        },
      ],
      elements: [
        { id: `el_${ts}_1`, type: 'door', x: 25, y: 67.5, w: 10, h: 10, rotation: 0 },
        { id: `el_${ts}_2`, type: 'door', x: 65, y: 37.5, w: 7.5, h: 7.5, rotation: 0 },
        { id: `el_${ts}_3`, type: 'window', x: 7.5, y: 70.5, w: 15, h: 4, rotation: 0 },
        { id: `el_${ts}_4`, type: 'window', x: 70, y: 70.5, w: 15, h: 4, rotation: 0 },
        { id: `el_${ts}_5`, type: 'stairs', x: 77.5, y: 10, w: 15, h: 22.5, rotation: 90 },
        {
          id: `el_${ts}_6`,
          type: 'entrance',
          x: 32.5,
          y: 93,
          w: 35,
          h: 5.5,
          rotation: 0,
          label: isEn ? 'FRONT / ENTRANCE' : 'หน้าบ้าน / ทางเข้า',
        },
      ],
    };
  }

  return { zones: [], elements: [] };
}

export function cloneFloorToCustomBuilder(
  source: FloorPlan,
  newFloorId: string,
  newFloorName: string,
  lang: AppLanguage
): FloorPlan {
  const ts = Date.now();
  const clonedZones: FloorZone[] = (source.zones || []).map((z, idx) => ({
    ...z,
    id: `z_${ts}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
  }));
  const clonedElements: FloorElement[] = (source.elements || []).map((el, idx) => ({
    ...el,
    id: `el_${ts}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
  }));

  return {
    id: newFloorId,
    name: newFloorName,
    subtitle:
      lang === 'en'
        ? `${clonedZones.length} Rooms`
        : `${clonedZones.length} ห้อง/โซน`,
    imageUrl: null,
    svgPreset: source.svgPreset ?? 0,
    isCustomBuilder: true,
    zones: clonedZones,
    elements: clonedElements,
  };
}
