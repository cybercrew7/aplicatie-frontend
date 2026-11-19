# Aplicație Frontend — Rezervare Resurse Universitare

Interfața web pentru sistemul de rezervare a resurselor universitare (săli, amfiteatre, laboratoare și echipamente). Aplicația permite studenților și profesorilor să consulte catalogul de resurse, să verifice disponibilitatea și să facă rezervări. Administratorii pot gestiona resursele și utilizatorii.

Frontend-ul comunică cu un backend **ASP.NET Core** prin API REST (`/api/...`) și este livrat în producție ca **aplicație statică (SPA)** servită de **Nginx**.

---

## Funcționalități

| Pagină | Rută | Descriere |
| --- | --- | --- |
| Prezentare generală | `/` | Panou de start cu sumarul resurselor și al rezervărilor |
| Resurse | `/resources` | Catalog de săli și echipamente, cu filtre și program de ocupare |
| Rezervări | `/reservations` | Rezervările utilizatorului și formular de rezervare cu detectarea conflictelor |
| Administrare | `/admin` | CRUD pentru resurse și utilizatori (doar rolul `Admin`) |

**Modul demo:** dacă backend-ul nu răspunde, aplicația trece automat în modul demo și folosește o bază de date în memorie ([src/lib/mocks/demoDb.ts](src/lib/mocks/demoDb.ts)). Interfața rămâne complet funcțională pentru prezentări și dezvoltare fără backend.

---

## Decizii de arhitectură

| Tehnologie | Motivație |
| --- | --- |
| **Svelte 5 + SvelteKit** | Componente compilate, fără runtime virtual DOM, deci bundle mic și performanță bună. Proiectul folosește *runes* (`$state`, `$derived`, `$effect`). Rutarea se face pe baza fișierelor din `src/routes/`. |
| **Vite** | Server de dezvoltare rapid cu HMR și build de producție optimizat. Configurația SvelteKit stă în [vite.config.ts](vite.config.ts). |
| **TypeScript** | Tipuri stricte pentru DTO-urile schimbate cu backend-ul ([src/lib/types/](src/lib/types/)), așa că erorile de contract apar la compilare, nu în producție. |
| **Svelte Stores** | Starea globală (utilizator autentificat, token JWT, mod de conexiune `api` / `demo`) este centralizată în [authStore.ts](src/lib/stores/authStore.ts) și persistată în `localStorage`. |
| **Fetch API + JWT** | Un singur client HTTP ([httpClient.ts](src/lib/api/httpClient.ts)) atașează antetul `Authorization: Bearer <token>`, aplică un timeout de 10 secunde și transformă răspunsurile de eroare (inclusiv `ProblemDetails` din ASP.NET) în mesaje clare în limba română. Serviciile pe domenii (`resourceService`, `reservationService`, `userService`) folosesc acest client. |
| **CSS scoped + design tokens** | Fiecare componentă își definește stilurile în blocul `<style>`, care este izolat automat de Svelte. Culorile și tipografia sunt definite o singură dată ca variabile CSS (prin `@theme` din Tailwind, în [app.css](src/app.css)). |
| **Build static + Nginx** | `@sveltejs/adapter-static` generează în `build/` doar fișiere statice, fără server Node în producție. Nginx servește fișierele, folosește `index.html` ca fallback pentru rutele SPA și redirecționează `/api/` către backend. Frontend-ul și API-ul sunt servite de pe aceeași origine, deci nu este nevoie de configurare CORS. |

### Structura proiectului

```
src/
├── app.css                 # design tokens + stiluri globale
├── app.html                # șablonul HTML
├── lib/
│   ├── api/                # client HTTP + servicii pe domenii
│   ├── components/         # componente reutilizabile (Navbar, modale, carduri)
│   ├── mocks/              # baza de date demo (fallback offline)
│   ├── stores/             # Svelte stores (autentificare, mod conexiune)
│   ├── types/              # DTO-uri TypeScript
│   └── utils/              # funcții ajutătoare (formatare, validare)
└── routes/                 # paginile aplicației (rutare pe fișiere)
    ├── +layout.ts          # ssr = false (mod SPA)
    ├── +layout.svelte      # shell-ul aplicației (navigare)
    ├── resources/
    ├── reservations/
    └── admin/
deploy/
└── nginx.conf              # configurația Nginx de producție
```

---

## Rulare locală

**Cerințe:** Node.js 24+ și npm.

```sh
npm install          # instalează dependențele
npm run dev          # server de dezvoltare pe http://localhost:5173
```

În dezvoltare, cererile merg implicit la `/api`. Pentru a folosi un backend local, creați un fișier `.env.local`:

```sh
VITE_API_BASE_URL=http://localhost:5000/api
```

> Dacă backend-ul nu este pornit, aplicația intră automat în modul demo.
> Când backend-ul rulează pe altă origine, acesta trebuie să permită CORS pentru `http://localhost:5173`.

### Comenzi utile

| Comandă | Efect |
| --- | --- |
| `npm run dev` | Server de dezvoltare cu HMR |
| `npm run check` | Verificare TypeScript și Svelte (`svelte-check`) |
| `npm run build` | Build de producție static în directorul `build/` |
| `npm run preview` | Previzualizare locală a build-ului de producție |

---

## Deploy în producție

1. Generați build-ul static:
   ```sh
   npm ci
   npm run build
   ```
2. Copiați conținutul directorului `build/` pe server:
   ```sh
   rsync -av --delete build/ user@server:/var/www/aplicatie-frontend/
   ```
3. Instalați configurația Nginx ([deploy/nginx.conf](deploy/nginx.conf)):
   ```sh
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/aplicatie-frontend
   sudo ln -s /etc/nginx/sites-available/aplicatie-frontend /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. Backend-ul ASP.NET Core trebuie să asculte pe `http://localhost:5000`. Nginx redirecționează `/api/*` către el.

---

## Echipă și contribuții

Fluxul de lucru (configurarea mediului, strategia de branch-uri, convențiile de commit) este descris în [TEAM_GUIDE.md](TEAM_GUIDE.md).
