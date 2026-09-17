# Sportclub MS XLI

Installierbare Web-App (PWA) für private Kraftsportgruppen.

## Stack

- Next.js / React
- Supabase Auth + Postgres
- Vercel

## Aktueller Stand

- Registrierung / Login
- Gruppe erstellen oder per Einladungscode beitreten
- vordefinierte Übungsbibliothek aus Supabase
- mobile Pastell-Oberfläche
- Trainingserfassung unter `/training`
- einzelne Sätze werden in Supabase gespeichert
- Home-Workouts werden als Gruppenaktivität vorbereitet
- PWA-Manifest für Installation auf dem iPhone

## Lokal starten

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Umgebungsvariablen

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Dieselben beiden Variablen müssen später in Vercel für Production und Preview hinterlegt werden.

## Vercel

Das Repository kann direkt als Next.js-Projekt in Vercel importiert werden. Ein eigener Team-Workspace ist nicht erforderlich; ein persönlicher Vercel-Scope reicht aus.

## Produktprinzip

**Trainieren. Eintragen. Fortschritt sehen. Gemeinsam stärker.**
