# Custom robotframework-browser-recorder met Vaadin Tree Table Support

Dit programma bevat een aangepaste versie van robotframework-browser-recorder die de verbeterde selector generator voor Vaadin tree tables gebruikt.

## Setup

Er zijn twee manieren om dit in te stellen:

### Optie 1: Gebruik bestaande setup (snel)

De custom Playwright build met Vaadin selector enhancements is al geïnstalleerd in `.venv-recorder`.

### Optie 2: Zelf aanmaken in je omgeving (overdraagbaar)

Dit is handiger als je deze setup ook op ander machines of in je CI/CD pipeline wilt gebruiken. De `.venv` directory is niet draagbaar (absolute paden), dus het is beter om deze zelf aan te maken.

### Quick Start

**Optie 1: Via PowerShell wrapper (bevat aanbevolen)**
```powershell
.\rfbrowser-record-custom.ps1 --url "https://your-app.com"
```

**Optie 2: Handmatig venv activeren**
```powershell
.\.venv-recorder\Scripts\Activate.ps1
rfbrowser-record --url "https://your-app.com"
```

## Setup voor testers / in eigen omgeving

### Snelste methode: Gebruik het setup script

Er is een PowerShell script dat alles automatisch doet:

```powershell
cd /path/to/playwright-fork
.\setup-recorder.ps1
```

Dit zal:
1. ✅ `npm run build` uitvoeren (tenzij je `-SkipBuild` geeft)
2. ✅ Python venv aanmaken
3. ✅ `robotframework-browser-recorder` installeren
4. ✅ Custom Vaadin selector scripts patchen
5. ✅ Alles verifyëren

Dan klaar om te gebruiken:
```powershell
.\.venv-recorder\Scripts\Activate.ps1
rfbrowser-record --url "http://your-vaadin-app:8080"
```

### Handmatig opzetten (stap-voor-stap)

**Stap 1:** Zorg dat je in de playwright monorepo directory bent
```powershell
cd /path/to/playwright-fork  # bijv. C:\Users\yourname\source\repos\playwright
```

**Stap 2:** Bouw de monorepo met je custom selector generator
```powershell
npm run build
```

Dit genereert de custom `packages/playwright-core/lib/generated/injectedScriptSource.js` met jouw Vaadin selector enhancements.

**Stap 3:** Maak een fresh Python venv aan
```powershell
python -m venv .venv-recorder-custom
```

**Stap 4:** Installeer robotframework-browser-recorder
```powershell
.\.venv-recorder-custom\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
.\.venv-recorder-custom\Scripts\pip.exe install robotframework-browser-recorder
```

**Stap 5:** Patch de Playwright injected scripts (BELANGRIJK!)
```powershell
Copy-Item -Path "packages\playwright-core\lib\generated\injectedScriptSource.js" `
  -Destination ".venv-recorder-custom\Lib\site-packages\playwright\driver\package\lib\generated\injectedScriptSource.js" `
  -Force
```

**Stap 6:** Verifyeer
```powershell
.\.venv-recorder-custom\Scripts\Activate.ps1
rfbrowser-record --help
# Zou help text moeten tonen
```

**Stap 7:** Gebruik de recorder
```powershell
.\.venv-recorder-custom\Scripts\Activate.ps1
rfbrowser-record --url "http://your-vaadin-app:8080"
```

## CI/CD Integratie

Voor geautomatiseerde setup van recorder in CI/CD pipelines, gebruik het `setup-recorder.ps1` script:

```yaml
# GitHub Actions voorbeeld
- name: Setup custom recorder
  run: .\setup-recorder.ps1 -SkipBuild
  # of met full build:
  # run: .\setup-recorder.ps1

- name: Run recording
  run: |
    .\.venv-recorder\Scripts\Activate.ps1
    rfbrowser-record --url ${{ env.APP_URL }} --output tests.robot
```

Met environment variabelen:

```powershell
# Andere venv naam
.\setup-recorder.ps1 -VenvName .venv-ci

# Skip build (handig in CI/CD als je al gebuild hebt)
.\setup-recorder.ps1 -SkipBuild
```

## Automation voor eigen scripts

Maak je eigen wrapper:

