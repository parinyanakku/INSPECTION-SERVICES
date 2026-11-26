import type {
  AppLanguage,
  GeminiApiConfig,
  GeminiModelId,
  SeverityLevel,
} from '../types/inspection';

export const STORAGE_KEY_GEMINI_API_KEY = 'tis_wl_gemini_api_key_v1';
export const STORAGE_KEY_GEMINI_MODEL = 'tis_wl_gemini_model_v1';
export const STORAGE_KEY_GEMINI_MODELS_CACHE = 'tis_wl_gemini_models_cache_v1';

export const DEFAULT_GEMINI_MODEL: GeminiModelId = 'auto';

const LEGACY_MODELS_TO_UPGRADE = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-3.8-pro',
]);

const EXCLUDED_MODEL_KEYWORDS = [
  'embedding',
  'imagen',
  'veo',
  'tts',
  'native-audio',
  'live',
  'aqa',
  'robotics',
  'computer-use',
  'image-generation',
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function modelPriorityScore(modelId: string): number {
  const m = modelId.toLowerCase();
  if (m === 'gemini-3.5-flash-lite') return 0;
  if (m.includes('flash-lite') && !m.includes('image') && !m.includes('preview') && !m.includes('experimental')) return 1;
  if (m.includes('flash') && !m.includes('image') && !m.includes('preview') && !m.includes('experimental')) return 2;
  if (m.includes('flash')) return 3;
  if (m.includes('pro') && !m.includes('image')) return 4;
  return 5;
}

export function loadCachedGeminiModels(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GEMINI_MODELS_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((x) => String(x || '').trim())
        .filter((x) => x.length > 0 && !LEGACY_MODELS_TO_UPGRADE.has(x));
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export function saveCachedGeminiModels(models: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_GEMINI_MODELS_CACHE, JSON.stringify(models));
  } catch {
    // ignore storage quota errors
  }
}

export function loadGeminiConfig(): GeminiApiConfig {
  try {
    const apiKey = (localStorage.getItem(STORAGE_KEY_GEMINI_API_KEY) || '').trim();
    const rawModel = (localStorage.getItem(STORAGE_KEY_GEMINI_MODEL) || '').trim();
    if (!rawModel || LEGACY_MODELS_TO_UPGRADE.has(rawModel)) {
      if (rawModel && LEGACY_MODELS_TO_UPGRADE.has(rawModel)) {
        localStorage.setItem(STORAGE_KEY_GEMINI_MODEL, DEFAULT_GEMINI_MODEL);
      }
      return { apiKey, model: DEFAULT_GEMINI_MODEL };
    }
    return { apiKey, model: rawModel };
  } catch {
    return { apiKey: '', model: DEFAULT_GEMINI_MODEL };
  }
}

export function saveGeminiConfig(config: GeminiApiConfig): void {
  try {
    const cleanKey = config.apiKey.trim();
    const cleanModel = (config.model || '').trim() || DEFAULT_GEMINI_MODEL;
    if (cleanKey) {
      localStorage.setItem(STORAGE_KEY_GEMINI_API_KEY, cleanKey);
    } else {
      localStorage.removeItem(STORAGE_KEY_GEMINI_API_KEY);
    }
    localStorage.setItem(STORAGE_KEY_GEMINI_MODEL, cleanModel);
  } catch {
    // ignore storage quota errors
  }
}

export function clearGeminiApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_GEMINI_API_KEY);
    localStorage.removeItem(STORAGE_KEY_GEMINI_MODELS_CACHE);
  } catch {
    // ignore storage errors
  }
}

interface GeminiCandidatePart {
  text?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiCandidatePart[];
    };
  }>;
  error?: {
    message?: string;
  };
}

interface GeminiListModelsItem {
  name?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiListModelsResponse {
  models?: GeminiListModelsItem[];
}

export class GeminiHttpError extends Error {
  status: number;
  rawBody: string;

  constructor(status: number, message: string, rawBody = '') {
    super(message);
    this.name = 'GeminiHttpError';
    this.status = status;
    this.rawBody = rawBody;
  }
}

function buildEndpoint(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
}

function parseGeminiErrorMessage(status: number, bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText);
    const msg = parsed?.error?.message;
    if (typeof msg === 'string' && msg.trim()) {
      return `HTTP ${status}: ${msg}`;
    }
  } catch {
    // ignore non-JSON body
  }
  return `HTTP ${status}: ${bodyText || 'Request failed'}`;
}

