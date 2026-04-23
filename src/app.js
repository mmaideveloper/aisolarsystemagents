const state = {
  auth: null,
  error: '',
  prediction: null,
  loading: false,
  optimization: null
};

const app = document.getElementById('app');

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
    profile: {
      name: isAdmin ? 'Admin' : email.split('@')[0] || 'Solar User',
      email
    }
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
    generatedKwh,
    spent: toVirtual + toReal + toBoiler,
    toVirtual,
    toReal,
    toBoiler,
    soldToGrid: Math.max(remaining, 0)
  };
}

function calculateBatteryMonitor(model) {
  const batteryCapacity = 15;
  const soc = Math.min(100, Math.round((model.toReal / batteryCapacity) * 100));
  const batteryHealth = Math.max(82, 100 - Math.round(model.spent * 0.12));
  const cycleDepth = Math.min(95, Math.round((model.toReal / batteryCapacity) * 80 + 12));
  const inverterLoad = Math.min(100, Math.round((model.spent / 10) * 100));
  const inverterEfficiency = Math.max(90, Math.min(98, 96 - Math.round(model.soldToGrid * 0.2)));

  return {
    deviceName: 'GoodWe GW10K-ET-20 G2 + LYNX D 15 kWh',
    soc,
    batteryHealth,
    cycleDepth,
    inverterLoad,
    inverterEfficiency,
    recommendation:
      soc < 35
        ? 'Battery SOC is low. Prioritize charging from PV and reduce boiler load in the next cycle.'
        : 'Battery SOC is stable. Keep hybrid mode with evening discharge window for best savings.'
  };
}

function runOptimization(model) {
  const shiftToBattery = Math.min(model.soldToGrid * 0.45, 3.2);
  const expectedSavings = shiftToBattery * 0.22;
  const improvedSelfUse = Math.min(98, 65 + Math.round((model.spent + shiftToBattery) * 1.6));

  state.optimization = {
    shiftToBattery,
    expectedSavings,
    improvedSelfUse,
    notes: [
      'Set GoodWe GW10K-ET-20 G2 mode to maximize self-consumption between 17:00-22:00.',
      'Keep LYNX D reserve SOC at 25% for backup reliability.',
      'For ECO SOLAR BOOST MPPT-3000 3.5kW PRO, reduce morning start threshold to study heat-up behavior and improve efficiency.'
    ]
  };
}

function diagramBar(label, value, total) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return `<div class="diagram-row"><span>${label}</span><div class="bar-wrap"><div class="bar" style="width:${percent}%"></div></div><strong>${value.toFixed(2)} kWh (${percent}%)</strong></div>`;
}

function homeAndLoginHTML() {
  return `
    <section class="card">
      <h2>Intelligent Solar System Management</h2>
      <p>This SPA simulates how incoming energy from solar panels can be distributed to multiple destinations for savings and resilience.</p>
      <h3>Solar features and opportunities</h3>
      <ul>
        <li><strong>Grid-off battery:</strong> autonomy during outages and night use; downside is battery investment and lifecycle wear.</li>
        <li><strong>Public electricity provider export:</strong> monetize surplus energy; downside is usually lower selling tariff than buying cost.</li>
        <li><strong>Boiled water system:</strong> convert extra kWh to hot-water storage (example: 1000 L to 80°C).</li>
        <li><strong>Recommended extra:</strong> smart EV charging and schedule flexible loads (dishwasher, heat-pump) during peak solar hours.</li>
      </ul>
      <p>Distribution priority in this demo: virtual battery → real battery → water boiler → surplus to grid.</p>
    </section>

    <section class="card">
      <h2>Login Simulation</h2>
      <p>Use <code>admin</code> as username for admin view, or any username/email and password for user view.</p>
      <form id="loginForm" class="form-grid">
        <label>Email / Username<input id="email" placeholder="admin or user@example.com" /></label>
        <label>Password<input id="password" type="password" placeholder="••••••••" /></label>
        <button type="submit">${state.loading ? 'Signing in...' : 'Sign in'}</button>
      </form>
      ${state.error ? `<p class="error">${state.error}</p>` : ''}
    </section>`;
}

