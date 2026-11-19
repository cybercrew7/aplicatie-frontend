# Ghid pentru echipă

Acest ghid descrie cum lucrăm împreună la frontend: configurarea mediului, organizarea codului, branch-urile și formatul commit-urilor. Citiți-l înainte de primul commit.

---

## 1. Configurarea mediului

### Cerințe

- **Node.js 24+** (verificați cu `node -v`)
- **npm**: proiectul folosește `package-lock.json`, deci nu folosiți `pnpm` sau `yarn`
- **Git**
- **VS Code** (recomandat), cu extensia oficială **Svelte for VS Code**

### Primii pași

```sh
git clone <url-repository>
cd aplicatie-frontend
git checkout develop
npm install
npm run dev            # http://localhost:5173
```

### Variabile de mediu (opțional)

Creați `.env.local` în rădăcina proiectului. Fișierul este ignorat de Git, deci nu se comite.

```sh
VITE_API_BASE_URL=http://localhost:5000/api
```

Fără această variabilă, aplicația folosește `/api`. Dacă backend-ul nu răspunde, trece automat în **modul demo**, așa că puteți lucra la interfață și fără backend.

### Înainte de fiecare push

```sh
npm run check          # trebuie să raporteze 0 erori
npm run build          # trebuie să se termine fără erori
```

---

## 2. Structura directoarelor

| Director | Ce conține | Reguli |
| --- | --- | --- |
| `src/routes/` | Paginile aplicației (rutare pe fișiere) | O pagină = `+page.svelte`. Logica reutilizabilă se mută în `lib/`. |
| `src/lib/components/` | Componente reutilizabile | Nume în PascalCase (`ResourceCard.svelte`). Stilurile se scriu în `<style>` (scoped). |
| `src/lib/api/` | Clientul HTTP și serviciile pe domenii | Nu apelați direct `fetch` din componente. Folosiți `httpClient` prin servicii. |
| `src/lib/stores/` | Starea globală (Svelte stores) | Doar stare partajată între pagini. |
| `src/lib/types/` | DTO-uri TypeScript | Trebuie să corespundă contractului backend-ului ASP.NET Core. |
| `src/lib/utils/` | Funcții pure (formatare, validare) | Fără efecte secundare și fără acces la DOM. |
| `src/lib/mocks/` | Date pentru modul demo | Actualizați datele demo când adăugați câmpuri noi în DTO-uri. |
| `static/` | Fișiere copiate neschimbate în build | Favicon, `robots.txt` etc. |
| `deploy/` | Configurația de producție (Nginx) | Orice modificare se testează cu `nginx -t`. |

**Importuri:** folosiți aliasul `#lib/...` (de exemplu `import { authStore } from '#lib/stores/authStore.ts'`) în loc de căi relative lungi.

---

## 3. Strategia de branch-uri

```
main ─────────●──────────────────●─────────   (producție, stabil)
               \                /
develop ────────●────●────●────●──────────   (integrare)
                 \  /      \  /
feat/...          ●●        ●●                (o funcționalitate per branch)
```

| Branch | Rol | Cine scrie |
| --- | --- | --- |
| `main` | Cod livrat în producție. Fiecare merge este o versiune. | Doar prin Pull Request din `develop` |
| `develop` | Branch de integrare, mereu compilabil | Doar prin Pull Request din `feat/*` / `fix/*` |
| `feat/<descriere>` | Funcționalitate nouă | Autorul funcționalității |
| `fix/<descriere>` | Corectare de bug | Autorul corecturii |

### Flux de lucru

```sh
git checkout develop
git pull
git checkout -b feat/filtru-capacitate

# ... lucru + commit-uri ...

git fetch origin
git rebase origin/develop      # aduceți branch-ul la zi
npm run check && npm run build
git push -u origin feat/filtru-capacitate
```

Apoi deschideți un **Pull Request către `develop`**.

**Reguli:**
- Nu faceți push direct pe `main` sau `develop`.
- Fiecare PR are nevoie de cel puțin **o aprobare** de la un coleg.
- Un PR acoperă o singură funcționalitate. PR-urile mici se revizuiesc mai repede.
- Numele branch-urilor se scriu cu litere mici și cratime: `feat/export-rezervari`, nu `Feat/ExportRezervari`.
- După merge, ștergeți branch-ul.

---

## 4. Conventional Commits

Toate mesajele de commit urmează specificația [Conventional Commits](https://www.conventionalcommits.org/):

```
<tip>(<scope>): <descriere scurtă la imperativ>

[corp opțional: ce și de ce]

[footer opțional: BREAKING CHANGE, referințe la issue-uri]
```

### Tipuri permise

| Tip | Când se folosește |
| --- | --- |
| `feat` | Funcționalitate nouă |
| `fix` | Corectare de bug |
| `refactor` | Restructurare de cod fără schimbare de comportament |
| `style` | Stiluri / CSS, formatare vizuală |
| `docs` | Doar documentație |
| `chore` | Dependențe, configurări, unelte |
| `build` | Sistemul de build sau deploy (Vite, adapter, Nginx) |
| `test` | Teste |
| `perf` | Îmbunătățiri de performanță |

### Scope-uri uzuale

`layout`, `api`, `auth`, `resources`, `reservations`, `admin`, `theme`, `deploy`

### Exemple corecte

```
feat(reservations): add reservations page and booking modal with conflict detection
fix(api): handle 401 responses by clearing the stored JWT
style(theme): configure heritage color tokens and editorial typography
build(deploy): switch to adapter-static and add Nginx config
docs: add team workflow guide
```

### Reguli

- Descrierea începe cu literă mică și **nu** se termină cu punct.
- Folosiți imperativul: „add”, „fix”, „update”, nu „added” sau „fixes”.
- Prima linie are cel mult **72 de caractere**.
- Limba commit-urilor este **engleza**, pentru consecvență cu istoricul existent.
- O modificare incompatibilă se marchează cu `!` (`feat(api)!: ...`) și cu `BREAKING CHANGE:` în footer.
