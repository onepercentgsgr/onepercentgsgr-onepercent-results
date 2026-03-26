export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const email    = process.env.MYFXBOOK_EMAIL;
  const password = process.env.MYFXBOOK_PASSWORD;

  if (!email || !password) {
    return res.status(500).json({ error: true, message: 'Variables de entorno no configuradas' });
  }

  try {
    // 1. Login
    const loginRes  = await fetch(`https://www.myfxbook.com/api/login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`);
    const loginData = await loginRes.json();
    if (loginData.error) {
      return res.status(401).json({ error: true, message: 'Login fallido: ' + loginData.message });
    }
    const session = loginData.session;

    // 2. Obtener cuentas para el ID interno
    const accountsRes  = await fetch(`https://www.myfxbook.com/api/get-my-accounts.json?session=${session}`);
    const accountsData = await accountsRes.json();

    if (accountsData.error || !accountsData.accounts?.length) {
      fetch(`https://www.myfxbook.com/api/logout.json?session=${session}`).catch(() => {});
      return res.status(404).json({ error: true, message: 'Sin cuentas: ' + JSON.stringify(accountsData) });
    }

    const account    = accountsData.accounts.find(a =>
      a.name?.toLowerCase().includes('percent') ||
      a.name?.toLowerCase().includes('one')
    ) || accountsData.accounts[0];
    const internalId = account.id;

    // 3. Calcular gain mensual usando get-gain (endpoint liviano)
    // Meses desde Ago 2023 hasta hoy
    const now       = new Date();
    const startYear = 2023;
    const startMon  = 7; // agosto = índice 7 (0-based)
    const months    = [];

    for (let y = startYear; y <= now.getFullYear(); y++) {
      const mStart = (y === startYear) ? startMon : 0;
      const mEnd   = (y === now.getFullYear()) ? now.getMonth() : 11;
      for (let m = mStart; m <= mEnd; m++) {
        months.push({ year: y, month: m });
      }
    }

    // Llamadas paralelas a get-gain (máx 10 a la vez para no saturar)
    const CHUNK = 10;
    const gains  = [];
    for (let i = 0; i < months.length; i += CHUNK) {
      const chunk   = months.slice(i, i + CHUNK);
      const results = await Promise.all(chunk.map(({ year, month }) => {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay  = new Date(year, month + 1, 0);
        const endDay   = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
        return fetch(`https://www.myfxbook.com/api/get-gain.json?session=${session}&id=${internalId}&start=${firstDay}&end=${endDay}`)
          .then(r => r.json())
          .then(d => ({ year, month, gain: d.error ? null : parseFloat(parseFloat(d.value).toFixed(2)) }))
          .catch(() => ({ year, month, gain: null }));
      }));
      gains.push(...results);
    }

    // 4. Logout
    fetch(`https://www.myfxbook.com/api/logout.json?session=${session}`).catch(() => {});

    // 5. Construir estructura años
    const yearsMap = {};
    gains.forEach(({ year, month, gain }) => {
      if (!yearsMap[year]) yearsMap[year] = new Array(12).fill(null);
      yearsMap[year][month] = gain;
    });

    const years = Object.entries(yearsMap)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([year, months]) => {
        let cum = 1;
        months.forEach(v => { if (v !== null) cum *= (1 + v / 100); });
        return { year: parseInt(year), months, total: parseFloat(((cum - 1) * 100).toFixed(2)) };
      });

    let cumTotal = 1;
    years.forEach(row => row.months.forEach(v => { if (v !== null) cumTotal *= (1 + v / 100); }));

    return res.status(200).json({
      error: false,
      strategy: {
        name:        'One Percent',
        provider_id: '66155625',
        broker:      'HF Markets',
        currency:    account.currency || 'USD',
        updated:     now.toISOString().split('T')[0],
      },
      stats: {
        max_drawdown_pct: account.drawdown ? -parseFloat(parseFloat(account.drawdown).toFixed(2)) : null,
        profit_factor:    account.profitFactor ? parseFloat(parseFloat(account.profitFactor).toFixed(2)) : null,
        balance:          parseFloat(parseFloat(account.balance || 0).toFixed(2)),
        last_update:      account.lastUpdateDate || now.toISOString().split('T')[0],
      },
      years,
      total: parseFloat(((cumTotal - 1) * 100).toFixed(2)),
    });

  } catch (err) {
    return res.status(500).json({ error: true, message: err.message });
  }
}