function batteryMonitoringHTML(model) {
  const monitor = calculateBatteryMonitor(model);
  return `<section class="card">
      <h3>Grid-Off Battery Monitoring & Integration</h3>
      <p><strong>Measured setup:</strong> ${monitor.deviceName}</p>
      <div class="metrics">
        <article><span>Battery SOC</span><strong>${monitor.soc}%</strong></article>
        <article><span>Battery health</span><strong>${monitor.batteryHealth}%</strong></article>
        <article><span>Cycle depth</span><strong>${monitor.cycleDepth}%</strong></article>
        <article><span>Inverter load</span><strong>${monitor.inverterLoad}%</strong></article>
        <article><span>Inverter efficiency</span><strong>${monitor.inverterEfficiency}%</strong></article>
      </div>
      <p>${monitor.recommendation}</p>
      <p>
        Integrated study target:
        <a href="https://solaro.sk/p/solarny-invertor-eco-solar-boost-mppt-35kw-pro/" target="_blank" rel="noreferrer">ECO SOLAR BOOST MPPT-3000 3.5kW PRO</a>
        for settings tuning and optimization.
      </p>
      <button id="optimizeBtn">Run integration optimization</button>
      ${state.optimization ? `<div class="opt-box">
        <p><strong>Optimization result:</strong></p>
        <ul>
          <li>Shifted to battery: ${state.optimization.shiftToBattery.toFixed(2)} kWh/day</li>
          <li>Estimated savings improvement: €${state.optimization.expectedSavings.toFixed(2)}/day</li>
          <li>Projected self-use ratio: ${state.optimization.improvedSelfUse}%</li>
        </ul>
        <ul>${state.optimization.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
      </div>` : ''}
    </section>`;
}

function dashboardHTML() {
  const model = calculate();
  const total = model.generatedKwh || 1;

  return `<section class="card"><h2>${state.auth.role === 'admin' ? 'Admin' : 'User'} Dashboard</h2>
      <p>Welcome <strong>${state.auth.profile.name}</strong>. Below are generated reports and a simple energy distribution diagram.</p>
      <div class="two-col">
      <div><h3>Input setup</h3><div class="form-grid compact">
      <label>Number of panels<input id="panels" type="number" value="${readInputValue('panels', 12)}" /></label>
      <label>Panel power (W)<input id="panelWatt" type="number" value="${readInputValue('panelWatt', 460)}" /></label>
      <label>Sun hours/day<input id="sunHours" type="number" step="0.1" value="${readInputValue('sunHours', 5.2)}" /></label>
      <label>System efficiency (%)<input id="efficiency" type="number" value="${readInputValue('efficiency', 84)}" /></label>
      </div></div>
      <div><h3>Output devices</h3><div class="form-grid compact">
      <label>Virtual battery (kWh)<input id="virtualBatteryKwh" type="number" value="${readInputValue('virtualBatteryKwh', 8)}" /></label>
      <label>Real battery (kWh)<input id="realBatteryKwh" type="number" value="${readInputValue('realBatteryKwh', 12)}" /></label>
      <label>Boiler liters<input id="boilerLiters" type="number" value="${readInputValue('boilerLiters', 1000)}" /></label>
      <label>Water target °C<input id="targetTemp" type="number" value="${readInputValue('targetTemp', 80)}" /></label>
      <label>Boiler power (W)<input id="boilerPowerW" type="number" value="${readInputValue('boilerPowerW', 3000)}" /></label>
      </div></div></div>
      <h3>Fake reports</h3>
      <div class="metrics">
      <article><span>Built energy (today)</span><strong>${model.generatedKwh.toFixed(2)} kWh</strong></article>
      <article><span>Spent energy</span><strong>${model.spent.toFixed(2)} kWh</strong></article>
      <article><span>Daily to virtual battery</span><strong>${model.toVirtual.toFixed(2)} kWh</strong></article>
      <article><span>Daily to real battery</span><strong>${model.toReal.toFixed(2)} kWh</strong></article>
      <article><span>Daily to boiler</span><strong>${model.toBoiler.toFixed(2)} kWh</strong></article>
      <article><span>Surplus to public grid</span><strong>${model.soldToGrid.toFixed(2)} kWh</strong></article>
      </div>
      <h3>Energy distribution diagram</h3>
      <div class="diagram">
        ${diagramBar('Virtual battery', model.toVirtual, total)}
        ${diagramBar('Real battery', model.toReal, total)}
        ${diagramBar('Boiler', model.toBoiler, total)}
        ${diagramBar('Grid export', model.soldToGrid, total)}
      </div>
      <div class="actions">
        <button id="predictBtn">Predict next day</button>
        <p>Predicted next day generation: <strong>${state.prediction == null ? 'Not calculated yet' : `${state.prediction.toFixed(2)} kWh`}</strong></p>
      </div>
    </section>
    ${batteryMonitoringHTML(model)}`;
}

function render() {
  app.innerHTML = `<main class="app-shell">
    <header>
      <div><h1>☀️ Solor System AI Agent</h1><p>Simulation for solar production, storage, and smart distribution (no backend API).</p></div>
      ${state.auth ? '<button id="logout" class="ghost">Logout</button>' : ''}
    </header>
    ${!state.auth ? homeAndLoginHTML() : dashboardHTML()}
  </main>`;

  document.getElementById('logout')?.addEventListener('click', () => {
    state.auth = null;
    state.prediction = null;
    state.error = '';
    state.optimization = null;
    render();
  });

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      state.loading = true;
      state.error = '';
      render();

      const result = await fakeLogin(
        document.getElementById('email').value.trim(),
        document.getElementById('password').value.trim()
      );

      state.loading = false;
      if (!result.ok) {
        state.error = result.message;
      } else {
        state.auth = result;
      }
      render();
    });
  }

  if (state.auth) {
    document.querySelectorAll('input').forEach((el) => el.addEventListener('input', render));
    document.getElementById('predictBtn')?.addEventListener('click', async () => {
      const model = calculate();
      state.prediction = await fakePredictNextDay(model.generatedKwh);
      render();
    });
    document.getElementById('optimizeBtn')?.addEventListener('click', () => {
      runOptimization(calculate());
      render();
    });
  }
}

render();
