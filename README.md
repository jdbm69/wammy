# Wamy Wind Aggregator

Servicio serverless en **AWS Lambda** + **API Gateway** que recibe un payload con URLs de imágenes, analiza el daño por viento y devuelve un resumen agregado.

## 📦 Estructura del repositorio

├─ src/ # Código de la Lambda (TypeScript)
│ ├─ handler.ts
│ └─ lib/...
├─ iac/ # Infraestructura como código (AWS CDK v2)
│ ├─ bin/app.ts
│ ├─ lib/wamy-stack.ts
│ ├─ cdk.json
│ └─ ...
├─ test/ # Archivos de prueba
│ ├─ sample_request.json
│ └─ sample_response.json
├─ .env.example
├─ .gitignore
└─ README.md

## 🚀 Despliegue en un solo comando

### 1. *Pre-requisitos*
- **Node.js** v18 o superior
- **AWS CLI** configurada (`aws configure`)
- **AWS CDK v2** instalado globalmente:
- Permisos para crear recursos en AWS (API Gateway, Lambda).

### 2. *Variables de entorno*
Crea un archivo .env en la raíz o en iac/ (no se versiona):
- VISION_PROVIDER=<tu proveedor>
- OPENAI_API_KEY=<tu API key>

Ejemplo de archivo de referencia: .env.example.

### 3. *Despliegue*
Desde la raíz del repositorio:
npm run bootstrap   # Solo la primera vez
npm run deploy

Esto ejecutará:
1. Compilación de la Lambda (src/ → dist/)
2. Despliegue de la infraestructura (iac/)

### 4. *Salidas*
Al finalizar el despliegue verás en consola:
WamyWindAggregatorStack.ApiBaseUrl = https://xxxxxx.execute-api.us-east-1.amazonaws.com

## 📡 Ejemplo de invocación

Una vez desplegado, invoca el endpoint con el payload de ejemplo:
API_URL="<ApiBaseUrl>"
curl -s -X POST "$API_URL/aggregate" \
  -H "content-type: application/json" \
  --data @test/sample_request.json | jq .

## 📄 Ejemplos de request y response

Request (test/sample_request.json):
{
    "claim_id":  "CLM-REAL-ALL",
    "loss_type":  "wind",
    "images":  
    [
        "https://example-bucket.s3.amazonaws.com/img1.jpg",
        "https://example-bucket.s3.amazonaws.com/img2.jpg"
    ]
}

Response (test/sample_response.json):
{
  "claim_id": "CLM-REAL-ALL",
  "source_images": {
    "total": 7,
    "analyzed": 7,
    "discarded_low_quality": 0,
    "clusters": 1
  },
  "overall_damage_severity": 4,
  "areas": [
    {
      "area": "other",
      "damage_confirmed": true,
      "primary_peril": "wind",
      "count": 1,
      "avg_severity": 4,
      "representative_images": [
        "https://img.lalr.co/cms/2024/10/11121421/huracan.jpg?size=sm"
      ],
      "notes": "Severe structural damage likely due to wind."
    }
  ],
  "data_gaps": ["No roof photos", "No siding photos", "No garage photos"],
  "confidence": 0.69,
  "generated_at": "2025-08-15T13:42:51.221Z"
}

## 🛠 Teardown (eliminar recursos)

npm run iac:destroy
Esto eliminará la API Gateway, Lambda y cualquier otro recurso creado por el CDK.

## 🧪 Pruebas locales

Puedes probar la Lambda localmente (requiere ts-node):
npm --prefix src run build
npm --prefix src run test:local

## 📚 Tecnologías usadas
- AWS Lambda (Node.js 18.x)
- API Gateway HTTP API
- AWS CDK v2 (TypeScript)
- esbuild para empaquetado rápido de la Lambda
- Jimp, Zod, Nanoid, p-limit para la lógica de análisis