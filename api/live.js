// Vercel Serverless Function — /api/live
// Trae TODO el historial mensual desde MyFxBook API automáticamente.
// Las credenciales viven en variables de entorno de Vercel, nunca en el frontend.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const email     = process.env.MYFXBOOK_EMAIL;
  const password  = process.env.MYFXBOOK_PASSWORD;
  const accountId = process.env.MYFXBOOK_ACCOUNT_ID;

  if (!email || !password || !accountId) {
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

    // 2. Traer datos diarios históricos completos + info de cuenta en paralelo
    const startDate = '2023-08-01';
    const endDate   = new Date().toISOString().split('T')[0];

    const [accountsRes, dailyRes] = await Promise.all([
      fetch(`https://www.myfxbook.com/api/get-my-accounts.json?session=${session}`),
      fetch(`https://www.myfxbook.com/api/get-data-daily.json?session=${session}&id=${accountId}&start=${startDate}&end=${endDate}`)
    ]);

    const accountsData = await accountsRes.json();
    const dailyData    = await dailyRes.json();

    // 3. Logout
    fetch(`https://www.myfxbook.com/api/logout.json?session=${session}`).catch(() => {});

    // 4. Info general de la cuenta
    const account = accountsData.accounts?.find(a => String(a.id) === String(accountId))
                 || accountsData.accounts?.[0];

    if (!account) {
      return res.status(404).json({ error: true, message: 'Cuenta no encontrada' });
    }

    // 5. Calcular ganancia mensual desde datos diarios
    // Formato fecha de MyFxBook: "MM/DD/YYYY"
    const monthlyMap = {};

    if (!dailyData.error && dailyData.dataDaily?.length) {
      dailyData.dataDaily.forEach(d => {
        const parts   = d.date.split('/');
        const month   = parts[0].padStart(2, '0');
        const year    = parts[2];
        const key     = `${year}-${month}`;
        const balance = parseFloat(d.balance);
        const profit  = parseFloat(d.profit);

        if (!monthlyMap[key]) {
          // Primer dia del mes: balance de apertura = balance actual - profit del dia
          monthlyMap[key] = { firstBalance: balance - profit, lastBalance: balance };
        } else {
          monthlyMap[key].lastBalance = balance;
        }
      });
    }

    // 6. Construir estructura años/meses
    const yearsMap = {};
    Object.entries(monthlyMap).forEach(([key, { firstBalance, lastBalance }]) => {
      const [yearStr, monthStr] = key.split('-');
      const year  = parseInt(yearStr);
      const month = parseInt(monthStr) - 1; // 0-indexed
      const gain  = firstBalance > 0
        ? parseFloat(((lastBalance - firstBalance) / firstBalance * 100).toFixed(2))
        : null;

      if (!yearsMap[year]) yearsMap[year] = new Array(12).fill(null);
      yearsMap[year][month] = gain;
    });

    // Total por año (compuesto)
    const years = Object.entries(yearsMap)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([year, months]) => {
        let cum = 1;
        months.forEach(v => { if (v !== null) cum *= (1 + v / 100); });
        const total = parseFloat(((cum - 1) * 100).toFixed(2));
        return { year: parseInt(year), months, total };
      });

    // 7. Total acumulado general
    let cumTotal = 1;
    years.forEach(row => {
      row.months.forEach(v => { if (v !== null) cumTotal *= (1 + v / 100); });
    });
    const totalGain = parseFloat(((cumTotal - 1) * 100).toFixed(2));

    return res.status(200).json({
      error: false,
      strategy: {
        name:        'One Percent',
        provider_id: '66155625',
        broker:      'HF Markets',
        currency:    account.currency || 'USD',
        updated:     endDate,
      },
      stats: {
        max_drawdown_pct: account.drawdown ? -parseFloat(parseFloat(account.drawdown).toFixed(2)) : null,
        profit_factor:    account.profitFactor ? parseFloat(parseFloat(account.profitFactor).toFixed(2)) : null,
        balance:          parseFloat(parseFloat(account.balance).toFixed(2)),
        last_update:      account.lastUpdateDate,
      },
      years,
      total: totalGain,
    });

  } catch (err) {
    return res.status(500).json({ error: true, message: err.message });
  }
}
