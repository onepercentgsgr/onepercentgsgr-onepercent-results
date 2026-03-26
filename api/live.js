export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const email     = process.env.MYFXBOOK_EMAIL;
  const password  = process.env.MYFXBOOK_PASSWORD;

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

    // 2. Traer cuentas para obtener el ID interno real
    const accountsRes  = await fetch(`https://www.myfxbook.com/api/get-my-accounts.json?session=${session}`);
    const accountsData = await accountsRes.json();

    if (accountsData.error || !accountsData.accounts?.length) {
      fetch(`https://www.myfxbook.com/api/logout.json?session=${session}`).catch(() => {});
      return res.status(404).json({ error: true, message: 'No se encontraron cuentas. Detalle: ' + JSON.stringify(accountsData) });
    }

    // Usar la primera cuenta disponible (o buscar por nombre)
    const account = accountsData.accounts.find(a =>
      a.name?.toLowerCase().includes('percent') ||
      a.name?.toLowerCase().includes('one')
    ) || accountsData.accounts[0];

    const internalId = account.id;

    // 3. Traer datos diarios con el ID interno correcto
    const startDate = '2023-08-01';
    const endDate   = new Date().toISOString().split('T')[0];
    const dailyRes  = await fetch(`https://www.myfxbook.com/api/get-data-daily.json?session=${session}&id=${internalId}&start=${startDate}&end=${endDate}`);
    const dailyData = await dailyRes.json();

    // 4. Logout
    fetch(`https://www.myfxbook.com/api/logout.json?session=${session}`).catch(() => {});

    // 5. Calcular ganancia mensual desde datos diarios
    const monthlyMap = {};

    if (!dailyData.error && Array.isArray(dailyData.dataDaily) && dailyData.dataDaily.length) {
      dailyData.dataDaily.forEach(d => {
        // Detectar formato de fecha automáticamente
        let year, month;
        if (d.date) {
          const dateStr = String(d.date);
          if (dateStr.includes('/')) {
            // Formato MM/DD/YYYY
            const parts = dateStr.split('/');
            month = parts[0].padStart(2, '0');
            year  = parts[2];
          } else if (dateStr.includes('-')) {
            // Formato YYYY-MM-DD
            const parts = dateStr.split('-');
            year  = parts[0];
            month = parts[1].padStart(2, '0');
          }
        }
        if (!year || !month) return;

        const key     = `${year}-${month}`;
        const balance = parseFloat(d.balance) || 0;
        const profit  = parseFloat(d.profit)  || 0;

        if (!monthlyMap[key]) {
          monthlyMap[key] = { firstBalance: balance - profit, lastBalance: balance };
        } else {
          monthlyMap[key].lastBalance = balance;
        }
      });
    }

    // 6. Construir años/meses
    const yearsMap = {};
    Object.entries(monthlyMap).forEach(([key, { firstBalance, lastBalance }]) => {
      const [yearStr, monthStr] = key.split('-');
      const year  = parseInt(yearStr);
      const month = parseInt(monthStr) - 1;
      const gain  = firstBalance > 0
        ? parseFloat(((lastBalance - firstBalance) / firstBalance * 100).toFixed(2))
        : null;
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

    // Si no hay datos diarios, caer en fallback con historial hardcodeado
    const hasDailyData = years.length > 0;

    let cumTotal = 1;
    years.forEach(row => row.months.forEach(v => { if (v !== null) cumTotal *= (1 + v / 100); }));

    return res.status(200).json({
      error: false,
      debug: {
        accountName:    account.name,
        internalId:     internalId,
        dailyCount:     dailyData.dataDaily?.length || 0,
        dailyError:     dailyData.error || false,
        dailyMsg:       dailyData.message || null,
        hasDailyData,
      },
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
        balance:          parseFloat(parseFloat(account.balance || 0).toFixed(2)),
        last_update:      account.lastUpdateDate || endDate,
      },
      years,
      total: parseFloat(((cumTotal - 1) * 100).toFixed(2)),
    });

  } catch (err) {
    return res.status(500).json({ error: true, message: err.message, stack: err.stack });
  }
}
