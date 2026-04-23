const state = {
  auth: null,
  error: '',
  prediction: null,
  loading: false,
  optimization: null,
  currentPage: 'dashboard',
  selectedReport: 'generation_vs_usage'
};

const app = document.getElementById('app');
const REPORT_OPTIONS = [
  { id: 'generation_vs_usage', name: 'Generation vs Usage' },
  { id: 'battery_soc_trend', name: 'Battery SOC Trend' },
  { id: 'panel_efficiency', name: 'Panel Efficiency' },
  { id: 'grid_export_import', name: 'Grid Export/Import' },
  { id: 'boiler_energy', name: 'Boiler Energy Use' },
  { id: 'battery_cycle_depth', name: 'Battery Cycle Depth' },
  { id: 'inverter_load', name: 'Inverter Load' },
  { id: 'system_losses', name: 'System Losses' },
  { id: 'forecast_accuracy', name: 'Forecast Accuracy' },
  { id: 'cost_savings', name: 'Cost Savings' }
];

const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

async function fakeLogin(email, password) {
  await delay();
  if (!email || !password) {
    return { ok: false, message: 'Email/username and password are required.' };
  }
  const isAdmin = email.toLowerCase() === 'admin';
  return {
    ok: true,
    role: isAdmin ? 'admin' : 'user',
    profile: { name: isAdmin ? 'Admin' : email.split('@')[0] || 'Solar User', email }
  };
}

async function fakePredictNextDay(todayEnergyKwh) {
  await delay(300);
  const weatherFactor = 0.85 + Math.random() * 0.35;
  return Number((todayEnergyKwh * weatherFactor).toFixed(2));
}

function num(value) {
  return Number(value) || 0;
}

function readInputValue(id, fallback) {
  return document.getElementById(id)?.value ?? fallback;
}

function calculate() {
  const panels = num(readInputValue('panels', 12));
  const panelWatt = num(readInputValue('panelWatt', 460));
  const sunHours = num(readInputValue('sunHours', 5.2));
  const efficiency = num(readInputValue('efficiency', 84));
  const virtualBatteryKwh = num(readInputValue('virtualBatteryKwh', 8));
  const realBatteryKwh = num(readInputValue('realBatteryKwh', 12));
  const boilerLiters = num(readInputValue('boilerLiters', 1000));
  const targetTemp = num(readInputValue('targetTemp', 80));
  const boilerPowerW = num(readInputValue('boilerPowerW', 3000));

  const generatedKwh = (panels * panelWatt * sunHours * (efficiency / 100)) / 1000;
  const deltaTemp = Math.max(targetTemp - 20, 0);
  const thermalKwh = (boilerLiters * deltaTemp * 4.186) / 3600;
  const boilerNeed = Math.max(thermalKwh, boilerPowerW / 1000);

  let remaining = generatedKwh;
  const toVirtual = Math.min(virtualBatteryKwh, remaining);
  remaining -= toVirtual;
  const toReal = Math.min(realBatteryKwh, remaining);
  remaining -= toReal;
  const toBoiler = Math.min(boilerNeed, remaining);
  remaining -= toBoiler;

  return {
    panels,
    generatedKwh,
    spent: toVirtual + toReal + toBoiler,
    toVirtual,
    toReal,
    toBoiler,
    soldToGrid: Math.max(remaining, 0)
  };
}

function generateHistory(model) {
  return Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const variability = 0.78 + (i % 7) * 0.04;
    const generation = Number((model.generatedKwh * variability).toFixed(2));
    const usage = Number((generation * (0.72 + ((i * 3) % 10) / 100)).toFixed(2));
    const batterySoc = Math.min(100, Math.max(15, Math.round((model.toReal / 15) * 100 + (i % 5) * 3)));
    return {
      label: `Day ${day}`,
      generation,
      usage,
      batterySoc,
      gridExport: Number(Math.max(generation - usage, 0).toFixed(2)),
      gridImport: Number(Math.max(usage - generation * 0.75, 0).toFixed(2)),
      costSaving: Number((generation * 0.18).toFixed(2)),
      panelCount: model.panels + (i % 2),
      losses: Number((generation * 0.08).toFixed(2)),
      inverterLoad: Math.min(100, Math.round((usage / 10) * 100))
    };
  });
}

