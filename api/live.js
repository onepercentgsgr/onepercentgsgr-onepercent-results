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

    // 2. Obtener cuentas para el ID interno real
    const accountsRes  = await fetch(`https://www.myfxbook.com/api/get-my-accounts.json?session=${session}`);
    const accountsData = await accountsRes.json();

    if (accountsData.error || !accountsData.accounts?.length) {
      fetch(`https://www.myfxbook.com/api/logout.json?session=${session}`).catch(() => {});
      return res.status(404).json({ error: true, message: 'Sin cuentas' });
    }

    const account    = accountsData.accounts.find(a =>
      a.name?.toLowerCase().includes('percent') ||
      a.name?.toLowerCase().includes('one')
    ) || accountsData.accounts[0];

    const internalId = account.id; // ID interno real, no el del portfolio público

    // 3. Datos diarios solo del año actual (liviano)
    const now       = new Date();
    const thisYear  = now.getFullYear();
    const startYear = `${thisYear}-01-01`;
    const endToday  = now.toISOString().split('T')[0];

    const dailyRes  = await fetch(`https://www.myfxbook.com/api/get-data-daily.json?session=${session}&id=${internalId}&start=${startYear}&end=${endToday}`);
    const dailyData = await dailyRes.json();

    // 4. Logout
    fetch(`https://www.myfxbook.com/api/logout.json?session=${session}`).catch(() => {});

    // 5. Calcular meses del año actual
    const currentYearMonths = new Array(12).fill(null);

    if (!dailyData.error && Array.isArray(dailyData.dataDaily) && dailyData.dataDaily.length) {
      const monthlyMap = {};
      dailyData.dataDaily.forEach(d => {
        const dateStr = String(d.date || '');
        let year, month;
        if (dateStr.includes('/')) {
          const p = dateStr.split('/');
          month = p[0].padStart(2, '0');
          year  = p[2];
        } else if (dateStr.includes('-')) {
          const p = dateStr.split('-');
          year  = p[0];
          month = p[1].padStart(2, '0');
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

      Object.entries(monthlyMap).forEach(([key, { firstBalance, lastBalance }]) => {
        const monthIdx = parseInt(key.split('-')[1]) - 1;
        currentYearMonths[monthIdx] = firstBalance > 0
          ? parseFloat(((lastBalance - firstBalance) / firstBalance * 100).toFixed(2))
          : null;
      });
    }

    let cumYear = 1;
    currentYearMonths.forEach(v => { if (v !== null) cumYear *= (1 + v / 100); });

    return res.status(200).json({
      error:       false,
      last_update: account.lastUpdateDate || endToday,
      drawdown:    account.drawdown ? -parseFloat(parseFloat(account.drawdown).toFixed(2)) : null,
      balance:     account.balance  ?  parseFloat(parseFloat(account.balance).toFixed(2))  : null,
      currentYear: {
        year:   thisYear,
        months: currentYearMonths,
        total:  parseFloat(((cumYear - 1) * 100).toFixed(2)),
      }
    });

  } catch (err) {
    return res.status(500).json({ error: true, message: err.message });
  }
}
