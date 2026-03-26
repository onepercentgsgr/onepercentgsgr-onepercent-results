// Vercel Serverless Function — /api/live
// Llama a MyFxBook con credenciales seguras (env vars) y devuelve los datos al frontend.
// Las credenciales NUNCA llegan al browser.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600'); // cache 1 hora en Vercel

  const email    = process.env.MYFXBOOK_EMAIL;
  const password = process.env.MYFXBOOK_PASSWORD;
  const accountId = process.env.MYFXBOOK_ACCOUNT_ID; // ID numérico de la cuenta en MyFxBook

  if (!email || !password || !accountId) {
    return res.status(500).json({ error: true, message: 'Variables de entorno no configuradas' });
  }

  try {
    // 1. Login → obtener session key
    const loginRes = await fetch(
      `https://www.myfxbook.com/api/login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
    );
    const loginData = await loginRes.json();

    if (loginData.error) {
      return res.status(401).json({ error: true, message: 'Login a MyFxBook fallido: ' + loginData.message });
    }

    const session = loginData.session;

    // 2. Obtener datos de la cuenta
    const [accountsRes, dailyRes] = await Promise.all([
      fetch(`https://www.myfxbook.com/api/get-my-accounts.json?session=${session}`),
      fetch(`https://www.myfxbook.com/api/get-data-daily.json?session=${session}&id=${accountId}&start=2026-01-01&end=2026-12-31`)
    ]);

    const accountsData = await accountsRes.json();
    const dailyData    = await dailyRes.json();

    // 3. Logout (liberar sesión)
    fetch(`https://www.myfxbook.com/api/logout.json?session=${session}`).catch(() => {});

    // 4. Encontrar la cuenta correcta
    const account = accountsData.accounts?.find(a => String(a.id) === String(accountId))
                 || accountsData.accounts?.[0];

    if (!account) {
      return res.status(404).json({ error: true, message: 'Cuenta no encontrada en MyFxBook' });
    }

    // 5. Calcular ganancia mensual del mes actual desde datos diarios
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentYear  = now.getFullYear();

    let monthlyGain = null;
    if (!dailyData.error && dailyData.dataDaily) {
      const thisMonthData = dailyData.dataDaily.filter(d => {
        // formato fecha: "MM/DD/YYYY"
        const parts = d.date.split('/');
        const dMonth = parseInt(parts[0]) - 1;
        const dYear  = parseInt(parts[2]);
        return dMonth === currentMonth && dYear === currentYear;
      });

      if (thisMonthData.length > 0) {
        // Ganancia del mes = profit acumulado del mes
        const firstBalance = parseFloat(thisMonthData[0].balance) - parseFloat(thisMonthData[0].profit);
        const lastBalance  = parseFloat(thisMonthData[thisMonthData.length - 1].balance);
        if (firstBalance > 0) {
          monthlyGain = parseFloat(((lastBalance - firstBalance) / firstBalance * 100).toFixed(2));
        }
      }
    }

    // 6. Respuesta limpia al frontend
    return res.status(200).json({
      error: false,
      live: {
        gain:           parseFloat(parseFloat(account.gain).toFixed(2)),
        drawdown:       parseFloat(parseFloat(account.drawdown).toFixed(2)),
        balance:        parseFloat(parseFloat(account.balance).toFixed(2)),
        profit:         parseFloat(parseFloat(account.profit).toFixed(2)),
        monthly:        account.monthly ? parseFloat(parseFloat(account.monthly).toFixed(2)) : monthlyGain,
        daily:          parseFloat(parseFloat(account.daily).toFixed(2)),
        lastUpdate:     account.lastUpdateDate,
        currency:       account.currency,
        profitFactor:   account.profitFactor ? parseFloat(parseFloat(account.profitFactor).toFixed(2)) : null,
      }
    });

  } catch (err) {
    return res.status(500).json({ error: true, message: err.message });
  }
}