function renderMiniBars(items, key, max = null, unit = '') {
  const maxValue = max || Math.max(...items.map((it) => it[key]), 1);
  return `<div class="mini-bars">${items.map((it) => {
    const width = Math.round((it[key] / maxValue) * 100);
    return `<div class="mini-row"><span>${it.label}</span><div class="bar-wrap"><div class="bar" style="width:${width}%"></div></div><strong>${it[key]}${unit}</strong></div>`;
  }).join('')}</div>`;
}

function calculateBatteryMonitor(model) {
  const batteryCapacity = 15;
  const soc = Math.min(100, Math.round((model.toReal / batteryCapacity) * 100));
  return {
    deviceName: 'GoodWe GW10K-ET-20 G2 + LYNX D 15 kWh',
    soc,
    batteryHealth: Math.max(82, 100 - Math.round(model.spent * 0.12)),
    cycleDepth: Math.min(95, Math.round((model.toReal / batteryCapacity) * 80 + 12)),
    inverterLoad: Math.min(100, Math.round((model.spent / 10) * 100)),
    inverterEfficiency: Math.max(90, Math.min(98, 96 - Math.round(model.soldToGrid * 0.2)))
  };
}

function runOptimization(model) {
  const shiftToBattery = Math.min(model.soldToGrid * 0.45, 3.2);
  state.optimization = {
    shiftToBattery,
    expectedSavings: shiftToBattery * 0.22,
    improvedSelfUse: Math.min(98, 65 + Math.round((model.spent + shiftToBattery) * 1.6))
  };
}

function authLandingHTML() {
  return `
    <section class="card">
      <h2>Intelligent Solar System Management</h2>
      <p>Simulate distribution from solar input to batteries, boiler, and grid export with reporting and optimization.</p>
    </section>
    <section class="card">
      <h2>Login Simulation</h2>
      <p>Use <code>admin</code> for admin pages or any username/password for user pages.</p>
      <form id="loginForm" class="form-grid">
        <label>Email / Username<input id="email" placeholder="admin or user@example.com" /></label>
        <label>Password<input id="password" type="password" placeholder="••••••••" /></label>
        <button type="submit">${state.loading ? 'Signing in...' : 'Sign in'}</button>
      </form>
      ${state.error ? `<p class="error">${state.error}</p>` : ''}
    </section>`;
}

function navTabsHTML() {
  const baseTabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'reports', label: 'Reports' },
    { id: 'recommendation', label: 'Recommendation' }
  ];
  if (state.auth.role === 'admin') baseTabs.push({ id: 'admin', label: 'Admin Page' });
  return `<nav class="tabs">${baseTabs.map((t) => `<button class="tab ${state.currentPage === t.id ? 'active' : ''}" data-page="${t.id}">${t.label}</button>`).join('')}</nav>`;
}

