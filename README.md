# One Percent — Resultados
**URL final:** `resultados.onepercent.com.ar`

---

## 🚀 DEPLOY PASO A PASO

### PASO 1 — Subir código a GitHub

Abrí Git Bash o PowerShell en la carpeta donde bajaste estos archivos y ejecutá:

```bash
git clone https://github.com/onepercentgsgr/onepercent-results.git
cd onepercent-results
```

Copiá todos estos archivos dentro de la carpeta `onepercent-results`:
- `index.html`
- `data.json`
- `vercel.json`
- `api/live.js` (crear carpeta `api` adentro)

Luego:
```bash
git add .
git commit -m "Deploy inicial"
git push origin main
```

---

### PASO 2 — Crear proyecto en Vercel

1. Ir a **[vercel.com](https://vercel.com)** → Sign up con GitHub
2. **New Project** → importar `onepercentgsgr/onepercent-results`
3. Framework Preset: **Other**
4. Abrir **Environment Variables** y agregar estas 3:

```
MYFXBOOK_EMAIL       →  onepercent.gsgr@gmail.com
MYFXBOOK_PASSWORD    →  Elnumero01!
MYFXBOOK_ACCOUNT_ID  →  11984032
```

5. Click **Deploy** ✅

Vercel te va a dar:
- Una URL de prueba tipo `onepercent-results.vercel.app`
- Un **CNAME record** para conectar el dominio (lo necesitás para el paso 3)

---

### PASO 3 — Conectar dominio en Vercel

1. En Vercel → tu proyecto → **Settings** → **Domains**
2. Agregar: `resultados.onepercent.com.ar`
3. Vercel te muestra el CNAME a agregar (algo como `cname.vercel-dns.com`)

---

### PASO 4 — DNS en Donweb

1. Entrar al panel de Donweb → Dominio `onepercent.com.ar` → **DNS**
2. Agregar registro:
   - **Tipo:** CNAME
   - **Nombre:** `resultados`
   - **Valor:** el CNAME que te dio Vercel
3. Guardar → esperar 5-10 minutos

**✅ El sitio queda live en `resultados.onepercent.com.ar`**

---

## 📅 ACTUALIZAR RESULTADOS (cada fin de mes)

1. Ir al repo en GitHub → archivo `data.json` → ícono del lápiz ✏️
2. En el año correspondiente, reemplazar el `null` del mes cerrado con el porcentaje
3. Actualizar el `total` del año
4. Actualizar la fecha `"updated"`
5. **Commit changes** → el sitio se actualiza solo en 30 segundos ✅

### Ejemplo — cerrar Abril 2026:
```json
{
  "year": 2026,
  "months": [1.02, 0.65, 20.89, 5.10, null, null, null, null, null, null, null, null],
  "total": 28.02
}
```

---

## 📁 Estructura

```
onepercent-results/
├── index.html        ← Sitio público (no tocar)
├── data.json         ← Historial mensual (editar fin de mes)
├── vercel.json       ← Config Vercel
├── api/
│   └── live.js       ← Conecta con MyFxBook automáticamente
└── README.md
```

## 🔄 Cómo fluyen los datos

```
Visitante → resultados.onepercent.com.ar
  ├── data.json   → historial 2023 a hoy (manual)
  └── /api/live   → MyFxBook API → drawdown en tiempo real (automático)
```
