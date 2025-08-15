// Tipos compartidos para la respuesta final

export type AreaKey =
  "roof"
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

export type PrimaryPeril = "wind" | "no wind";

export type AreaEntry = {
  area: AreaKey;
  damage_confirmed: boolean;
  primary_peril: PrimaryPeril;
  count: number;
  avg_severity: number;          
  representative_images: string[];
  notes: string;
};

export type SourceImagesMeta = {
  total: number;
  analyzed: number;
  discarded_low_quality: number;
  clusters: number;
};

export type AggregateResponse = {
  claim_id: string;
  source_images: SourceImagesMeta;
  overall_damage_severity: number; 
  areas: AreaEntry[];
  data_gaps: string[];
  confidence: number;             
  generated_at: string;
};

export function buildEmptyAggregateResponse(input: {
  claim_id: string;
  total: number;
}): AggregateResponse {
  return {
    claim_id: input.claim_id,
    source_images: {
      total: input.total,
      analyzed: input.total,
      discarded_low_quality: 0,
      clusters: input.total
    },
    overall_damage_severity: 0,
    areas: [],            
    data_gaps: [],
    confidence: 0,
    generated_at: new Date().toISOString()
  };
}