function dashboardPage(model) {
  const history = generateHistory(model);
  const week = history.slice(-7);
  const monthTotal = history.reduce((a, x) => a + x.generation, 0).toFixed(2);
  const weekTotal = week.reduce((a, x) => a + x.generation, 0).toFixed(2);
  const dayLatest = history[history.length - 1];

  return `<section class="card"><h2>${state.auth.role === 'admin' ? 'Admin' : 'User'} Dashboard</h2>
    <div class="form-grid compact">
      <label>Number of panels<input id="panels" type="number" value="${readInputValue('panels', 12)}" /></label>
      <label>Panel power (W)<input id="panelWatt" type="number" value="${readInputValue('panelWatt', 460)}" /></label>
      <label>Sun hours/day<input id="sunHours" type="number" step="0.1" value="${readInputValue('sunHours', 5.2)}" /></label>
      <label>Efficiency (%)<input id="efficiency" type="number" value="${readInputValue('efficiency', 84)}" /></label>
      <label>Real battery (kWh)<input id="realBatteryKwh" type="number" value="${readInputValue('realBatteryKwh', 12)}" /></label>
      <label>Virtual battery (kWh)<input id="virtualBatteryKwh" type="number" value="${readInputValue('virtualBatteryKwh', 8)}" /></label>
      <label>Boiler liters<input id="boilerLiters" type="number" value="${readInputValue('boilerLiters', 1000)}" /></label>
      <label>Target °C<input id="targetTemp" type="number" value="${readInputValue('targetTemp', 80)}" /></label>
      <label>Boiler power (W)<input id="boilerPowerW" type="number" value="${readInputValue('boilerPowerW', 3000)}" /></label>
    </div>
    <div class="metrics">
      <article><span>Today generation</span><strong>${model.generatedKwh.toFixed(2)} kWh</strong></article>
      <article><span>Week generation</span><strong>${weekTotal} kWh</strong></article>
      <article><span>Month generation</span><strong>${monthTotal} kWh</strong></article>
      <article><span>Latest day usage</span><strong>${dayLatest.usage} kWh</strong></article>
    </div>
    <h3>Daily / Weekly / Monthly diagram</h3>
    ${renderMiniBars([
      { label: 'Day', energy: dayLatest.generation },
      { label: 'Week avg', energy: Number((weekTotal / 7).toFixed(2)) },
      { label: 'Month avg', energy: Number((monthTotal / 30).toFixed(2)) }
    ], 'energy', null, ' kWh')}
    <h3>Overall system table</h3>
    <table><thead><tr><th>Period</th><th>Generation kWh</th><th>Usage kWh</th><th>Grid Export kWh</th></tr></thead>
    <tbody>
      <tr><td>Day</td><td>${dayLatest.generation}</td><td>${dayLatest.usage}</td><td>${dayLatest.gridExport}</td></tr>
      <tr><td>Week</td><td>${weekTotal}</td><td>${week.reduce((a,x)=>a+x.usage,0).toFixed(2)}</td><td>${week.reduce((a,x)=>a+x.gridExport,0).toFixed(2)}</td></tr>
      <tr><td>Month</td><td>${monthTotal}</td><td>${history.reduce((a,x)=>a+x.usage,0).toFixed(2)}</td><td>${history.reduce((a,x)=>a+x.gridExport,0).toFixed(2)}</td></tr>
    </tbody></table>
    <div class="actions"><button id="predictBtn">Predict next day</button><p><strong>${state.prediction == null ? 'Not calculated yet' : `${state.prediction.toFixed(2)} kWh`}</strong></p></div>
  </section>`;
}

function reportDataByType(type, history) {
  switch (type) {
    case 'battery_soc_trend': return { key: 'batterySoc', unit: '%' };
    case 'panel_efficiency': return { key: 'panelCount', unit: ' panels' };
    case 'grid_export_import': return { key: 'gridExport', unit: ' kWh' };
    case 'boiler_energy': return { key: 'usage', unit: ' kWh' };
    case 'battery_cycle_depth': return { key: 'batterySoc', unit: '%' };
    case 'inverter_load': return { key: 'inverterLoad', unit: '%' };
    case 'system_losses': return { key: 'losses', unit: ' kWh' };
    case 'forecast_accuracy': return { key: 'generation', unit: ' kWh' };
    case 'cost_savings': return { key: 'costSaving', unit: ' €' };
    default: return { key: 'generation', unit: ' kWh' };
  }
}

