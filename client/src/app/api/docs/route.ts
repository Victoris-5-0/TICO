import { NextResponse } from 'next/server';

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TICO Backend API - Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <link rel="icon" type="image/png" href="/favicon.ico" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #0f172a; color: #f8fafc; font-family: sans-serif; }
    .topbar { display: none; }
    .swagger-ui .info { margin: 30px 0 20px; }
    .swagger-ui .info .title { color: #38bdf8; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 28px; }
    .swagger-ui .info p, .swagger-ui .info li { color: #94a3b8; font-size: 14px; line-height: 1.6; }
    .swagger-ui .scheme-container { background: #1e293b; box-shadow: none; border-bottom: 1px solid #334155; padding: 15px 0; margin-bottom: 20px; }
    .swagger-ui .btn.authorize { color: #38bdf8; border-color: #38bdf8; }
    .swagger-ui .btn.authorize svg { fill: #38bdf8; }
    .swagger-ui .opblock-tag { font-size: 18px; border-bottom: 1px solid #334155; color: #e2e8f0; margin-top: 20px; }
    .swagger-ui .opblock { border-radius: 8px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    .custom-header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border-bottom: 1px solid #334155;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .custom-header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .custom-header .badge {
      background: #0284c7;
      color: #fff;
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 9999px;
      font-weight: 600;
    }
    .custom-header .links a {
      color: #38bdf8;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      margin-left: 16px;
    }
    .custom-header .links a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <header class="custom-header">
    <h1>
      <span>⚡ TICO Backend API</span>
      <span class="badge">OpenAPI 3.0</span>
    </h1>
    <div class="links">
      <a href="/api/openapi.json" target="_blank">Raw JSON Spec</a>
      <a href="/api/v1/health" target="_blank">Health Check</a>
    </div>
  </header>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout",
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        docExpansion: "list",
        filter: true,
        tryItOutEnabled: true,
      });
    };
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