function isAuthFailure(err: unknown): boolean {
  if (err instanceof GeminiHttpError) {
    if (err.status === 401 || err.status === 403) return true;
    const combined = `${err.message} ${err.rawBody}`;
    if (combined.includes('API_KEY_INVALID') || combined.includes('PERMISSION_DENIED')) {
      return true;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('HTTP 401') ||
    msg.includes('HTTP 403') ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('PERMISSION_DENIED')
  );
}

function is503HighDemand(err: unknown): boolean {
  if (err instanceof GeminiHttpError && err.status === 503) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('HTTP 503') || msg.toLowerCase().includes('high demand');
}

function xhrGetJson<T>(url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 3000;

    xhr.onload = () => {
      const bodyText = xhr.responseText || '';
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(bodyText) as T);
        } catch {
          reject(new Error('Invalid JSON response from ListModels API'));
        }
        return;
      }
      reject(
        new GeminiHttpError(
          xhr.status,
          parseGeminiErrorMessage(xhr.status, bodyText),
          bodyText
        )
      );
    };

    xhr.onerror = () => {
      reject(new Error('Network error while loading Gemini model list'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Timed out while loading Gemini model list'));
    };

    try {
      xhr.send();
    } catch (err: unknown) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Fetches all real Gemini models supported by the user's API key via ListModels API.
 * Uses XMLHttpRequest to bypass preview fetch interceptors.
 */
export async function fetchAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('MISSING_API_KEY');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
    cleanKey
  )}`;
  const data = await xhrGetJson<GeminiListModelsResponse>(url);
  const rawList = Array.isArray(data.models) ? data.models : [];

  const filtered = rawList
    .filter((item) => {
      const name = String(item.name || '').replace(/^models\//, '').trim();
      const lower = name.toLowerCase();
      if (!lower.includes('gemini')) return false;
      const methods = Array.isArray(item.supportedGenerationMethods)
        ? item.supportedGenerationMethods
        : [];
      if (!methods.includes('generateContent')) return false;
      if (EXCLUDED_MODEL_KEYWORDS.some((kw) => lower.includes(kw))) return false;
      return true;
    })
    .map((item) => String(item.name || '').replace(/^models\//, '').trim());

  const uniqueSorted = Array.from(new Set(filtered)).sort((a, b) => {
    const scoreDiff = modelPriorityScore(a) - modelPriorityScore(b);
    if (scoreDiff !== 0) return scoreDiff;
    return a.localeCompare(b);
  });

  if (uniqueSorted.length > 0) {
    saveCachedGeminiModels(uniqueSorted);
  }

  return uniqueSorted;
}

/**
 * Direct client-side call to Google Gemini REST API using XMLHttpRequest
 * to bypass window.fetch proxy interceptors inside preview iframes.
 */
export function callGeminiDirect<T = GeminiGenerateContentResponse>(
  apiKey: string,
  model: string,
  requestBody: unknown,
  timeoutMs = 20000
): Promise<T> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return Promise.reject(new Error('MISSING_API_KEY'));
  }

  const url = buildEndpoint(model, cleanKey);

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = Math.max(1, timeoutMs);

    xhr.onload = () => {
      const bodyText = xhr.responseText || '';
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(bodyText) as T;
          resolve(parsed);
        } catch {
          reject(new Error(`Invalid JSON response from Gemini (${model})`));
        }
        return;
      }
      reject(
        new GeminiHttpError(
          xhr.status,
          parseGeminiErrorMessage(xhr.status, bodyText),
          bodyText
        )
      );
    };

    xhr.onerror = () => {
      reject(new Error('Network error while connecting to Google Gemini API'));
    };

    xhr.ontimeout = () => {
      reject(new Error('GEMINI_TIMEOUT'));
    };

    xhr.onabort = () => {
      reject(new Error('GEMINI_TIMEOUT'));
    };

    try {
      xhr.send(JSON.stringify(requestBody));
    } catch (err: unknown) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

async function resolveCandidateModels(
  cleanKey: string,
  preferredModel: GeminiModelId,
  providedModels?: string[]
): Promise<{ candidates: string[]; listModelsVerifiedKey: boolean }> {
  let available = (providedModels || []).filter(Boolean);
  let listModelsVerifiedKey = available.length > 0;

  if (available.length === 0) {
    available = loadCachedGeminiModels();
  }

  if (available.length === 0) {
    try {
      available = await fetchAvailableGeminiModels(cleanKey);
      listModelsVerifiedKey = available.length > 0;
    } catch (err: unknown) {
      if (isAuthFailure(err)) {
        throw err;
      }
    }
  }

  const fallbackPool = available.length > 0 ? available : ['gemini-3.8-flash'];
  const preferred = (preferredModel || '').trim();
  const candidates =
    preferred && preferred !== 'auto' && !LEGACY_MODELS_TO_UPGRADE.has(preferred)
      ? Array.from(new Set([preferred, ...fallbackPool]))
      : Array.from(new Set(fallbackPool));

  return { candidates, listModelsVerifiedKey };
}

export async function testGeminiConnection(
  apiKey: string,
  model: GeminiModelId,
  providedModels?: string[]
): Promise<{
  status: 'ok' | 'high_demand' | 'error';
  modelUsed: string;
  message: string;
}> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return {
      status: 'error',
      modelUsed: model,
      message: 'API key is empty',
    };
  }

  let candidates: string[] = [];
  let listModelsVerifiedKey = false;
  try {
    const resolved = await resolveCandidateModels(cleanKey, model, providedModels);
    candidates = resolved.candidates;
    listModelsVerifiedKey = resolved.listModelsVerifiedKey;
  } catch (err: unknown) {
    return {
      status: 'error',
      modelUsed: model,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  let saw503 = false;
  let lastError = 'Connection failed';

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const requestPayload = {
      contents: [{ parts: [{ text: 'Reply with a single word: OK' }] }],
      generationConfig: {
        maxOutputTokens: 16,
      },
    };

    try {
      await callGeminiDirect(cleanKey, candidate, requestPayload);
      return {
        status: 'ok',
        modelUsed: candidate,
        message: 'Connected successfully',
      };
    } catch (err: unknown) {
      if (isAuthFailure(err)) {
        return {
          status: 'error',
          modelUsed: candidate,
          message: err instanceof Error ? err.message : String(err),
        };
      }

      if (is503HighDemand(err)) {
        saw503 = true;
        // Wait 1.5s and retry once on the same model before moving to next model
        await delay(1500);
        try {
          await callGeminiDirect(cleanKey, candidate, requestPayload);
          return {
            status: 'ok',
            modelUsed: candidate,
            message: 'Connected successfully',
          };
        } catch (retryErr: unknown) {
          if (isAuthFailure(retryErr)) {
            return {
              status: 'error',
              modelUsed: candidate,
              message: retryErr instanceof Error ? retryErr.message : String(retryErr),
            };
          }
          if (is503HighDemand(retryErr)) {
            saw503 = true;
          }
          lastError = retryErr instanceof Error ? retryErr.message : String(retryErr);
          continue;
        }
      }

      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (saw503 || listModelsVerifiedKey) {
    return {
      status: 'high_demand',
      modelUsed: candidates[0] || model,
      message: lastError,
    };
  }

  return {
    status: 'error',
    modelUsed: candidates[0] || model,
    message: lastError,
  };
}

export interface AnalyzedDefectResult {
  title: string;
  severity: SeverityLevel;
  cause: string;
  solution: string;
  modelUsed: string;
}

function normalizeSeverity(val: unknown): SeverityLevel {
  const s = String(val || '').trim();
  if (s === 'เร่งด่วน' || s.toLowerCase() === 'urgent') return 'เร่งด่วน';
  if (s === 'เล็กน้อย' || s.toLowerCase() === 'minor') return 'เล็กน้อย';
  return 'ปานกลาง';
}

function parseDefectJson(rawText: string): {
  title: string;
  severity: SeverityLevel;
  cause: string;
  solution: string;
} {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  return {
    title: String(parsed.title || '').trim() || 'จุดบกพร่องที่ตรวจพบ',
    severity: normalizeSeverity(parsed.severity),
    cause: String(parsed.cause || '').trim(),
    solution: String(parsed.solution || '').trim(),
  };
}

// AI request settings are intentionally separate from upload, preview and report quality.
export const AI_IMAGE_MAX_DIMENSION = 1280;
export const AI_IMAGE_JPEG_QUALITY = 0.78;

// Work on a temporary canvas only. Never update the inspection image or its annotations.
function optimizeAnalysisImage(source: string): Promise<string> {
  return new Promise(resolve => {
    const image = new Image();
    const timer = setTimeout(() => resolve(source), 1200);
    const finish = (value: string) => { clearTimeout(timer); resolve(value); };
    image.onload = () => {
      try {
        const ratio = Math.min(1, AI_IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) { finish(source); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', AI_IMAGE_JPEG_QUALITY);
        // Keep the dimension limit for large images even if their original encoding is smaller.
        finish(ratio < 1 || compressed.length < source.length ? compressed : source);
      } catch { finish(source); }
    };
    image.onerror = () => finish(source);
    image.src = source;
  });
}

export async function analyzeDefectWithGeminiClient(params: {
  apiKey: string;
  preferredModel: GeminiModelId;
  imageDataUrl: string;
  userNote?: string;
  lang: AppLanguage;
}): Promise<AnalyzedDefectResult> {
  const cleanKey = params.apiKey.trim();
  if (!cleanKey) {
    throw new Error('MISSING_API_KEY');
  }

  const deadline = Date.now() + 20000;
  // Resolve a cached model and prepare the image concurrently; no extra list
  // request before analysis when a valid explicit or cached model is available.
  const preferred = String(params.preferredModel || 'auto').trim();
  const cached = loadCachedGeminiModels().filter(m =>
    m.includes('flash') && !m.includes('image') &&
    !EXCLUDED_MODEL_KEYWORDS.some(kw => m.toLowerCase().includes(kw))
  ).sort((a,b) => modelPriorityScore(a) - modelPriorityScore(b) || b.localeCompare(a));
  const configured = preferred !== 'auto' && !LEGACY_MODELS_TO_UPGRADE.has(preferred) ? preferred : '';
  const fastCandidates = Array.from(new Set([
    ...(configured ? [configured] : []),
    ...cached,
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
  ]));
  const aiRequestImageDataUrl = await optimizeAnalysisImage(params.imageDataUrl);
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(aiRequestImageDataUrl);
  if (!match) {
    throw new Error('Invalid image format');
  }

  const mimeType = match[1];
  const base64Data = match[2];
  const note = (params.userNote || '').trim();

  const promptText =
    params.lang === 'en'
      ? `You are a senior building & home inspection engineer. Inspect this site photo (including any red/colored circles, arrows, lines, or text annotations drawn on the image) and identify the construction defect.
