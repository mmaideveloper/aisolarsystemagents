const state = {
  auth: null,
  error: '',
  prediction: null,
  loading: false
};

const app = document.getElementById('app');

const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

async function fakeLogin(email, password) {
  await delay();
  if (email === 'admin' && password === 'admin@solar@2026') {
    return { ok: true, role: 'admin', profile: { name: 'Solar Admin', email: 'admin@local' } };
  }
  if (email && password) {
    return { ok: true, role: 'user', profile: { name: email.split('@')[0] || 'Solar User', email } };
  }
  return { ok: false, message: 'Email and password are required.' };
}

async function fakePredictNextDay(todayEnergyKwh) {
  await delay(300);
  const weatherFactor = 0.85 + Math.random() * 0.35;
  return Number((todayEnergyKwh * weatherFactor).toFixed(2));
}

function num(value) { return Number(value) || 0; }

function calculate() {
  const panels = num(document.getElementById('panels')?.value);
  const panelWatt = num(document.getElementById('panelWatt')?.value);
  const sunHours = num(document.getElementById('sunHours')?.value);
  const efficiency = num(document.getElementById('efficiency')?.value);
  const virtualBatteryKwh = num(document.getElementById('virtualBatteryKwh')?.value);
  const realBatteryKwh = num(document.getElementById('realBatteryKwh')?.value);
  const boilerLiters = num(document.getElementById('boilerLiters')?.value);
  const targetTemp = num(document.getElementById('targetTemp')?.value);
  const boilerPowerW = num(document.getElementById('boilerPowerW')?.value);

  const generatedKwh = (panels * panelWatt * sunHours * (efficiency / 100)) / 1000;
  const deltaTemp = Math.max(targetTemp - 20, 0);
  const thermalKwh = (boilerLiters * deltaTemp * 4.186) / 3600;
  const boilerNeed = Math.max(thermalKwh, boilerPowerW / 1000);

  let remaining = generatedKwh;
  const toVirtual = Math.min(virtualBatteryKwh, remaining); remaining -= toVirtual;
  const toReal = Math.min(realBatteryKwh, remaining); remaining -= toReal;
  const toBoiler = Math.min(boilerNeed, remaining); remaining -= toBoiler;

  return {
    generatedKwh,
    spent: toVirtual + toReal + toBoiler,
    toVirtual,
    toReal,
    toBoiler,
    soldToGrid: Math.max(remaining, 0)
  };
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
      <p>Admin credentials: <code>admin / admin@solar@2026</code>. User mode accepts any non-empty email/password.</p>
      <form id="loginForm" class="form-grid">
        <label>Email / Username<input id="email" placeholder="user@example.com or admin" /></label>
        <label>Password<input id="password" type="password" placeholder="••••••••" /></label>
        <button type="submit">${state.loading ? 'Signing in...' : 'Sign in'}</button>
      </form>
      ${state.error ? `<p class="error">${state.error}</p>` : ''}
    </section>`;
}

function adminHTML() {
  return `<section class="card"><h2>Admin Area</h2><p>Welcome, ${state.auth.profile.name}. You can extend this for full fleet control.</p><ul><li>Review user simulation scenarios.</li><li>Manage tariff assumptions.</li><li>Publish optimization rules for battery/grid/boiler.</li></ul></section>`;
}

function userHTML() {
  const model = calculate();
  return `<section class="card"><h2>User Simulation Dashboard</h2>
      <div class="two-col">
      <div><h3>Input setup</h3><div class="form-grid compact">
      <label>Number of panels<input id="panels" type="number" value="${document.getElementById('panels')?.value || 12}" /></label>
      <label>Panel power (W)<input id="panelWatt" type="number" value="${document.getElementById('panelWatt')?.value || 460}" /></label>
      <label>Sun hours/day<input id="sunHours" type="number" step="0.1" value="${document.getElementById('sunHours')?.value || 5.2}" /></label>
      <label>System efficiency (%)<input id="efficiency" type="number" value="${document.getElementById('efficiency')?.value || 84}" /></label>
      </div></div>
      <div><h3>Output devices</h3><div class="form-grid compact">
      <label>Virtual battery (kWh)<input id="virtualBatteryKwh" type="number" value="${document.getElementById('virtualBatteryKwh')?.value || 8}" /></label>
      <label>Real battery (kWh)<input id="realBatteryKwh" type="number" value="${document.getElementById('realBatteryKwh')?.value || 12}" /></label>
      <label>Boiler liters<input id="boilerLiters" type="number" value="${document.getElementById('boilerLiters')?.value || 1000}" /></label>
      <label>Water target °C<input id="targetTemp" type="number" value="${document.getElementById('targetTemp')?.value || 80}" /></label>
      <label>Boiler power (W)<input id="boilerPowerW" type="number" value="${document.getElementById('boilerPowerW')?.value || 3000}" /></label>
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
      <div class="actions">
        <button id="predictBtn">Predict next day</button>
        <p>Predicted next day generation: <strong>${state.prediction == null ? 'Not calculated yet' : `${state.prediction.toFixed(2)} kWh`}</strong></p>
      </div>
    </section>`;
}

function render() {
  app.innerHTML = `<main class="app-shell">
    <header>
      <div><h1>☀️ Solar Intelligence SPA</h1><p>Simulation for solar production, storage, and smart distribution (no backend API).</p></div>
      ${state.auth ? '<button id="logout" class="ghost">Logout</button>' : ''}
    </header>
    ${!state.auth ? homeAndLoginHTML() : state.auth.role === 'admin' ? adminHTML() : userHTML()}
  </main>`;

  document.getElementById('logout')?.addEventListener('click', () => {
    state.auth = null; state.prediction = null; state.error = ''; render();
  });

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      state.loading = true; state.error = ''; render();
      const result = await fakeLogin(document.getElementById('email').value.trim(), document.getElementById('password').value.trim());
      state.loading = false;
      if (!result.ok) state.error = result.message;
      else state.auth = result;
      render();
    });
  }

  if (state.auth?.role === 'user') {
    document.querySelectorAll('input').forEach((el) => el.addEventListener('input', render));
    document.getElementById('predictBtn')?.addEventListener('click', async () => {
      const model = calculate();
      state.prediction = await fakePredictNextDay(model.generatedKwh);
      render();
    });
  }
}

render();
