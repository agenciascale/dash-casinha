# Dashboard de Tráfego — Conta Casinha

Dashboard estática (GitHub Pages) do funil de captação da Conta Casinha:
**leads de formulário (Lead Ads) + mensagens**, direto da Meta Graph API.

## Como funciona
- `build.ps1` chama a **Meta Graph API** (insights nível anúncio, por dia) e gera `data.js`
  (`daily[]` + `grain[]`, agregados anonimizados). Imposto ×1,1385 sobre todo gasto.
- `index.html` + `app.js` + `styles.css` renderizam 3 abas (Visão Geral · Tráfego Pago · Relatório),
  sem libs — gráficos SVG na mão. CTR sempre de **link**.
- `.github/workflows/build.yml` roda o build e publica no Pages (`deploy-pages@v4`).
  O token da Meta vem do secret **`META_ACCESS_TOKEN`**.
- **cron-job.org** dispara o workflow a cada 3h (`workflow_dispatch`).

## Rodar local
```powershell
$env:META_ACCESS_TOKEN = "<token>"   # ou deixe um .env com META_ACCESS_TOKEN=...
.\build.ps1 -Mode all
# depois: python -m http.server  → abrir index.html
```

## Manutenção
- **Secret `META_ACCESS_TOKEN`**: token da Meta. Ideal usar token de **System User** (não expira);
  com token de 60 dias, renovar a cada ~60 dias no repo → Settings → Secrets → Actions.
- Conta: `act_2315650968737562`. Filtro de objetivo (Leads/Mensagens) por nome de campanha em `funnelOf`.
