# Lokální sestavení Jellyfin Web

V kořeni tohoto repozitáře spusťte v Bash nebo Git Bash:

```sh
bash ./build.sh
```

Skript běží na popředí a skončí po sestavení a zabalení. Vyžaduje Git, Bash,
tar a verze Node.js/npm uvedené v `package.json` (aktuálně Node.js 24+ a npm 11+).
Na Windows použijte Git Bash. Node 22 je odmítnut ještě před načtením TypeScript helperu.
Žádný další globální balíček ani samostatný TypeScript runner není potřeba.

Výchozí běh provede `npm ci --no-audit`, TypeScript kontrolu aplikace i build
toolingu, ESLint, stylelint, všechny testy Vitest, produkční webpack sestavení
a kontrolu ES5 výstupu. Chyba kteréhokoli kroku ukončí build s nenulovým kódem;
celý výstup kroku zůstane v jeho logu.

## Adresáře

| Cesta | Obsah |
| --- | --- |
| `_output/jellyfin-web/` | Zkompilované statické soubory webu |
| `_output/types/` | Výstup případného přímého emitujícího `tsc`; běžná kontrola nic neemituje |
| `_artifacts/jellyfin-web/` | Hotový webový adresář pro distribuci |
| `_artifacts/jellyfin-web-<verze>-<hash>[-dirty].tar.gz` | Archiv s jediným kořenem `jellyfin-web/` |
| `_artifacts/*.tar.gz.sha256` | SHA256 archivu, s basename archivu v kontrolním řádku |
| `_temp/logs/` | Logy posledního běhu jednotlivých kroků |
| `_temp/` | npm, webpack, Babel a Vite cache |
| `_tests/` | Vitest JSON/JUnit, přehled kroků a případné coverage reporty |

`index.html` je přímo v `jellyfin-web/`, nikoli v další vnořené složce.
Archiv i adresář obsahují `LICENSE` a `build-info.json`. Opakovaný build stejné
verze, commitu a dirty stavu nahradí příslušný archiv a adresář.

`build-info.json` uvádí verzi webového balíčku a zobrazenou verzi sestavení,
Git větev, celý hash a skutečný příznak `dirty`, runtime, SHA256 lockfile,
provedené/vynechané kontroly a skutečné počty testů z Vitest JSON reportu.
Necommitované změny jsou povoleny; samotný hash commitu je proto neidentifikuje
jako čistý obsah HEAD. Build nepřepisuje verze zdrojových souborů.

## Opakovaný build a runtime

```sh
bash ./build.sh --skip-install
bash ./build.sh --skip-install --skip-checks
bash ./build.sh --help
```

Vynechané kroky se výslovně zapíší do reportu i manifestu; starý testovací report
se nevydává za novou kontrolu. Produkční sestavení a kontrola struktury balíčku
se provedou vždy. `--skip-install` vyžaduje již připravené `node_modules`.

Pokud Node.js není na PATH ve správné verzi, lze použít vybraný runtime:

```sh
NODE_BIN='/c/tools/node/node.exe' \
NPM_CLI='/c/tools/npm/bin/npm-cli.js' \
bash ./build.sh
```

`NODE_BIN` je cesta k Node.js a `NPM_CLI` cesta přímo k `npm-cli.js`, nikoli
k `npm.cmd`. Na Windows Git Bash převede `NPM_CLI` na nativní cestu.
Bez override se npm hledá u zvoleného Node.js a na PATH. Všechny npm příkazy
se spouštějí přes zvolený Node.js a jeho adresář je první na PATH podprocesů.

`JELLYFIN_VERSION='vlastni-verze' bash ./build.sh` nastaví verzi zobrazovanou
ve webu. Bez override obsahuje výchozí označení verzi balíčku, hash a případné
`dirty`; archiv má vždy také hash a případné `-dirty` v názvu.

## Přímé npm příkazy

`npm run build:production` i `npm run build:development` nyní zapisují do
`_output/jellyfin-web/`. Produkční konfigurace nastaví `NODE_ENV=production`
před načtením společné konfigurace; kontrola balíčku navíc ověří samostatný
CSS soubor připojený v `index.html` a všechny zdrojové motivy.
Přímé npm buildy nevytvářejí distribuční archiv ani build manifest.
Cache a testovací reporty také používají výše uvedené adresáře.

Build před čištěním ověří skutečné cesty a odmítne symlink/junction v cestě
k výstupům. Staré adresáře `dist/` z předchozích verzí se automaticky nemažou.

Skript nic nenasazuje a nespouští vývojový server ani watcher. Postup pro
společné nasazení se serverem v sousedním checkoutu je v
[README.deploy.md](../jellyfin/README.deploy.md).