function generateWeatherForecast(model) {
  const baseSunrise = ['05:02', '05:00', '04:58', '04:56', '04:55', '04:53', '04:51'];
  const baseSunset = ['20:12', '20:13', '20:14', '20:16', '20:17', '20:18', '20:20'];
  return Array.from({ length: 7 }, (_, i) => {
    const sunnyHours = Number((4.2 + (i % 4) * 1.1).toFixed(1));
    const temp = 17 + i;
    const predictedEnergy = Number((model.panels * 0.42 * sunnyHours).toFixed(2));
    const batterySaved = Number((predictedEnergy * (0.28 + (i % 3) * 0.08)).toFixed(2));
    return {
      day: `Day +${i + 1}`,
      temp,
      sunnyHours,
      sunrise: baseSunrise[i],
      sunset: baseSunset[i],
      predictedEnergy,
      batterySaved,
      surplus: Number((predictedEnergy - batterySaved).toFixed(2))
    };
  });
}

function recommendationPage(model) {
  const weather = generateWeatherForecast(model);
  const avgEnergy = weather.reduce((a, x) => a + x.predictedEnergy, 0) / weather.length;
  const avgSurplus = weather.reduce((a, x) => a + x.surplus, 0) / weather.length;
  const avgSunny = weather.reduce((a, x) => a + x.sunnyHours, 0) / weather.length;

  const recommendation = avgSurplus > 10
    ? 'High surplus expected. Enable VSE virtual battery first, then route secondary surplus to water boiler.'
    : 'Moderate surplus expected. Keep water boiler enabled during 11:00-15:00 and top-up real battery in the evening.';

  return `<section class="card"><h2>Recommendation Page</h2>
    <p>Predicted weather and production plan with setup hints for saving rest energy.</p>
    <div class="metrics">
      <article><span>Avg temperature</span><strong>${(weather.reduce((a,x)=>a+x.temp,0)/weather.length).toFixed(1)} °C</strong></article>
      <article><span>Avg sunny hours</span><strong>${avgSunny.toFixed(1)} h/day</strong></article>
      <article><span>Avg predicted energy</span><strong>${avgEnergy.toFixed(2)} kWh/day</strong></article>
      <article><span>Avg surplus</span><strong>${avgSurplus.toFixed(2)} kWh/day</strong></article>
    </div>

    <h3>Weather details (sunrise/sunset)</h3>
    <table><thead><tr><th>Day</th><th>Temp</th><th>Sunny hours</th><th>Sunrise</th><th>Sunset</th><th>Predicted energy</th><th>Saved to battery</th></tr></thead>
    <tbody>${weather.map((d) => `<tr><td>${d.day}</td><td>${d.temp} °C</td><td>${d.sunnyHours} h</td><td>${d.sunrise}</td><td>${d.sunset}</td><td>${d.predictedEnergy} kWh</td><td>${d.batterySaved} kWh</td></tr>`).join('')}</tbody></table>

    <h3>Chart: energy created</h3>
    ${renderMiniBars(weather.map((d) => ({ label: d.day, val: d.predictedEnergy })), 'val', null, ' kWh')}

    <h3>Chart: energy saved to battery</h3>
    ${renderMiniBars(weather.map((d) => ({ label: d.day, val: d.batterySaved })), 'val', null, ' kWh')}

    <div class="opt-box">
      <p><strong>Recommendation:</strong> ${recommendation}</p>
      <ul>
        <li>Enable virtual battery from <strong>VSE</strong> when predicted surplus is above 8 kWh/day.</li>
        <li>Enable water boiler heating window during high solar period (11:00 - 15:00).</li>
        <li>Keep real battery reserve at 25% for night consumption and outages.</li>
      </ul>
    </div>
  </section>`;
}

function reportsPage(model) {
  const history = generateHistory(model);
  const cfg = reportDataByType(state.selectedReport, history);
  return `<section class="card reports-layout">
    <aside class="reports-sidebar">
      <h3>Reports</h3>
      ${REPORT_OPTIONS.map((r) => `<button class="report-btn ${state.selectedReport === r.id ? 'active' : ''}" data-report="${r.id}">${r.name}</button>`).join('')}
    </aside>
    <div>
      <h2>Report: ${REPORT_OPTIONS.find((x) => x.id === state.selectedReport)?.name}</h2>
      <p>Per-day report using current parameters (panels: ${model.panels}).</p>
      ${renderMiniBars(history.slice(-10), cfg.key, null, cfg.unit)}
      <h3>Last 10 days data table</h3>
      <table><thead><tr><th>Day</th><th>Generation</th><th>Usage</th><th>Battery SOC</th><th>Panels</th></tr></thead>
      <tbody>${history.slice(-10).map((h) => `<tr><td>${h.label}</td><td>${h.generation}</td><td>${h.usage}</td><td>${h.batterySoc}%</td><td>${h.panelCount}</td></tr>`).join('')}</tbody></table>
    </div>
  </section>`;
}

