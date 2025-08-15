// Analiza una imagen con el proveedor de visión y devuelve JSON tipado.

export type VisionResult = {
  is_wind_damage: boolean;
  area:
    | "roof"
    | "siding"
    | "garage"
    | "windows"
    | "doors"
    | "fences"
    | "gutters"
    | "solar_panels"
    | "chimney"
    | "porch"
    | "deck"
    | "pool_area"
    | "landscape"
    | "other";
  severity: number;                // 0..4
  quality: number;                 // 0..1
  unrelated_or_low_quality: boolean;
  notes: string;
  confidence: number;              // 0..1
};

const DEFAULT_VISION: VisionResult = {
  is_wind_damage: false,
  area: 'other',
  severity: 0,
  quality: 0.5,
  unrelated_or_low_quality: false,
  notes: '',
  confidence: 0.5
};

export async function analyzeImageWithVision(url: string): Promise<VisionResult> {
  const provider = (process.env.VISION_PROVIDER || 'openai').toLowerCase();
  if (provider !== 'openai') return DEFAULT_VISION;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return DEFAULT_VISION;

  const payload = {
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text:
`You are an insurance wind-damage assessor.
Analyze the image and respond with STRICT JSON ONLY with these keys:
is_wind_damage (boolean),
area ("roof"|"siding"|"garage"|"windows"|"doors"|"fences"|"gutters"|"solar_panels"|"chimney"|"porch"|"deck"|"pool_area"|"landscape"|"other"),
severity (integer 0..4),
quality (float 0..1),
unrelated_or_low_quality (boolean),
notes (short string),
confidence (float 0..1).
No extra text, no markdown.`
        },
        { type: 'image_url', image_url: { url } }
      ]
    }]
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) return DEFAULT_VISION;

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') return DEFAULT_VISION;

  try {
    const parsed = JSON.parse(text);
    const out: VisionResult = {
      is_wind_damage: !!parsed.is_wind_damage,
      area: ([
        "roof","siding","garage","windows","doors","fences",
        "gutters","solar_panels","chimney","porch","deck",
        "pool_area","landscape","other"
      ].includes(parsed.area) ? parsed.area : 'other'),
      severity: Math.max(0, Math.min(4, Number(parsed.severity) || 0)),
      quality: Math.max(0, Math.min(1, Number(parsed.quality) || 0.5)),
      unrelated_or_low_quality: !!parsed.unrelated_or_low_quality,
      notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 300) : '',
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5))
    };
    return out;
  } catch {
    return DEFAULT_VISION;
  }
}
