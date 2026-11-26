import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getAiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseAiDefectJson(rawText: string): {
  title: string;
  severity: 'เร่งด่วน' | 'ปานกลาง' | 'เล็กน้อย';
  cause: string;
  solution: string;
} {
  const cleaned = (rawText || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const normalizeSeverity = (val?: string): 'เร่งด่วน' | 'ปานกลาง' | 'เล็กน้อย' => {
    if (val === 'เร่งด่วน' || val === 'สูง' || val === 'วิกฤต') return 'เร่งด่วน';
    if (val === 'เล็กน้อย' || val === 'ต่ำ') return 'เล็กน้อย';
    return 'ปานกลาง';
  };

  try {
    const obj = JSON.parse(cleaned);
    return {
      title: String(obj.title || '').trim(),
      severity: normalizeSeverity(obj.severity),
      cause: String(obj.cause || '').trim(),
      solution: String(obj.solution || '').trim(),
    };
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1) {
      const candidate =
        lastBrace > firstBrace
          ? cleaned.slice(firstBrace, lastBrace + 1)
          : cleaned.slice(firstBrace);
      const sanitized = candidate.replace(/[\u0000-\u001F]+/g, ' ');
      try {
        const obj = JSON.parse(sanitized);
        return {
          title: String(obj.title || '').trim(),
          severity: normalizeSeverity(obj.severity),
          cause: String(obj.cause || '').trim(),
          solution: String(obj.solution || '').trim(),
        };
      } catch {
        // Fallback regex field extraction
      }
    }
  }

  throw new Error('ไม่สามารถแปลงผลลัพธ์จาก AI เป็นรูปแบบ JSON ที่ถูกต้องได้');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.post('/api/analyze-defect', async (req, res) => {
    try {
      const ai = getAiClient();
      if (!ai) {
        res.status(500).json({
          error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบเซิร์ฟเวอร์ กรุณาตั้งค่าใน Settings > Secrets',
        });
        return;
      }

      const { imageDataUrl, userNote } = req.body as {
        imageDataUrl?: string;
        userNote?: string;
      };

      if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.includes('base64,')) {
        res.status(400).json({ error: 'กรุณาอัปโหลดรูปภาพหน้างานที่ถูกต้องก่อนวิเคราะห์' });
        return;
      }

      const [header, base64Data] = imageDataUrl.split('base64,');
      const mimeMatch = header.match(/data:([^;]+);/);
      const mimeType = mimeMatch?.[1] || 'image/jpeg';

      const noteText = typeof userNote === 'string' && userNote.trim()
        ? `ข้อมูลเพิ่มเติมจากผู้ตรวจสอบ: "${userNote.trim()}"`
        : '';

      const prompt = `คุณคือวิศวกรโยธาผู้เชี่ยวชาญการตรวจรับบ้าน (Home Inspector) วิเคราะห์ภาพถ่ายหน้างานนี้ (หากมีวงกลม ลูกศร หรือกรอบสีมาร์คไว้ ให้โฟกัสที่จุดบกพร่องนั้นเป็นหลัก) ${noteText}
ตอบกลับเป็น JSON Object ภาษาไทยที่กระชับ ชัดเจน ตามมาตรฐานงานวิศวกรรมและงานช่าง:
- title: ชื่อรายการ Defect สั้นกระชับชัดเจน
- severity: เลือก 1 ค่าจาก "เร่งด่วน", "ปานกลาง", "เล็กน้อย"
- cause: สาเหตุทางวิศวกรรมที่ทำให้เกิดปัญหานี้ (1-2 ประโยค)
- solution: วิธีแก้ไขที่ถูกต้องตามมาตรฐานงานช่าง (1-2 ประโยค)`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: 'ชื่อรายการจุดบกพร่องที่ตรวจพบ',
              },
              severity: {
                type: Type.STRING,
                enum: ['เร่งด่วน', 'ปานกลาง', 'เล็กน้อย'],
                description: 'ระดับความรุนแรงของปัญหา',
              },
              cause: {
                type: Type.STRING,
                description: 'สาเหตุทางวิศวกรรมที่ทำให้เกิดจุดบกพร่อง',
              },
              solution: {
                type: Type.STRING,
                description: 'วิธีแก้ไขที่ถูกต้องตามมาตรฐานช่าง',
              },
            },
            required: ['title', 'severity', 'cause', 'solution'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsed = parseAiDefectJson(rawText);

      res.json({
        title: parsed.title || 'จุดบกพร่องที่ตรวจพบ',
        severity: parsed.severity,
        cause: parsed.cause,
        solution: parsed.solution,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเรียกใช้งาน AI';
      console.error('Analyze defect error:', message);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