function adminPage(model) {
  const mon = calculateBatteryMonitor(model);
  return `<section class="card"><h2>Admin Control Page</h2>
    <p>Manage and optimize integrated components: <strong>${mon.deviceName}</strong>.</p>
    <div class="metrics">
      <article><span>SOC</span><strong>${mon.soc}%</strong></article>
      <article><span>Health</span><strong>${mon.batteryHealth}%</strong></article>
      <article><span>Cycle depth</span><strong>${mon.cycleDepth}%</strong></article>
      <article><span>Inverter load</span><strong>${mon.inverterLoad}%</strong></article>
      <article><span>Efficiency</span><strong>${mon.inverterEfficiency}%</strong></article>
    </div>
    <p>External inverter study: <a href="https://solaro.sk/p/solarny-invertor-eco-solar-boost-mppt-35kw-pro/" target="_blank" rel="noreferrer">ECO SOLAR BOOST MPPT-3000 3.5kW PRO</a></p>
    <button id="optimizeBtn">Run integration optimization</button>
    ${state.optimization ? `<div class="opt-box"><p>Shifted: ${state.optimization.shiftToBattery.toFixed(2)} kWh/day, Savings: €${state.optimization.expectedSavings.toFixed(2)}/day, Self-use: ${state.optimization.improvedSelfUse}%</p></div>` : ''}
  </section>`;
}

function mainAppHTML() {
  const model = calculate();
  let page = dashboardPage(model);
  if (state.currentPage === 'reports') page = reportsPage(model);
  if (state.currentPage === 'recommendation') page = recommendationPage(model);
  if (state.currentPage === 'admin' && state.auth.role === 'admin') page = adminPage(model);

  return `${navTabsHTML()}${page}`;
}

function render() {
  app.innerHTML = `<main class="app-shell">
    <header>
      <div><h1>☀️ Solor System AI Agent</h1><p>Simulation for solar production, storage, and smart distribution.</p></div>
      ${state.auth ? '<button id="logout" class="ghost">Logout</button>' : ''}
    </header>
    ${!state.auth ? authLandingHTML() : mainAppHTML()}
  </main>`;

  document.getElementById('logout')?.addEventListener('click', () => {
    state.auth = null;
    state.prediction = null;
    state.error = '';
    state.optimization = null;
    state.currentPage = 'dashboard';
    render();
  });

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const emailValue = document.getElementById('email').value.trim();
      const passwordValue = document.getElementById('password').value.trim();
      state.loading = true;
      state.error = '';
      render();
      const result = await fakeLogin(emailValue, passwordValue);
      state.loading = false;
      if (!result.ok) state.error = result.message;
      else {
        state.auth = result;
        state.currentPage = 'dashboard';
      }
      render();
    });
  }

  if (state.auth) {
    document.querySelectorAll('input').forEach((el) => el.addEventListener('input', render));
    document.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => {
      state.currentPage = el.dataset.page;
      render();
    }));
    document.querySelectorAll('[data-report]').forEach((el) => el.addEventListener('click', () => {
      state.selectedReport = el.dataset.report;
      render();
    }));
    document.getElementById('predictBtn')?.addEventListener('click', async () => {
      state.prediction = await fakePredictNextDay(calculate().generatedKwh);
      render();
    });
    document.getElementById('optimizeBtn')?.addEventListener('click', () => {
      runOptimization(calculate());
      render();
    });
  }
}

render();
