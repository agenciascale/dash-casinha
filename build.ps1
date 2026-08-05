#requires -Version 5
<#
  build.ps1 - Dashboard de trafego (LEAD + MENSAGEM) Conta Casinha
  Le a Meta Graph API (insights nivel anuncio, por dia) e gera data.js.
  Token da Meta vem de $env:META_ACCESS_TOKEN (secret do GitHub Actions / .env local).

  Resultado-headline = LEADS de formulario (action 'lead'); mensagens (messaging_first_reply)
  como resultado secundario. Imposto x1.1385 sobre TODO gasto (Meta Ads).

  Modelo: daily[] (funil por dia) + grain[] (por dia x campanha x conjunto x anuncio).
  Publica so agregados (sem PII).
#>
param([string]$Mode = "all")

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---------------- CONFIG ----------------
$ACCOUNT   = "act_2315650968737562"   # Conta Casinha - Oficial
$API_VER   = "v19.0"
$TAX       = 1.1385                    # imposto Meta Ads
$START     = "2026-01-01"             # busca desde esta data ate hoje (BRT)
$LEAD_TYPE = "lead"                                       # leads de formulario
$MSG_TYPE  = "onsite_conversion.messaging_first_reply"    # 1a resposta em mensagem (= Streamlit)

$OutFile = Join-Path $PSScriptRoot "data.js"

$TOKEN = $env:META_ACCESS_TOKEN
if ([string]::IsNullOrWhiteSpace($TOKEN)) {
  # fallback: le do .env local (nunca commitado) pra rodar na maquina
  $envFile = Join-Path $PSScriptRoot ".env"
  if (Test-Path $envFile) {
    foreach ($ln in [IO.File]::ReadAllLines($envFile)) {
      if ($ln -match '^\s*META_ACCESS_TOKEN\s*=\s*(.+?)\s*$') { $TOKEN = $matches[1].Trim('"').Trim("'") }
    }
  }
}
if ([string]::IsNullOrWhiteSpace($TOKEN)) { throw "META_ACCESS_TOKEN nao definido (env nem .env)." }
# secret colado costuma vir com \n/espaco/aspas no fim -> Meta rejeita (code 190). Limpa.
$TOKEN = $TOKEN.Trim().Trim('"').Trim("'").Trim()

$today = ([DateTime]::UtcNow.AddHours(-3)).ToString("yyyy-MM-dd")   # BRT

# ---------------- HELPERS ----------------
function Get-ActionVal($actions, $type) {
  if (-not $actions) { return 0 }
  foreach ($a in $actions) { if ($a.action_type -eq $type) { return [int][double]$a.value } }
  return 0
}
function ToNum($s) { $o = 0.0; [double]::TryParse(("$s"), [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$o) | Out-Null; return $o }

function JsonStr($items) {
  if (-not $items -or $items.Count -eq 0) { return "[]" }
  $parts = foreach ($it in $items) { $it | ConvertTo-Json -Compress -Depth 6 }
  return "[" + ($parts -join ",") + "]"
}

# ---------------- FETCH (Meta Graph API) ----------------
Write-Host "Buscando insights (nivel ad, por dia) de $START ate $today ..."
$fields = "campaign_name,adset_name,ad_name,impressions,reach,clicks,inline_link_clicks,spend,actions"
$tr = '{"since":"' + $START + '","until":"' + $today + '"}'
$url = "https://graph.facebook.com/$API_VER/$ACCOUNT/insights"
$qs  = "?level=ad&time_increment=1&limit=500&fields=$fields&time_range=$tr&access_token=$TOKEN"
$next = $url + $qs

$rows = New-Object System.Collections.Generic.List[object]
$page = 0
while ($next) {
  $resp = Invoke-RestMethod -Uri $next -Method Get
  if ($resp.data) { foreach ($d in $resp.data) { $rows.Add($d) } }
  $page++
  $next = if ($resp.paging -and $resp.paging.next) { $resp.paging.next } else { $null }
}
Write-Host ("  paginas: {0} | linhas ad-dia: {1}" -f $page, $rows.Count)

# ---------------- AGREGACAO ----------------
$grain = New-Object System.Collections.Generic.List[object]
$dd = @{}   # date -> agregados do funil
foreach ($r in $rows) {
  $day = ("$($r.date_start)").Trim()
  if ($day -notmatch '^\d{4}-\d{2}-\d{2}$') { continue }
  $spend = (ToNum $r.spend) * $TAX
  $impr  = [int](ToNum $r.impressions); $reach = [int](ToNum $r.reach)
  $clk   = [int](ToNum $r.inline_link_clicks)        # cliques no LINK (Leandro: CTR sempre de link)
  $lead  = Get-ActionVal $r.actions $LEAD_TYPE
  $msg   = Get-ActionVal $r.actions $MSG_TYPE
  $grain.Add([ordered]@{
    d=$day; camp=("$($r.campaign_name)").Trim(); adset=("$($r.adset_name)").Trim(); ad=("$($r.ad_name)").Trim();
    spend=[math]::Round($spend,2); impr=$impr; reach=$reach; clk=$clk; lead=$lead; msg=$msg
  })
  if (-not $dd.ContainsKey($day)) { $dd[$day] = @{ spend=0.0; impr=0; reach=0; clk=0; lead=0; msg=0 } }
  $dd[$day].spend += $spend; $dd[$day].impr += $impr; $dd[$day].reach += $reach
  $dd[$day].clk += $clk; $dd[$day].lead += $lead; $dd[$day].msg += $msg
}

$daily = New-Object System.Collections.Generic.List[object]
$allDays = New-Object System.Collections.Generic.SortedSet[string]
foreach ($k in $dd.Keys) { [void]$allDays.Add($k) }
foreach ($day in $allDays) {
  $a = $dd[$day]
  $daily.Add([ordered]@{ d=$day; spend=[math]::Round($a.spend,2); impr=$a.impr; reach=$a.reach;
    clk=$a.clk; lead=$a.lead; msg=$a.msg })
}
$totLead = 0; ($dd.Values | ForEach-Object { $totLead += $_.lead })
$totMsg  = 0; ($dd.Values | ForEach-Object { $totMsg  += $_.msg })
Write-Host ("  dias: {0} | leads: {1} | mensagens: {2}" -f $daily.Count, $totLead, $totMsg)

# ---------------- OUTPUT data.js ----------------
$now = [DateTime]::UtcNow.AddHours(-3)   # BRT
$meta = [ordered]@{ generatedAt = $now.ToString("yyyy-MM-dd HH:mm"); tz="BRT"; tax=$TAX;
  client="Conta Casinha"; account=$ACCOUNT; start=$START }

$js = "window.DASH=" + ($meta | ConvertTo-Json -Compress -Depth 4) + ";" + [Environment]::NewLine
$js += "window.DASH.daily=" + (JsonStr $daily) + ";" + [Environment]::NewLine
$js += "window.DASH.grain=" + (JsonStr $grain) + ";" + [Environment]::NewLine

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($OutFile, $js, $utf8NoBom)
Write-Host ("OK -> {0} ({1:n0} bytes) | dias={2} grain={3}" -f $OutFile, (Get-Item $OutFile).Length, $daily.Count, $grain.Count)