```powershell
#!/usr/bin/env pwsh
# my-recorder.ps1

param([string]$Url)

# Setup if needed
if (-not (Test-Path ".venv-recorder")) {
    Write-Host "Setting up recorder..."
    .\setup-recorder.ps1
}

# Use recorder
.\.venv-recorder\Scripts\Activate.ps1
rfbrowser-record --url $Url --output recorded_test.robot
```

## Wat is er aangepast?

De standaard `robotframework-browser-recorder` gebruikt Playwright 1.58.0 van PyPI. De custom setup gebruikt **Playwright 1.60.0-next** met verbeteringen voor Vaadin applications:

### Vaadin Tree Table Selector Enhancements

**Probleem (voorheen):**
```
tr:nth-child(6) > td > .v-table-cell-wrapper > .v-treetable-treespacer
```
❌ Fragiel, broekbaar wanneer DOM volgorde verandert

**Oplossing (nu):**
```
tr:has-text("Andere sensorische functies") >> span.v-treetable-treespacer
```
✅ Robust, semantisch, gebaseerd op zichtbare tekst

### Features

1. **Row-context aware selectors** - Elementen in tree tables worden automatisch gekoppeld aan hun row context (ID of tekst)
2. **Fuzzy text matching** - Tolerant voor whitespace en kleine veranderingen
3. **Meaningful class selectors** - Herkent specifieke v-* classes (itje, gerelateerd-icon) in plaats van generieke fallbacks
4. **Multi-button row handling** - Meerdere buttons in dezelfde row krijgen elk correct row context

## Referenties

### setup-recorder.ps1 script

Dit script automatiseert alle setup stappen. Je kunt het aanroepen met:

```powershell
.\setup-recorder.ps1              # Defaults: build + .venv-recorder
.\setup-recorder.ps1 -SkipBuild   # Voeg build over, just venv setup
.\setup-recorder.ps1 -VenvName my_venv  # Andere map
```

Het script beschikt over:
- Volledige error handling
- Progressieve output (wat gebeurt er nu)
- Automatische verificatie (sizes matching)
- Cross-platform (PowerShell Core op Windows/Mac/Linux)

## Technische Details

### Hoe het werkt

1. De monorepo (`packages/injected/src/selectorGenerator.ts`) bevat de custom selector logic
2. Met `npm run build` worden deze bronnen gecompileerd en verpakt in `packages/playwright-core/lib/generated/injectedScriptSource.js`
3. Het custom `.venv-recorder` doet dezelfde functionaliteit met vervanging:
   - Standaard Playwright Python 1.58.0 is geïnstalleerd
   - Maar de injected scripts zijn vervangen met onze custom build
   - Wanneer je `rfbrowser-record` gebruikt, laadt het deze injectie met Vaadin enhancements

### Bestanden

```
.
├── .venv-recorder/                # Python venv met custom Playwright
├── rfbrowser-record-custom.ps1    # PowerShell wrapper (optional)
├── setup-recorder.ps1              # Setup automation script
├── packages/
│   └── injected/
│       └── src/
│           └── selectorGenerator.ts   # Custom selector logic
└── README-RECORDER.md             # Dit bestand
```

| Bestand | Doel | Nodig |
|---------|------|-------|
| `setup-recorder.ps1` | Automatische setup voor testers | ✅ Aanbevolen |
| `rfbrowser-record-custom.ps1` | Wrapper script (convenience) | Optioneel |
| `.venv-recorder/` | Pre-made environment | ✅ Voor quick start |
| `packages/playwright-core/lib/generated/injectedScriptSource.js` | Gebuild custom script (na npm run build) | ✅ Voor patching |

## Voorbeelden

### Recording op Vaadin tree table app
```powershell
.\rfbrowser-record-custom.ps1 --url "http://yourapp:8080" --output vaadintest.robot
```

Vervolgens:
1. Zal de recorder Chromium openen
2. Klik op elementen in je tree table
3. De gegenereerde selectors zullen rij-context bevatten
4. Output wordt opgeslagen in `vaadintest.robot`

### Specifieke browser
```powershell
.\.venv-recorder\Scripts\Activate.ps1
rfbrowser-record --url "http://yourapp:8080" --browser firefox
```

## Debugging