${note ? `Inspector note: "${note}"` : ''}
Use a short title and at most 1–2 concise sentences each for cause and solution. State uncertainty when the image cannot establish a cause; do not invent a diagnosis. Respond in English.
For "severity", you MUST return strictly one of these three exact strings: "เร่งด่วน", "ปานกลาง", or "เล็กน้อย".
Return valid JSON only with keys: title, severity, cause, solution.`
      : `คุณคือวิศวกรผู้เชี่ยวชาญด้านการตรวจรับบ้านและอาคาร โปรดวิเคราะห์ภาพถ่ายหน้างานนี้ (รวมถึงรอยวงกลม ลูกศร เส้นมาร์ค หรือข้อความที่ผู้ตรวจวงไว้บนภาพ) และสรุปปัญหา Defect ทางวิศวกรรม
${note ? `หมายเหตุจากผู้ตรวจ: "${note}"` : ''}
ตอบภาษาไทย ชื่อรายการสั้น สาเหตุและวิธีแก้ไขอย่างละ 1–2 ประโยค ระบุความไม่แน่นอนหากยืนยันจากภาพไม่ได้ ห้ามสรุปสาเหตุเกินหลักฐาน
สำหรับ "severity" ให้เลือกตอบเพียง 1 ค่าจาก ["เร่งด่วน", "ปานกลาง", "เล็กน้อย"] เท่านั้น
ส่งผลลัพธ์กลับเป็น JSON ที่มีคีย์ title, severity, cause, solution`;

  const boundedCandidates = fastCandidates.slice(0, 2);

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          { text: promptText },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          severity: {
            type: 'STRING',
            enum: ['เร่งด่วน', 'ปานกลาง', 'เล็กน้อย'],
          },
          cause: { type: 'STRING' },
          solution: { type: 'STRING' },
        },
        required: ['title', 'severity', 'cause', 'solution'],
      },
    },
  };

  let lastError = 'Unknown Gemini API error';
  const timeoutMessage = params.lang === 'en'
    ? 'AI took too long. Try again or choose a Flash model in API settings.'
    : 'AI ตอบกลับช้าเกินกำหนด กรุณาลองใหม่หรือเลือกโมเดล Flash ในการตั้งค่า API';

  for (let i = 0; i < boundedCandidates.length; i++) {
    const model = boundedCandidates[i];
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(timeoutMessage);
    try {
      const fastThinking = /^gemini-3(?:[.-]|$)/i.test(model) && model.includes('flash') && !model.includes('thinking');
      const payload = await callGeminiDirect(cleanKey, model, {
        ...requestBody,
        generationConfig: {
          ...requestBody.generationConfig,
          ...(fastThinking ? { thinkingConfig: { thinkingLevel: 'MINIMAL' } } : {}),
        },
      }, Math.min(15000, remaining));
      const rawOutput = payload?.candidates?.[0]?.content?.parts
        ?.map(p => p.text || '').join('') || '';
      if (!rawOutput) throw new Error('Empty response from ' + model);
      return { ...parseDefectJson(rawOutput), modelUsed: model };
    } catch (err: unknown) {
      if (isAuthFailure(err)) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof GeminiHttpError && err.status === 429) {
        throw new Error(params.lang === 'en'
          ? 'Gemini quota or rate limit reached. Check your API quota and try again.'
          : 'Gemini มีการจำกัดโควตาหรือจำนวนคำขอ กรุณาตรวจสอบโควตา API แล้วลองใหม่');
      }
      if (message === 'GEMINI_TIMEOUT') throw new Error(timeoutMessage);
      lastError = message;
      // Only try one alternate model on a quick failure. Never retry after a timeout.
    }
  }
  throw new Error(lastError);
}