### Test of custom selectors worden gebruikt
1. Open DevTools in de recorder browser
2. Klik op elementen in de tree table
3. Controleer de console/output op selectors met row context (moet `has-text` of ID bevatten)

### Controleer welke Playwright versie wordt gebruikt
```powershell
.\.venv-recorder\Scripts\Activate.ps1
python -c "import playwright; print(playwright.__version__)"
```

Moet tonen: `1.58.0` (dit is ok - de Python wrapper is standaard, maar de injected scripts zijn custom)

### Verifyeer de custom injected script
```powershell
ls .venv-recorder\Lib\site-packages\playwright\driver\package\lib\generated\injectedScriptSource.js -l
```

Moet 308798 bytes groot zijn (als het groter/kleiner is, is er iets fout gegaan)

## Troubleshooting

**Q: rfbrowser-record command not found**
```powershell
# Zorg dat je in dit directory bent en zet aan met
.\.venv-recorder\Scripts\Activate.ps1
```

**Q: Selectors bevatten nog steeds nth-child**

Dit betekent waarschijnlijk dat de patch niet correct toegepast is. Controleer:

```powershell
# Controleer file sizes
$original = (Get-Item "packages\playwright-core\lib\generated\injectedScriptSource.js").Length
$venv = (Get-Item ".venv-recorder\Lib\site-packages\playwright\driver\package\lib\generated\injectedScriptSource.js").Length
Write-Host "Original: $original bytes`nVenv: $venv bytes"
if ($original -eq $venv) { Write-Host "✓ Sizes match" } else { Write-Host "✗ Sizes DIFFER - need to re-patch" }

# Herlaad de patch als sizes verschillen
npm run build
Copy-Item -Path "packages\playwright-core\lib\generated\injectedScriptSource.js" `
  -Destination ".venv-recorder\Lib\site-packages\playwright\driver\package\lib\generated\injectedScriptSource.js" `
  -Force
```

**Q: "npm run build failed"**

Zorg dat je alle dependencies hebt:
```powershell
npm ci --legacy-peer-deps
npm run build
```

**Q: Welke wijzigingen zijn er in de selector generator?**

Zie `packages/injected/src/selectorGenerator.ts` for de aanpassingen. Key functions:
- `isElementInTableRow()` - Detecteert elementen in table rows
- `extractRowIdentifier()` - Genereert row IDs/tekst met fuzzy matching
- `buildTableRowContextCandidates()` - Bouwt selectors met row context
- `buildSimpleSelector()` - Herkent meaningful v-* classes

## Bijwerken van de selector generator (development workflow)

Als je de selector generator code wijzigt in `packages/injected/src/selectorGenerator.ts` en snel wilt testen:

```powershell
# 1. Build alleen de veranderde code
npm run build

# 2. Patch je bestaande venv
Copy-Item -Path "packages\playwright-core\lib\generated\injectedScriptSource.js" `
  -Destination ".venv-recorder\Lib\site-packages\playwright\driver\package\lib\generated\injectedScriptSource.js" `
  -Force

# 3. Test meteen
.\.venv-recorder\Scripts\Activate.ps1
rfbrowser-record --url "http://your-test-app:8080"
```

**Snelle verificatie na patch:**
```powershell
$src = (Get-Item "packages\playwright-core\lib\generated\injectedScriptSource.js").Length
$dst = (Get-Item ".venv-recorder\Lib\site-packages\playwright\driver\package\lib\generated\injectedScriptSource.js").Length
if ($src -eq $dst) { "✓ Patched OK" } else { "✗ Size mismatch - check if build succeeded" }
```

## Volgende stappen

1. **Test recording op je Vaadin app**
   ```powershell
   .\rfbrowser-record-custom.ps1 --url "http://your-vaadin-app"
   ```

2. **Vergelijk gegenereerde selectors** met eerdereopnames (moeten hebben row context)

3. **Integreer in je test workflow** - Gebruik de gegenereerde `.robot` bestanden met `robot` command

## Contact

Voor issues met selectors: Check de commit history in feat/vaadin-treetable-codegen branch of run tests:
```powershell
npm run ctest tests\library\selector-generator.spec.ts -- --grep "vaadin"
```
