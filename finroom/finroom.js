/*
 * ICARE FINROOM E2-D4M-B1 — presentation-only operating zones.
 *
 * IMPORTANT:
 * - classification uses ONLY the exact server break-even threshold;
 * - the three pre-break-even zones divide learner-distance to that
 *   server threshold for visual orientation;
 * - these zones are not probabilities, forecasts, solvency scores
 *   or new financial calculations.
 */
(() => {
  'use strict';

  /*
   * ICARE FINROOM E2-D4M-D4-R1 — async zone consistency.
   *
   * Presentation cache only:
   * this stores the most recent exact server-returned break-even
   * threshold and its scenario metadata so results that finish after
   * the graph can still be classified consistently.
   *
   * It does NOT derive or calculate a threshold.
   */
  let latestServerBreakEven = null;

  const ZONES = Object.freeze({
    critical: Object.freeze({
      key: 'critical',
      label: 'CRITICAL',
      detail: 'Far below break-even'
    }),
    risk: Object.freeze({
      key: 'risk',
      label: 'RISK',
      detail: 'Still below break-even'
    }),
    vigilance: Object.freeze({
      key: 'vigilance',
      label: 'WATCH',
      detail: 'Approaching break-even'
    }),
    good: Object.freeze({
      key: 'good',
      label: 'BREAK-EVEN REACHED',
      detail: 'Break-even reached or exceeded'
    })
  });

  const classify = (activeStudents, breakEvenStudents) => {
    const active = Number(activeStudents);
    const threshold = Number(breakEvenStudents);

    if (
      !Number.isFinite(active) ||
      !Number.isFinite(threshold) ||
      threshold <= 0
    ) {
      return null;
    }

    if (active >= threshold) {
      return ZONES.good;
    }

    const ratio = active / threshold;

    if (ratio < (1 / 3)) {
      return ZONES.critical;
    }

    if (ratio < (2 / 3)) {
      return ZONES.risk;
    }

    return ZONES.vigilance;
  };

  const removeZoneClasses = node => {
    if (!node || !node.classList) {
      return;
    }

    node.classList.remove(
      'finroom-zone-critical',
      'finroom-zone-risk',
      'finroom-zone-vigilance',
      'finroom-zone-good'
    );
  };

  const applyZoneClass = (node, zone) => {
    if (!node || !zone) {
      return;
    }

    removeZoneClasses(node);
    node.classList.add('finroom-zone-' + zone.key);
    node.dataset.finroomZone = zone.key;
  };

  const sameScenario = (node, overrides) => {
    if (!node || !overrides) {
      return false;
    }

    const checks = [
      ['finroomDeviceMode', 'device_mode'],
      ['finroomCostStructure', 'cost_structure'],
      ['finroomHomeEnabled', 'home_enabled'],
      ['finroomHomeConversionRate', 'home_conversion_rate']
    ];

    for (const [datasetKey, objectKey] of checks) {
      if (
        node.dataset[datasetKey] !== undefined &&
        node.dataset[datasetKey] !== '' &&
        overrides[objectKey] !== undefined &&
        String(node.dataset[datasetKey]) !== String(overrides[objectKey])
      ) {
        return false;
      }
    }

    return true;
  };

  const ensureSignal = (root, active, threshold) => {
    if (!root) {
      return;
    }

    let signal =
      root.querySelector(':scope > .finroom-zone-signal');

    if (!signal) {
      signal = document.createElement('div');
      signal.className = 'finroom-zone-signal';
      signal.setAttribute('role', 'status');
      root.prepend(signal);
    }

    const zone = classify(active, threshold);

    if (!zone) {
      signal.className =
        'finroom-zone-signal finroom-zone-signal-pending';

      signal.textContent =
        'Position relative to break-even: unavailable for this result.';
      return;
    }

    signal.className =
      'finroom-zone-signal finroom-zone-' + zone.key;

    signal.textContent =
      zone.label +
      ' — ' +
      zone.detail +
      ' · ' +
      new Intl.NumberFormat('en-US').format(Number(active)) +
      ' / ' +
      new Intl.NumberFormat('en-US').format(Number(threshold)) +
      ' active learners.';
  };

  document.addEventListener(
    'icare:finroom-break-even-ready',
    event => {
      const detail =
        event && event.detail
          ? event.detail
          : {};

      const threshold =
        Number(detail.break_even_active_students);

      const overrides =
        detail.overrides || {};

      if (
        !Number.isFinite(threshold) ||
        threshold <= 0
      ) {
        return;
      }

      /*
       * Cache ONLY the exact threshold already returned by the server.
       * No interpolation and no financial calculation occurs here.
       */
      latestServerBreakEven = Object.freeze({
        threshold,
        overrides: Object.freeze({
          ...overrides
        })
      });

      /*
       * Previous single-simulation result.
       */
      const summary =
        document.getElementById('finroom-simulation-summary');

      if (
        summary &&
        summary.dataset.finroomActiveStudents &&
        sameScenario(summary, overrides)
      ) {
        ensureSignal(
          summary,
          summary.dataset.finroomActiveStudents,
          threshold
        );
      }

      /*
       * Previous trajectory result.
       *
       * Apply zones only when trajectory scenario metadata matches
       * the graph scenario. We deliberately do not reuse a threshold
       * across a different cost/device/home scenario.
       */
      const trajectory =
        document.getElementById('finroom-trajectory-result');

      if (
        trajectory &&
        sameScenario(trajectory, overrides)
      ) {
        for (
          const row of trajectory.querySelectorAll(
            'tbody tr[data-finroom-active-students]'
          )
        ) {
          const active =
            Number(row.dataset.finroomActiveStudents);

          const zone =
            classify(active, threshold);

          if (!zone) {
            continue;
          }

          applyZoneClass(row, zone);

          row.title =
            zone.label +
            ' — ' +
            zone.detail +
            ' (' +
            new Intl.NumberFormat('en-US').format(active) +
            ' / ' +
            new Intl.NumberFormat('en-US').format(threshold) +
            ' active learners)';

          const lastCell =
            row.lastElementChild;

          if (lastCell) {
            if (!lastCell.dataset.finroomBaseText) {
              lastCell.dataset.finroomBaseText =
                lastCell.textContent || '';
            }

            lastCell.textContent =
              zone.label +
              ' — ' +
              lastCell.dataset.finroomBaseText;
          }
        }
      }
    }
  );

  const applyKnownSignal = (
    root,
    active
  ) => {
    if (
      !root ||
      !latestServerBreakEven ||
      !sameScenario(
        root,
        latestServerBreakEven.overrides
      )
    ) {
      return false;
    }

    ensureSignal(
      root,
      active,
      latestServerBreakEven.threshold
    );

    return true;
  };

  const applyKnownTrajectory = root => {
    if (
      !root ||
      !latestServerBreakEven ||
      !sameScenario(
        root,
        latestServerBreakEven.overrides
      )
    ) {
      return false;
    }

    const threshold =
      latestServerBreakEven.threshold;

    for (
      const row of root.querySelectorAll(
        'tbody tr[data-finroom-active-students]'
      )
    ) {
      const active =
        Number(
          row.dataset.finroomActiveStudents
        );

      const zone =
        classify(active, threshold);

      if (!zone) {
        continue;
      }

      applyZoneClass(row, zone);

      row.title =
        zone.label +
        ' — ' +
        zone.detail +
        ' (' +
        new Intl.NumberFormat(
          'en-US'
        ).format(active) +
        ' / ' +
        new Intl.NumberFormat(
          'en-US'
        ).format(threshold) +
        ' active learners)';

      const lastCell =
        row.lastElementChild;

      if (lastCell) {
        if (
          !lastCell.dataset.finroomBaseText
        ) {
          lastCell.dataset.finroomBaseText =
            lastCell.textContent || '';
        }

        lastCell.textContent =
          zone.label +
          ' — ' +
          lastCell.dataset.finroomBaseText;
      }
    }

    return true;
  };

  const getLatestServerBreakEven = () =>
    latestServerBreakEven;

  window.ICARE_FINROOM_ZONE_PRESENTATION =
    Object.freeze({
      classify,
      applyZoneClass,
      ensureSignal,
      applyKnownSignal,
      applyKnownTrajectory,
      getLatestServerBreakEven
    });
})();

'use strict';

(() => {
  const access = document.getElementById('finroom-access');
  const protectedRoom = document.getElementById('finroom-protected');

  const form = document.getElementById('finroom-login-form');
  const codeInput = document.getElementById('finroom-code');
  const submit = document.getElementById('finroom-submit');
  const message = document.getElementById('finroom-login-message');

  const logout = document.getElementById('finroom-logout');

  function setMessage(text, state = '') {
    message.textContent = text;

    if (state) {
      message.dataset.state = state;
    } else {
      delete message.dataset.state;
    }
  }

  function setAuthenticated(authenticated) {
    access.hidden = authenticated;
    protectedRoom.hidden = !authenticated;

    if (!authenticated) {
      codeInput.value = '';
      codeInput.focus();
    }
  }

  async function request(url, options = {}) {
    return fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options
    });
  }

  function loadProtectedFinancialModel() {
    const model = window.ICAREFinRoomFinancialModel;

    if (model && typeof model.load === 'function') {
      return model.load();
    }

    return undefined;
  }

  function hideProtectedFinancialModel() {
    const model = window.ICAREFinRoomFinancialModel;

    if (model && typeof model.hide === 'function') {
      model.hide();
    }
  }

  async function checkSession() {
    try {
      const response = await request(
        '/api/finroom-session',
        {
          method: 'GET'
        }
      );

      setAuthenticated(response.ok);

      if (response.ok) {
        await loadProtectedFinancialModel();
      } else {
        hideProtectedFinancialModel();
      }
    } catch {
      setAuthenticated(false);
      setMessage(
        "Unable to verify the session at this time.",
        'error'
      );
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const code = codeInput.value;

    if (!code) {
      setMessage(
        "Enter your access code.",
        'error'
      );
      codeInput.focus();
      return;
    }

    submit.disabled = true;
    setMessage('Verifying…');

    try {
      const response = await request(
        '/api/finroom-login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ code })
        }
      );

      /*
       * Remove the access code from the DOM as soon as
       * the request completes, whether it succeeds or fails.
       */
      codeInput.value = '';

      if (!response.ok) {
        setAuthenticated(false);
        setMessage(
          "Incorrect code or access unavailable.",
          'error'
        );
        return;
      }

      setMessage('');
      setAuthenticated(true);
      await loadProtectedFinancialModel();

    } catch {
      codeInput.value = '';

      setMessage(
        "Unable to contact the secure service.",
        'error'
      );
    } finally {
      submit.disabled = false;
    }
  });

  logout.addEventListener('click', async () => {
    logout.disabled = true;

    try {
      await request(
        '/api/finroom-logout',
        {
          method: 'POST'
        }
      );
    } finally {
      logout.disabled = false;
      setAuthenticated(false);
      hideProtectedFinancialModel();
      setMessage('Session closed.');
    }
  });

  checkSession();
})();

/* ============================================================
 * FINROOM protected financial model binding
 * ------------------------------------------------------------
 * No financial assumptions belong in this client source.
 * Values are obtained only from authenticated /api/finroom-data.
 * ============================================================ */

(function installFinancialModelBinding() {
  'use strict';

  const root =
    document.getElementById('financial-data-root');

  const status =
    document.getElementById('financial-model-status');

  const summary =
    document.getElementById('financial-model-summary');

  const scenarios =
    document.getElementById('financial-scenarios');

  const breakEven =
    document.getElementById('financial-break-even');

  if (
    !root ||
    !status ||
    !summary ||
    !scenarios ||
    !breakEven
  ) {
    return;
  }

  function clear(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) {
      node.className = className;
    }

    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }

    return node;
  }

  function formatNumber(value) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value)
    ) {
      return '—';
    }

    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2
    }).format(value);
  }

  function formatMoney(value, currency) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value)
    ) {
      return '—';
    }

    return (
      formatNumber(value) +
      ' ' +
      (currency || '')
    ).trim();
  }

  function statusLabel(value) {
    switch (value) {
      case 'achieved':
        return 'Achieved';

      case 'current_assumption':
        return 'Current assumption';

      case 'to_validate':
        return 'To validate';

      case 'deferred':
        return 'Deferred';

      default:
        return 'Model information';
    }
  }

  function renderSummary(data) {
    clear(summary);

    const metadata = data.metadata || {};

    const card =
      element('article', 'financial-summary-card');

    card.appendChild(
      element(
        'span',
        'financial-summary-label',
        'Model status'
      )
    );

    card.appendChild(
      element(
        'strong',
        'financial-summary-value',
        statusLabel(metadata.status)
      )
    );

    const detail =
      element('p', 'financial-summary-detail');

    detail.textContent =
      [
        metadata.model_version || 'Model',
        metadata.currency || '',
        metadata.updated_at || ''
      ]
        .filter(Boolean)
        .join(' · ');

    card.appendChild(detail);
    summary.appendChild(card);
  }

  function renderScenarios(data) {
    clear(scenarios);

    const currency =
      data.metadata && data.metadata.currency;

    const heading =
      element(
        'h3',
        'financial-section-title',
        'Reference scenarios'
      );

    scenarios.appendChild(heading);

    const grid =
      element('div', 'financial-scenario-grid');

    for (const scenario of data.scenarios || []) {
      const card =
        element('article', 'financial-scenario-card');

      const mode =
        scenario.device_mode === 'icare_supplied'
          ? 'ICARE-supplied tablets'
          : 'School-owned tablets';

      card.appendChild(
        element(
          'h4',
          'financial-scenario-title',
          `${formatNumber(
            scenario.active_students
          )} active learners`
        )
      );

      card.appendChild(
        element(
          'p',
          'financial-scenario-mode',
          mode
        )
      );

      const list =
        element('dl', 'financial-metric-list');

      const metrics = [
        [
          'Classes',
          formatNumber(
            scenario.classes_required
          )
        ],
        [
          'School revenue / month',
          formatMoney(
            scenario.monthly.school_revenue,
            currency
          )
        ],
        [
          'Teacher incentives / month',
          formatMoney(
            scenario.monthly
              .school_teacher_incentives,
            currency
          )
        ],
        [
          'School contribution / month',
          formatMoney(
            scenario.monthly
              .school_contribution,
            currency
          )
        ],
        [
          'Modeled home learners',
          formatNumber(
            scenario.monthly.home_learners
          )
        ],
        [
          'Home contribution / month',
          formatMoney(
            scenario.monthly
              .home_contribution,
            currency
          )
        ],
        [
          'Combined contribution / month',
          formatMoney(
            scenario.monthly
              .combined_contribution,
            currency
          )
        ],
        [
          'Initial CAPEX',
          formatMoney(
            scenario.capex.total_initial,
            currency
          )
        ],
        [
          'Simple CAPEX coverage',
          scenario.indicators
            .simple_capex_coverage_months === null
            ? '—'
            : (
                formatNumber(
                  scenario.indicators
                    .simple_capex_coverage_months
                ) + ' months'
              )
        ]
      ];

      for (const [label, value] of metrics) {
        const dt = element('dt', '', label);
        const dd = element('dd', '', value);

        list.appendChild(dt);
        list.appendChild(dd);
      }

      card.appendChild(list);

      card.appendChild(
        element(
          'p',
          'financial-model-warning',
          scenario.device_mode === 'icare_supplied'
            ? (
                'Contribution figures are calculated after teacher ' +
                'incentives but before other unvalidated variable ' +
                'costs. For ICARE-supplied tablets, device lifecycle ' +
                'costs such as replacement, breakage, maintenance ' +
                'and financing are not yet included. Simple CAPEX ' +
                'coverage is therefore a modeled capital-coverage ' +
                'indicator, not a net-margin or payback measure.'
              )
            : (
                'Contribution figures are calculated after teacher ' +
                'incentives but before other unvalidated variable ' +
                'costs.'
              )
        )
      );

      grid.appendChild(card);
    }

    scenarios.appendChild(grid);
  }

  function renderBreakEven(data) {
    clear(breakEven);

    breakEven.appendChild(
      element(
        'h3',
        'financial-section-title',
        'Modeled operating break-even'
      )
    );

    const values = data.break_even || {};

    const grid =
      element('div', 'financial-break-even-grid');

    const rows = [
      [
        'Current structure · school only',
        values.current_school_owned_school_only
      ],
      [
        'Current structure · with modeled home continuity',
        values.current_school_owned_with_home
      ],
      [
        'Expanded structure · school only',
        values.expanded_school_owned_school_only
      ],
      [
        'Expanded structure · with modeled home continuity',
        values.expanded_school_owned_with_home
      ]
    ];

    for (const [label, value] of rows) {
      const card =
        element('article', 'financial-break-even-card');

      card.appendChild(
        element(
          'span',
          'financial-break-even-label',
          label
        )
      );

      card.appendChild(
        element(
          'strong',
          'financial-break-even-value',
          `${formatNumber(value)} active learners`
        )
      );

      grid.appendChild(card);
    }

    breakEven.appendChild(grid);

    breakEven.appendChild(
      element(
        'p',
        'financial-model-warning',
        'Break-even values are modeled operating scenarios. ' +
        'They do not yet include every unvalidated variable cost. ' +
        'Break-even for ICARE-supplied tablets is deferred until ' +
        'device lifecycle costs are validated.'
      )
    );
  }

  function renderFinancialModel(data) {
    renderSummary(data);
    renderScenarios(data);
    renderBreakEven(data);

    status.textContent = 'Protected model loaded';
    root.hidden = false;
  }

  function hideFinancialModel() {
    root.hidden = true;
    clear(summary);
    clear(scenarios);
    clear(breakEven);
  }

  async function loadFinancialModel() {
    status.textContent =
      'Loading protected financial model…';

    try {
      const response = await fetch(
        '/api/finroom-data',
        {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Accept: 'application/json'
          }
        }
      );

      if (response.status === 401) {
        hideFinancialModel();
        status.textContent =
          'Authentication required';
        return;
      }

      if (response.status === 503) {
        hideFinancialModel();
        status.textContent =
          'Financial model temporarily unavailable';
        return;
      }

      if (!response.ok) {
        hideFinancialModel();
        status.textContent =
          'Unable to load financial model';
        return;
      }

      const payload = await response.json();

      if (
        !payload ||
        payload.ok !== true ||
        !payload.data
      ) {
        throw new Error(
          'Invalid financial model response'
        );
      }

      renderFinancialModel(payload.data);
    } catch {
      hideFinancialModel();
      status.textContent =
        'Unable to load financial model';
    }
  }

  window.ICAREFinRoomFinancialModel = {
    load: loadFinancialModel,
    hide: hideFinancialModel
  };

  /*
   * Existing session code remains the authority.
   * Initial load is safe because the endpoint itself enforces
   * authentication before accessing the private model.
   */
  loadFinancialModel();
})();

/*
 * FINROOM-12H-F3-B
 * Interactive simulation controls and server request adapter.
 *
 * Financial calculations remain exclusively server-authoritative.
 * This client only validates UI shape, serializes explicit ephemeral
 * controls, sends them to /api/finroom-simulate and exposes the
 * returned payload for later rendering gates.
 */
(() => {
  'use strict';

  const lab = document.getElementById('finroom-interactive-lab');
  const form = document.getElementById('finroom-simulation-form');
  const status = document.getElementById('finroom-simulation-status');

  if (!lab || !form || !status) {
    return;
  }

  const activeStudents =
    document.getElementById('sim-active-students');
  const deviceMode =
    document.getElementById('sim-device-mode');
  const homeEnabled =
    document.getElementById('sim-home-enabled');
  const homeConversion =
    document.getElementById('sim-home-conversion');
  const costStructure =
    document.getElementById('sim-cost-structure');
  const horizon =
    document.getElementById('sim-horizon');
  const growthMode =
    document.getElementById('sim-growth-mode');
  const growthRate =
    document.getElementById('sim-growth-rate');
  const growthRateGroup =
    document.getElementById('sim-growth-rate-group');
  const manualPath =
    document.getElementById('sim-manual-path');
  const manualPathGroup =
    document.getElementById('sim-manual-path-group');
  const submitButton =
    document.getElementById('finroom-run-simulation');

  function setSimulatorStatus(state, message) {
    status.dataset.state = state;
    status.textContent = message || '';
  }

  function integerValue(input, label) {
    const value = Number(input.value);

    if (!Number.isInteger(value) || value < 1) {
      throw new Error(label + ' must be a positive integer.');
    }

    return value;
  }

  function percentFraction(input, label) {
    const value = Number(input.value);

    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(label + ' must be between 0 and 100.');
    }

    return value / 100;
  }

  function parseManualPath(expectedLength, initialStudents) {
    const values = manualPath.value
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map(Number);

    if (values.length !== expectedLength) {
      throw new Error(
        'Manual path must contain exactly ' +
        expectedLength +
        ' monthly values.'
      );
    }

    if (
      values.some(
        (value) => !Number.isInteger(value) || value < 1
      )
    ) {
      throw new Error(
        'Every manual-path learner count must be a positive integer.'
      );
    }

    if (values[0] !== initialStudents) {
      throw new Error(
        'The first manual-path value must equal active learners.'
      );
    }

    return values;
  }

  function syncConditionalControls() {
    const mode = growthMode.value;

    const rateActive = mode === 'modeled_growth_rate';
    const pathActive = mode === 'manual_monthly_path';

    growthRateGroup.hidden = !rateActive;
    manualPathGroup.hidden = !pathActive;

    growthRate.disabled = !rateActive;
    manualPath.disabled = !pathActive;

    homeConversion.disabled = !homeEnabled.checked;
  }

  function buildTrajectoryRequest() {
    const students =
      integerValue(activeStudents, 'Active learners');

    const months =
      integerValue(horizon, 'Horizon');

    const conversion =
      homeEnabled.checked
        ? percentFraction(
            homeConversion,
            'Home conversion rate'
          )
        : 0;

    const request = {
      operation: 'trajectory',

      overrides: {
        active_students: students,
        device_mode: deviceMode.value,
        home_enabled: homeEnabled.checked,
        home_conversion_rate: conversion,
        cost_structure: costStructure.value
      },

      options: {
        horizon_months: months,
        growth_mode: growthMode.value
      }
    };

    if (growthMode.value === 'modeled_growth_rate') {
      const rate = Number(growthRate.value);

      if (
        !Number.isFinite(rate) ||
        rate < -99 ||
        rate > 1000
      ) {
        throw new Error(
          'Monthly growth rate must be between -99% and 1000%.'
        );
      }

      request.options.monthly_growth_rate = rate / 100;
    }

    if (growthMode.value === 'manual_monthly_path') {
      request.options.monthly_growth_rate = 0;
      request.options.manual_monthly_path =
        parseManualPath(months, students);
    }

    return request;
  }

  async function requestFinroomSimulation(payload) {
    const response = await fetch(
      '/api/finroom-simulate',
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    let data = null;

    try {
      data = await response.json();
    } catch (_error) {
      throw new Error(
        response.ok
          ? 'Simulation response is invalid.'
          : 'Simulation service is unavailable.'
      );
    }

    if (!response.ok) {
      const error = new Error(
        response.status === 401
          ? 'Authentication required.'
          : response.status === 503
            ? 'Simulation service is unavailable.'
            : 'Simulation request was rejected.'
      );

      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  }

  async function submitTrajectory(event) {
    event.preventDefault();

    let payload;

    try {
      payload = buildTrajectoryRequest();
    } catch (error) {
      setSimulatorStatus(
        'rejected',
        error.message
      );
      return;
    }

    submitButton.disabled = true;

    setSimulatorStatus(
      'submitting',
      'Running server-authoritative simulation…'
    );

    try {
      const result =
        await requestFinroomSimulation(payload);

      setSimulatorStatus(
        'ready',
        'Simulation completed. Result rendering is being prepared.'
      );

      document.dispatchEvent(
        new CustomEvent(
          'icare:finroom-simulation-ready',
          { detail: result }
        )
      );
    } catch (error) {
      setSimulatorStatus(
        error.status === 503
          ? 'unavailable'
          : 'rejected',
        error.message
      );
    } finally {
      submitButton.disabled = false;
    }
  }

  growthMode.addEventListener(
    'change',
    syncConditionalControls
  );

  homeEnabled.addEventListener(
    'change',
    syncConditionalControls
  );

  form.addEventListener(
    'submit',
    submitTrajectory
  );

  syncConditionalControls();

  /*
   * The laboratory is displayed only when the existing protected
   * FinRoom client has made the protected room visible.
   * MutationObserver avoids changing the existing auth/data lifecycle.
   */
  const protectedRoom =
    document.getElementById('finroom-protected');

  if (protectedRoom) {
    const syncLabVisibility = () => {
      lab.hidden = protectedRoom.hidden;
    };

    syncLabVisibility();

    new MutationObserver(syncLabVisibility).observe(
      protectedRoom,
      {
        attributes: true,
        attributeFilter: ['hidden']
      }
    );
  }
})();

/*
 * FINROOM-12H-F3-C2
 * Current financial snapshot.
 *
 * All displayed financial values originate in the authenticated
 * server-authoritative single_simulation response.
 */
(() => {
  'use strict';

  const button =
    document.getElementById('finroom-run-snapshot');

  const summary =
    document.getElementById('finroom-simulation-summary');

  const status =
    document.getElementById('finroom-simulation-status');

  if (!button || !summary || !status) {
    return;
  }

  const activeStudents =
    document.getElementById('sim-active-students');
  const deviceMode =
    document.getElementById('sim-device-mode');
  const homeEnabled =
    document.getElementById('sim-home-enabled');
  const homeConversion =
    document.getElementById('sim-home-conversion');
  const costStructure =
    document.getElementById('sim-cost-structure');

  function setStatus(state, message) {
    status.dataset.state = state;
    status.textContent = message || '';
  }

  function positiveInteger(input, label) {
    const value = Number(input.value);

    if (!Number.isInteger(value) || value < 1) {
      throw new Error(
        label + ' must be a positive integer.'
      );
    }

    return value;
  }

  function conversionFraction() {
    if (!homeEnabled.checked) {
      return 0;
    }

    const value = Number(homeConversion.value);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      throw new Error(
        'Home conversion rate must be between 0 and 100.'
      );
    }

    return value / 100;
  }

  function buildSingleSimulationRequest() {
    return {
      operation: 'single_simulation',
      overrides: {
        active_students:
          positiveInteger(
            activeStudents,
            'Active learners'
          ),
        device_mode: deviceMode.value,
        home_enabled: homeEnabled.checked,
        home_conversion_rate:
          conversionFraction(),
        cost_structure: costStructure.value
      }
    };
  }

  async function requestSingleSimulation(payload) {
    const response = await fetch(
      '/api/finroom-simulate',
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    let parsed;

    try {
      parsed = await response.json();
    } catch (_error) {
      throw new Error(
        'Simulation service returned an invalid response.'
      );
    }

    if (!response.ok) {
      const error = new Error(
        response.status === 401
          ? 'Authentication required.'
          : response.status === 503
            ? 'Simulation service is unavailable.'
            : 'Simulation request was rejected.'
      );

      error.status = response.status;
      throw error;
    }

    if (
      parsed.ok !== true ||
      parsed.operation !== 'single_simulation' ||
      !parsed.data ||
      typeof parsed.data !== 'object'
    ) {
      throw new Error(
        'Unexpected single-simulation response.'
      );
    }

    return parsed.data;
  }

  function money(value) {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return 'Not modeled';
    }

    return (
      new Intl.NumberFormat(
        'en-US',
        { maximumFractionDigits: 0 }
      ).format(Number(value)) +
      ' FCFA'
    );
  }

  function number(value) {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return 'Not available';
    }

    return new Intl.NumberFormat(
      'en-US',
      { maximumFractionDigits: 2 }
    ).format(Number(value));
  }

  function text(value, fallback='Not available') {
    return (
      typeof value === 'string' && value.trim()
        ? value
        : fallback
    );
  }

  function metric(label, value, note='') {
    const article=document.createElement('article');
    article.className='finroom-result-card';

    const title=document.createElement('h3');
    title.textContent=label;

    const output=document.createElement('p');
    output.className='finroom-result-value';
    output.textContent=value;

    article.append(title,output);

    if (note) {
      const detail=document.createElement('p');
      detail.className='finroom-result-note';
      detail.textContent=note;
      article.append(detail);
    }

    return article;
  }

  function section(titleText) {
    const node=document.createElement('section');
    node.className='finroom-result-section';

    const title=document.createElement('h3');
    title.textContent=titleText;

    const grid=document.createElement('div');
    grid.className='finroom-result-grid';

    node.append(title,grid);

    return {node,grid};
  }

  function renderSingleSimulation(data) {
    const scenario =
      data.scenario && typeof data.scenario === 'object'
        ? data.scenario
        : {};

    const monthly =
      scenario.monthly &&
      typeof scenario.monthly === 'object'
        ? scenario.monthly
        : {};

    const capex =
      scenario.capex &&
      typeof scenario.capex === 'object'
        ? scenario.capex
        : {};

    const inputs =
      data.inputs && typeof data.inputs === 'object'
        ? data.inputs
        : {};

    const operating =
      data.operating_costs &&
      typeof data.operating_costs === 'object'
        ? data.operating_costs
        : {};

    const coverage =
      data.coverage &&
      typeof data.coverage === 'object'
        ? data.coverage
        : {};

    const semantics =
      data.semantics &&
      typeof data.semantics === 'object'
        ? data.semantics
        : {};

    summary.replaceChildren();

    const zoneActiveStudents =
      scenario.active_students ??
      inputs.active_students;

    if (Number.isFinite(Number(zoneActiveStudents))) {
      summary.dataset.finroomActiveStudents =
        String(Number(zoneActiveStudents));
    } else {
      delete summary.dataset.finroomActiveStudents;
    }

    summary.dataset.finroomDeviceMode =
      String(inputs.device_mode ?? '');

    summary.dataset.finroomCostStructure =
      String(inputs.cost_structure ?? '');

    summary.dataset.finroomHomeEnabled =
      String(inputs.home_enabled ?? '');

    summary.dataset.finroomHomeConversionRate =
      String(inputs.home_conversion_rate ?? '');

    const heading=document.createElement('div');
    heading.className='finroom-result-heading';

    const eyebrow=document.createElement('p');
    eyebrow.className='eyebrow';
    eyebrow.textContent='SIMULATION';

    const h2=document.createElement('h2');
    h2.textContent='Current financial snapshot';

    const explanation=document.createElement('p');
    explanation.textContent=
      'Server-calculated monthly snapshot based on the explicit ' +
      'scenario assumptions above. It is not a forecast or achieved evidence.';

    heading.append(eyebrow,h2,explanation);
    summary.append(heading);

    const context=section('Scenario');

    context.grid.append(
      metric(
        'Active learners',
        number(
          scenario.active_students ??
          inputs.active_students
        )
      ),
      metric(
        'Classes required',
        number(scenario.classes_required),
        'Modeled class count derived from the class-size assumption in the protected model; not observed school structure.'
      ),
      metric(
        'Device mode',
        text(inputs.device_mode)
      ),
      metric(
        'Cost structure',
        text(inputs.cost_structure)
      )
    );

    summary.append(context.node);

    const revenue=section('Monthly revenue and teacher costs');

    revenue.grid.append(
      metric(
        'School revenue',
        money(monthly.school_revenue)
      ),
      metric(
        'Home revenue',
        money(monthly.home_revenue)
      ),
      metric(
        'School teacher incentives',
        money(monthly.school_teacher_incentives),
        'Total modeled school-teacher incentive pool across the subjects included in the protected model; not one teacher salary.'
      ),
      metric(
        'Home teacher costs',
        money(monthly.home_teacher_cost),
        'Total modeled teacher cost for home learners across the subjects included in the protected model.'
      )
    );

    summary.append(revenue.node);

    const contribution=section('Monthly contribution');

    contribution.grid.append(
      metric(
        'School contribution',
        money(monthly.school_contribution),
        'Contribution, not net profit.'
      ),
      metric(
        'Home contribution',
        money(monthly.home_contribution),
        'Contribution, not net profit.'
      ),
      metric(
        'Combined contribution',
        money(monthly.combined_contribution),
        'Contribution, not net profit.'
      ),
      metric(
        'Contribution used for coverage',
        money(coverage.contribution_for_coverage)
      )
    );

    summary.append(contribution.node);

    const operations=section('Operating coverage');

    let breakEven='Not modeled';

    if (coverage.monthly_break_even === true) {
      breakEven='Reached for this monthly snapshot';
    } else if (coverage.monthly_break_even === false) {
      breakEven='Not reached for this monthly snapshot';
    }

    operations.grid.append(
      metric(
        'Fixed monthly operating costs',
        money(operating.fixed_monthly)
      ),
      metric(
        'Monthly operating coverage gap',
        money(coverage.monthly_coverage_gap)
      ),
      metric(
        'Monthly operating break-even',
        breakEven
      ),
      metric(
        'Progressive cost status',
        text(
          operating.progressive_status,
          'Not available'
        )
      )
    );

    summary.append(operations.node);

    const zonePending =
      document.createElement('div');

    zonePending.className =
      'finroom-zone-signal finroom-zone-signal-pending';

    zonePending.setAttribute('role', 'status');

    zonePending.textContent =
      'Colored position: generate the break-even graph to ' +
      'classify this snapshot using the exact server threshold.';

    summary.append(zonePending);

    /*
     * The graph request may have completed before this snapshot.
     * If so, reuse the cached exact SERVER threshold for this same
     * scenario and replace the temporary pending signal immediately.
     */
    window
      .ICARE_FINROOM_ZONE_PRESENTATION
      ?.applyKnownSignal(
        summary,
        zoneActiveStudents
      );

    const hardware=section('Hardware CAPEX');

    hardware.grid.append(
      metric(
        'Box CAPEX',
        money(capex.box)
      ),
      metric(
        'Tablet CAPEX',
        money(capex.tablets)
      ),
      metric(
        'Total CAPEX',
        money(capex.total_initial)
      ),
      metric(
        'Simple CAPEX coverage',
        scenario.indicators?.simple_capex_coverage_months == null
          ? 'Not modeled'
          : number(
              scenario.indicators?.simple_capex_coverage_months
            ) + ' months',
        'Coverage indicator only — not ROI or payback.'
      )
    );

    summary.append(hardware.node);

    const semanticNote=document.createElement('div');
    semanticNote.className='finroom-semantic-note';

    const semanticTitle=document.createElement('h3');
    semanticTitle.textContent='How to read this result';

    const semanticText=document.createElement('p');

    const resultStatus =
      semantics.result_status === 'simulation'
        ? 'SIMULATION'
        : 'Result';

    semanticText.textContent=
      resultStatus +
      ': contribution is not net margin; CAPEX coverage is not ' +
      'payback or ROI. Missing or deferred values are shown as ' +
      'not modeled rather than reconstructed in the browser.';

    semanticNote.append(
      semanticTitle,
      semanticText
    );

    summary.append(semanticNote);
  }

  async function runSnapshot() {
    let payload;

    try {
      payload=buildSingleSimulationRequest();
    } catch (error) {
      setStatus('rejected',error.message);
      return;
    }

    button.disabled=true;

    setStatus(
      'submitting',
      'Calculating current server-authoritative snapshot…'
    );

    try {
      const data=
        await requestSingleSimulation(payload);

      renderSingleSimulation(data);

      setStatus(
        'ready',
        'Current financial snapshot calculated.'
      );
    } catch (error) {
      setStatus(
        error.status === 503
          ? 'unavailable'
          : 'rejected',
        error.message
      );
    } finally {
      button.disabled=false;
    }
  }

  button.addEventListener(
    'click',
    runSnapshot
  );
})();

/*
 * FINROOM-12H-F3-D2
 * Trajectory presentation adapter.
 *
 * Financial semantics remain server-authoritative.
 * This client only formats values already returned by the server.
 */
(() => {
  const trajectoryRoot =
    document.getElementById('finroom-trajectory-result');

  const trajectorySummary =
    document.getElementById('finroom-trajectory-summary');

  const trajectoryBody =
    document.getElementById('finroom-trajectory-body');

  const trajectoryNotes =
    document.getElementById('finroom-trajectory-notes');

  if (
    !trajectoryRoot ||
    !trajectorySummary ||
    !trajectoryBody ||
    !trajectoryNotes
  ) {
    return;
  }

  const money = (value) => {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return 'Not modeled';
    }

    return new Intl.NumberFormat(
      'en-US',
      {
        style: 'currency',
        currency: 'XAF',
        maximumFractionDigits: 0
      }
    ).format(Number(value));
  };

  const number = (value) => {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return 'Not available';
    }

    return new Intl.NumberFormat('en-US').format(Number(value));
  };

  const clear = (node) => {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  };

  const card = (label, value, note = '') => {
    const article = document.createElement('article');
    article.className = 'finroom-result-card';

    const title = document.createElement('h3');
    title.textContent = label;

    const output = document.createElement('p');
    output.className = 'finroom-result-value';
    output.textContent = value;

    article.append(title, output);

    if (note) {
      const detail = document.createElement('p');
      detail.className = 'finroom-result-note';
      detail.textContent = note;
      article.appendChild(detail);
    }

    return article;
  };

  const cell = (row, value) => {
    const td = document.createElement('td');
    td.textContent = value;
    row.appendChild(td);
  };

  const renderTrajectory = (envelope) => {
    if (
      !envelope ||
      envelope.operation !== 'trajectory' ||
      !envelope.data ||
      envelope.data.kind !== 'financial_trajectory'
    ) {
      return;
    }

    const data = envelope.data;
    const semantics = data.semantics || {};
    const summary = data.summary || {};
    const inputs = data.inputs || {};

    trajectoryRoot.dataset.finroomDeviceMode =
      String(inputs.device_mode ?? '');

    trajectoryRoot.dataset.finroomCostStructure =
      String(inputs.cost_structure ?? '');

    trajectoryRoot.dataset.finroomHomeEnabled =
      String(inputs.home_enabled ?? '');

    trajectoryRoot.dataset.finroomHomeConversionRate =
      String(inputs.home_conversion_rate ?? '');

    const months = Array.isArray(data.months)
      ? data.months
      : [];

    clear(trajectorySummary);
    clear(trajectoryBody);
    clear(trajectoryNotes);

    trajectorySummary.append(
      card(
        'Horizon',
        number(summary.horizon_months) + ' months',
        'Exact simulation horizon returned by the server.'
      ),
      card(
        'Ending active learners',
        number(summary.ending_active_students),
        'Scenario population at the end of the horizon.'
      ),
      card(
        'Monthly operating break-even',
        summary.monthly_break_even_month === null ||
        summary.monthly_break_even_month === undefined
          ? 'Not reached'
          : 'Month ' + number(summary.monthly_break_even_month),
        'First month where modeled monthly contribution covers modeled operating costs.'
      ),
      card(
        'Cumulative recovery',
        summary.cumulative_recovery_month === null ||
        summary.cumulative_recovery_month === undefined
          ? 'Not reached'
          : 'Month ' + number(summary.cumulative_recovery_month),
        'Separate from monthly break-even; includes cumulative hardware CAPEX.'
      ),
      card(
        'Ending monthly coverage gap',
        money(summary.ending_monthly_coverage_gap),
        'Contribution minus modeled operating costs for the final month.'
      ),
      card(
        'Ending cumulative coverage',
        money(summary.ending_cumulative_coverage_gap),
        'Cumulative operating gap after cumulative hardware CAPEX.'
      )
    );

    for (const month of months) {
      const tr = document.createElement('tr');

      if (Number.isFinite(Number(month.active_students))) {
        tr.dataset.finroomActiveStudents =
          String(Number(month.active_students));
      }

      if (month.monthly_break_even === true) {
        tr.classList.add('is-monthly-break-even');
      }

      cell(tr, number(month.month));
      cell(tr, number(month.active_students));
      cell(tr, number(month.classes_required));
      cell(tr, money(month.school_revenue));
      cell(tr, money(month.home_revenue));
      cell(tr, money(month.total_revenue));
      cell(
        tr,
        money(month.school_teacher_incentives)
      );
      cell(
        tr,
        money(month.home_teacher_cost)
      );
      cell(tr, money(month.combined_contribution));
      cell(tr, money(month.fixed_operating_costs));
      cell(tr, money(month.monthly_coverage_gap));
      cell(tr, money(month.cumulative_operating_gap));
      cell(tr, money(month.hardware_capex));
      cell(tr, money(month.cumulative_capex));
      cell(tr, money(month.cumulative_coverage_gap));
      cell(
        tr,
        month.monthly_break_even === true
          ? 'Reached'
          : 'Not reached'
      );

      trajectoryBody.appendChild(tr);
    }

    const notes = [];

    notes.push(
      'SIMULATION — this trajectory is not a forecast.'
    );

    if (semantics.growth_is_sensitivity === true) {
      notes.push(
        'The modeled growth rate is a sensitivity assumption, not a customer-acquisition prediction.'
      );
    }

    if (inputs.growth_mode === 'manual_monthly_path') {
      notes.push(
        'The learner path is an explicit user-supplied scenario path.'
      );
    }

    if (semantics.recruitment_creates_revenue === false) {
      notes.push(
        'Recruitment does not automatically create learners or revenue.'
      );
    }

    if (semantics.contribution_is_net_margin === false) {
      notes.push(
        'Contribution is not profit or net margin.'
      );
    }

    if (
      semantics.monthly_break_even_is_cumulative_recovery === false
    ) {
      notes.push(
        'Monthly operating break-even and cumulative recovery are distinct.'
      );
    }

    if (semantics.device_lifecycle_costs_complete === false) {
      notes.push(
        'TO VALIDATE — device lifecycle costs are not fully modeled.'
      );
    }

    if (
      months.some(
        (month) => month.modeled_variable_costs === null
      )
    ) {
      notes.push(
        'TO VALIDATE — some variable operating costs are not yet modeled.'
      );
    }

    trajectoryNotes.textContent = notes.join(' ');

    /*
     * If break-even finished before trajectory rendering, restore
     * the operating-zone presentation from the cached exact SERVER
     * threshold for the matching scenario.
     */
    window
      .ICARE_FINROOM_ZONE_PRESENTATION
      ?.applyKnownTrajectory(
        trajectoryRoot
      );

    trajectoryRoot.hidden = false;
  };

  document.addEventListener(
    'icare:finroom-simulation-ready',
    (event) => {
      renderTrajectory(event.detail);
    }
  );
})();

/*
 * FinRoom sensitivity UI.
 *
 * Presentation/input shaping only.
 * All financial totals and deltas are calculated by the server.
 */
(() => {
  const form =
    document.getElementById('finroom-sensitivity-form');

  if (!form) {
    return;
  }

  const status =
    document.getElementById('finroom-sensitivity-status');

  const result =
    document.getElementById('finroom-sensitivity-result');

  const cards =
    document.getElementById('finroom-sensitivity-cards');

  const body =
    document.getElementById('finroom-sensitivity-body');

  const notes =
    document.getElementById('finroom-sensitivity-notes');

  const money = value => {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return 'Not modeled';
    }

    return new Intl.NumberFormat(
      'en-US',
      {
        maximumFractionDigits: 0
      }
    ).format(Number(value)) + ' FCFA';
  };

  const text = value =>
    value === null || value === undefined
      ? 'Not modeled'
      : String(value);

  const node = (tag, className, content) => {
    const el = document.createElement(tag);

    if (className) {
      el.className = className;
    }

    if (content !== undefined) {
      el.textContent = content;
    }

    return el;
  };

  /*
   * ICARE FINROOM E2-D4M-B2 — sensitivity per-scenario server break-even.
   *
   * Every sensitivity scenario receives its OWN exact operating
   * break-even from the existing server-authoritative break_even_graph
   * operation. No threshold is derived from sensitivity totals, deltas,
   * trajectory points or browser interpolation.
   */
  const requestScenarioBreakEven = async scenario => {
    const inputs =
      scenario &&
      scenario.inputs &&
      typeof scenario.inputs === 'object'
        ? scenario.inputs
        : {};

    /*
     * break_even_graph V1 supports only current / expanded.
     * Unsupported structures remain visibly unclassified rather
     * than receiving a misleading threshold.
     */
    if (
      inputs.cost_structure !== 'current' &&
      inputs.cost_structure !== 'expanded'
    ) {
      return {
        scenario_id: scenario?.id ?? null,
        available: false,
        reason: 'unsupported_cost_structure',
        threshold: null
      };
    }

    const conversion =
      Number(inputs.home_conversion_rate);

    const overrides = {
      device_mode:
        inputs.device_mode,

      home_enabled:
        inputs.home_enabled === true,

      home_conversion_rate:
        Number.isFinite(conversion)
          ? conversion
          : 0,

      cost_structure:
        inputs.cost_structure
    };

    const response =
      await fetch(
        '/api/finroom-simulate',
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            operation:
              'break_even_graph',
            overrides
          })
        }
      );

    let envelope = null;

    try {
      envelope =
        await response.json();
    } catch {
      envelope = null;
    }

    if (
      !response.ok ||
      !envelope ||
      envelope.ok !== true ||
      envelope.operation !==
        'break_even_graph' ||
      !envelope.data ||
      envelope.data.kind !==
        'break_even_graph'
    ) {
      return {
        scenario_id: scenario?.id ?? null,
        available: false,
        reason:
          'server_break_even_unavailable',
        threshold: null
      };
    }

    const threshold =
      Number(
        envelope.data
          ?.break_even
          ?.active_students
      );

    if (
      !Number.isInteger(threshold) ||
      threshold < 1
    ) {
      return {
        scenario_id: scenario?.id ?? null,
        available: false,
        reason:
          'exact_threshold_unavailable',
        threshold: null
      };
    }

    return {
      scenario_id: scenario.id,
      available: true,
      reason: null,
      threshold,
      within_requested_range:
        envelope.data
          ?.break_even
          ?.within_requested_range === true,
      overrides
    };
  };

  const loadScenarioBreakEvens =
    async sensitivityData => {
      const map = new Map();

      const scenarios =
        Array.isArray(
          sensitivityData?.results
        )
          ? sensitivityData.results
          : [];

      const records =
        await Promise.all(
          scenarios.map(async scenario => {
            try {
              return await requestScenarioBreakEven(
                scenario
              );
            } catch {
              return {
                scenario_id:
                  scenario?.id ?? null,
                available: false,
                reason:
                  'break_even_request_failed',
                threshold: null
              };
            }
          })
        );

      for (const record of records) {
        if (
          record &&
          record.scenario_id
        ) {
          map.set(
            record.scenario_id,
            record
          );
        }
      }

      return map;
    };

  const readReferenceOptions = () => {
    const active =
      document.getElementById('sim-active-students');

    const device =
      document.getElementById('sim-device-mode');

    const homeEnabled =
      document.getElementById('sim-home-enabled');

    const conversion =
      document.getElementById('sim-home-conversion');

    const cost =
      document.getElementById('sim-cost-structure');

    const horizon =
      document.getElementById('sim-horizon');

    const growth =
      document.getElementById('sim-growth-mode');

    const growthRate =
      document.getElementById('sim-growth-rate');

    if (
      !active ||
      !device ||
      !homeEnabled ||
      !conversion ||
      !cost ||
      !horizon ||
      !growth
    ) {
      throw new Error('reference_controls_unavailable');
    }

    const options = {
      initial_active_students: Number(active.value),
      device_mode: device.value,
      home_enabled: homeEnabled.checked,
      home_conversion_rate:
        homeEnabled.checked
          ? Number(conversion.value) / 100
          : 0,
      cost_structure: cost.value,
      horizon_months: Number(horizon.value),
      growth_mode: growth.value
    };

    if (growth.value === 'modeled_growth_rate') {
      const rate = Number(growthRate.value);

      if (
        !Number.isFinite(rate) ||
        rate < -99 ||
        rate > 1000
      ) {
        throw new Error(
          'Monthly growth rate must be between -99% and 1000%.'
        );
      }

      options.monthly_growth_rate = rate / 100;
    }

    if (growth.value === 'manual_monthly_path') {
      const path =
        document.getElementById('sim-manual-path');

      options.manual_monthly_path =
        String(path ? path.value : '')
          .split(/[\s,;]+/)
          .filter(Boolean)
          .map(Number);
    }

    return options;
  };

  const syncVariantDefaults = () => {
    try {
      const reference = readReferenceOptions();

      const active =
        document.getElementById('sens-active-students');

      const device =
        document.getElementById('sens-device-mode');

      const conversion =
        document.getElementById('sens-home-conversion');

      const cost =
        document.getElementById('sens-cost-structure');

      if (active && !active.value) {
        active.value =
          reference.initial_active_students;
      }

      if (device) {
        device.value = reference.device_mode;
      }

      if (conversion && !conversion.value) {
        conversion.value =
          reference.home_conversion_rate * 100;
      }

      if (
        cost &&
        (
          reference.cost_structure === 'current' ||
          reference.cost_structure === 'expanded'
        )
      ) {
        cost.value = reference.cost_structure;
      }
    } catch {
      /* Defaults are convenience only. */
    }
  };

  const buildVariantOptions = reference => {
    const active =
      Number(
        document.getElementById(
          'sens-active-students'
        ).value
      );

    const conversion =
      Number(
        String(
          document.getElementById(
            'sens-home-conversion'
          ).value
        )
          .trim()
          .replace(',', '.')
      );

    const rate =
      Number(
        String(
          document.getElementById(
            'sens-growth-rate'
          ).value
        )
          .trim()
          .replace(',', '.')
      );

    if (!Number.isInteger(active) || active < 1) {
      throw new Error('invalid_variant_active_students');
    }

    if (
      !Number.isFinite(conversion) ||
      conversion < 0 ||
      conversion > 100
    ) {
      throw new Error('invalid_variant_home_conversion');
    }

    if (
      !Number.isFinite(rate) ||
      rate < -99 ||
      rate > 1000
    ) {
      throw new Error('invalid_variant_growth_rate');
    }

    return {
      initial_active_students: active,
      device_mode:
        document.getElementById(
          'sens-device-mode'
        ).value,
      home_enabled: reference.home_enabled,
      home_conversion_rate:
        reference.home_enabled
          ? conversion / 100
          : 0,
      cost_structure:
        document.getElementById(
          'sens-cost-structure'
        ).value,
      horizon_months: reference.horizon_months,
      growth_mode:
        rate === 0
          ? 'constant_students'
          : 'modeled_growth_rate',
      monthly_growth_rate: rate / 100
    };
  };

  const render = (
    data,
    breakEvenByScenario = new Map()
  ) => {
    if (
      !data ||
      data.kind !== 'financial_sensitivity_analysis' ||
      data.authority !== 'server' ||
      !Array.isArray(data.results) ||
      !Array.isArray(data.comparisons)
    ) {
      throw new Error('invalid_sensitivity_response');
    }

    cards.replaceChildren();
    body.replaceChildren();
    notes.replaceChildren();

    const baselineId = data.baseline_scenario_id;

    for (const scenario of data.results) {
      const card =
        node('article', 'finroom-sensitivity-card');

      const title =
        node(
          'h4',
          '',
          scenario.label || scenario.id
        );

      card.appendChild(title);

      if (scenario.id === baselineId) {
        card.appendChild(
          node(
            'p',
            'finroom-reference-label',
            'Technical reference — not a recommendation'
          )
        );
      }

      const breakEvenRecord =
        breakEvenByScenario.get(
          scenario.id
        );

      const endingActiveStudents =
        Number(
          scenario.summary
            ?.ending_active_students ??
          scenario.inputs
            ?.initial_active_students
        );

      const zoneApi =
        window
          .ICARE_FINROOM_ZONE_PRESENTATION;

      let scenarioZone = null;

      if (
        breakEvenRecord
          ?.available === true &&
        zoneApi &&
        Number.isFinite(
          endingActiveStudents
        )
      ) {
        scenarioZone =
          zoneApi.classify(
            endingActiveStudents,
            breakEvenRecord.threshold
          );

        if (scenarioZone) {
          zoneApi.applyZoneClass(
            card,
            scenarioZone
          );
        }
      }

      const zoneSignal =
        node(
          'div',
          'finroom-sensitivity-zone-signal',
          ''
        );

      zoneSignal.setAttribute(
        'role',
        'status'
      );

      if (
        scenarioZone &&
        breakEvenRecord
          ?.available === true
      ) {
        zoneSignal.classList.add(
          'finroom-zone-' +
          scenarioZone.key
        );

        zoneSignal.textContent =
          scenarioZone.label +
          ' — ' +
          scenarioZone.detail +
          ' · ' +
          new Intl.NumberFormat(
            'en-US'
          ).format(
            endingActiveStudents
          ) +
          ' / ' +
          new Intl.NumberFormat(
            'en-US'
          ).format(
            breakEvenRecord.threshold
          ) +
          ' active learners.';
      } else {
        zoneSignal.classList.add(
          'finroom-zone-signal-pending'
        );

        zoneSignal.textContent =
          'Position relative to break-even: exact threshold unavailable for this scenario.';
      }

      card.appendChild(zoneSignal);

      const list = node('dl', 'finroom-result-list');

      const pairs = [
        [
          'Ending active learners',
          scenario.summary?.ending_active_students
        ],
        [
          'Exact monthly operating break-even',
          breakEvenRecord?.available === true
            ? breakEvenRecord.threshold
            : null
        ],
        ['Total revenue', scenario.totals?.total_revenue],
        [
          'Combined contribution',
          scenario.totals?.combined_contribution
        ],
        [
          'Operating costs',
          scenario.totals?.operating_costs
        ],
        [
          'Hardware CAPEX',
          scenario.totals?.hardware_capex
        ]
      ];

      for (const [label, value] of pairs) {
        const dt =
          node('dt', '', label);

        const isLearnerValue =
          label ===
            'Ending active learners' ||
          label ===
            'Exact monthly operating break-even';

        let displayedValue;

        if (isLearnerValue) {
          displayedValue =
            value === null ||
            value === undefined ||
            !Number.isFinite(
              Number(value)
            )
              ? 'Not available'
              : new Intl.NumberFormat(
                  'en-US'
                ).format(
                  Number(value)
                ) +
                ' learners';
        } else {
          displayedValue =
            money(value);
        }

        const dd =
          node(
            'dd',
            '',
            displayedValue
          );

        list.append(dt, dd);
      }

      card.appendChild(list);
      cards.appendChild(card);
    }

    for (const comparison of data.comparisons) {
      const tr =
        document.createElement('tr');

      const comparedScenario =
        data.results.find(
          item =>
            item.id ===
            comparison.id
        );

      const comparisonBreakEven =
        breakEvenByScenario.get(
          comparison.id
        );

      const comparisonActive =
        Number(
          comparedScenario
            ?.summary
            ?.ending_active_students ??
          comparedScenario
            ?.inputs
            ?.initial_active_students
        );

      const zoneApi =
        window
          .ICARE_FINROOM_ZONE_PRESENTATION;

      if (
        comparisonBreakEven
          ?.available === true &&
        Number.isFinite(
          comparisonActive
        ) &&
        zoneApi
      ) {
        const zone =
          zoneApi.classify(
            comparisonActive,
            comparisonBreakEven.threshold
          );

        if (zone) {
          zoneApi.applyZoneClass(
            tr,
            zone
          );

          tr.title =
            zone.label +
            ' — ' +
            zone.detail +
            ' · exact server break-even: ' +
            new Intl.NumberFormat(
              'en-US'
            ).format(
              comparisonBreakEven.threshold
            ) +
            ' active learners.';
        }
      }

      const values = [
        text(comparison.label || comparison.id),
        money(comparison.delta_total_revenue),
        money(comparison.delta_combined_contribution),
        money(comparison.delta_operating_costs),
        money(comparison.delta_hardware_capex),
        money(
          comparison.delta_ending_monthly_coverage_gap
        ),
        money(
          comparison.delta_ending_cumulative_coverage_gap
        )
      ];

      values.forEach((value, index) => {
        const cell =
          document.createElement(index === 0 ? 'th' : 'td');

        if (index === 0) {
          cell.scope = 'row';
        }

        cell.textContent = value;
        tr.appendChild(cell);
      });

      body.appendChild(tr);
    }

    notes.appendChild(
      node(
        'p',
        '',
        'Differences are server-calculated against the first technical reference scenario. They are not scores, probabilities or recommendations.'
      )
    );

    notes.appendChild(
      node(
        'p',
        '',
        'Contribution is not profit or net margin. CAPEX remains separate from operating contribution.'
      )
    );

    notes.appendChild(
      node(
        'p',
        '',
        'Colored zones use each scenario’s own exact server-calculated monthly operating break-even. The three pre-break-even colors divide learner-distance to that threshold for visual orientation only; they are not risk probabilities, rankings or forecasts.'
      )
    );

    if (
      data.semantics?.analysis_is_forecast === false &&
      data.semantics?.ranking_performed === false &&
      data.semantics?.probabilities_assigned === false
    ) {
      notes.appendChild(
        node(
          'p',
          '',
          'Server semantics confirm: modeled sensitivity only; no forecast, ranking or probability assignment.'
        )
      );
    }

    result.hidden = false;
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();

    status.textContent =
      'Calculating modeled sensitivity on the server…';

    try {
      const reference =
        readReferenceOptions();

      const variant =
        buildVariantOptions(reference);

      const label =
        document.getElementById('sens-label')
          .value
          .trim();

      if (!label) {
        throw new Error('variant_label_required');
      }

      const response = await fetch(
        '/api/finroom-simulate',
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            operation: 'sensitivity',
            scenarios: [
              {
                id: 'reference',
                label: 'Current laboratory reference',
                options: reference
              },
              {
                id: 'comparison',
                label,
                options: variant
              }
            ]
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data && data.error
            ? data.error
            : 'sensitivity_request_failed'
        );
      }

      const sensitivityData =
        data.data;

      const breakEvenByScenario =
        await loadScenarioBreakEvens(
          sensitivityData
        );

      render(
        sensitivityData,
        breakEvenByScenario
      );

      status.textContent =
        'Modeled sensitivity calculated by the server with per-scenario operating-zone signals.';

      requestAnimationFrame(() => {
        result.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      });
    } catch (error) {
      status.textContent =
        'Sensitivity could not be calculated. Review the explicit scenario inputs and try again.';

      console.error(
        'FinRoom sensitivity:',
        error
      );
    }
  });

  syncVariantDefaults();
})();

/*
 * FINROOM F3-F2 — explanation + terrain→model presentation contract.
 *
 * This layer is intentionally presentation-only:
 * - it does not import the financial engine;
 * - it does not calculate financial outputs;
 * - it does not submit field evidence;
 * - it does not persist evidence or revisions;
 * - it does not mutate the official model.
 */
(function finroomFieldCalibrationPresentationContract() {
  'use strict';

  const root =
    document.getElementById('finroom-field-calibration');

  if (!root) {
    return;
  }

  root.dataset.fieldEvidenceAuthority = 'observation';
  root.dataset.revisionAuthority = 'proposal';
  root.dataset.humanReviewRequired = 'true';
  root.dataset.automaticModelMutation = 'false';
  root.dataset.automaticModelPersistence = 'false';

  /*
   * The current endpoint deliberately exposes no field-calibration
   * operation. This DOM event allows other presentation components to
   * announce which result needs further evidence without inventing a
   * server workflow or changing any financial value.
   */
  document.addEventListener(
    'icare:finroom-evidence-focus',
    function onEvidenceFocus(event) {
      const detail =
        event && event.detail && typeof event.detail === 'object'
          ? event.detail
          : null;

      if (!detail || typeof detail.metric !== 'string') {
        return;
      }

      root.dataset.evidenceFocus = detail.metric;
    }
  );
})();

/*
 * ICARE FINROOM E2-D4C
 * Monthly operating break-even graph.
 *
 * FINANCIAL AUTHORITY:
 * - all financial values originate from break_even_graph server points;
 * - exact break-even originates only from server response.break_even;
 * - this client performs presentation-coordinate scaling only.
 */
(() => {
  'use strict';

  const button =
    document.getElementById('finroom-run-break-even-graph');

  const status =
    document.getElementById('finroom-break-even-status');

  const result =
    document.getElementById('finroom-break-even-result');

  const exact =
    document.getElementById('finroom-break-even-exact');

  const svg =
    document.getElementById('finroom-break-even-svg');

  const body =
    document.getElementById('finroom-break-even-body');

  if (
    !button ||
    !status ||
    !result ||
    !exact ||
    !svg ||
    !body
  ) {
    return;
  }

  const NS = 'http://www.w3.org/2000/svg';

  const money = value => {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return 'Not modeled';
    }

    return new Intl.NumberFormat(
      'en-US',
      {
        maximumFractionDigits: 0
      }
    ).format(Number(value)) + ' FCFA';
  };

  const number = value => {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return 'Not modeled';
    }

    return new Intl.NumberFormat('en-US').format(Number(value));
  };

  const clearNode = node => {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  };

  const svgNode = (name, attributes = {}) => {
    const node = document.createElementNS(NS, name);

    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }

    return node;
  };

  const readScenario = () => {
    const device =
      document.getElementById('sim-device-mode');

    const homeEnabled =
      document.getElementById('sim-home-enabled');

    const conversion =
      document.getElementById('sim-home-conversion');

    const cost =
      document.getElementById('sim-cost-structure');

    if (
      !device ||
      !homeEnabled ||
      !conversion ||
      !cost
    ) {
      throw new Error('graph_reference_controls_unavailable');
    }

    if (
      cost.value !== 'current' &&
      cost.value !== 'expanded'
    ) {
      throw new Error('graph_progressive_cost_structure_unavailable');
    }

    const humanConversion =
      Number(String(conversion.value).replace(',', '.'));

    if (
      homeEnabled.checked &&
      (
        !Number.isFinite(humanConversion) ||
        humanConversion < 0 ||
        humanConversion > 100
      )
    ) {
      throw new Error('graph_home_conversion_invalid');
    }

    return {
      device_mode: device.value,
      home_enabled: homeEnabled.checked,
      home_conversion_rate:
        homeEnabled.checked
          ? humanConversion / 100
          : 0,
      cost_structure: cost.value
    };
  };

  const requestGraph = async () => {
    const response = await fetch(
      '/api/finroom-simulate',
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          operation: 'break_even_graph',
          overrides: readScenario(),
          options: {}
        })
      }
    );

    let envelope = null;

    try {
      envelope = await response.json();
    } catch (_error) {
      throw new Error('graph_invalid_server_response');
    }

    if (!response.ok) {
      const error = new Error(
        response.status === 401
          ? 'graph_authentication_required'
          : response.status === 503
            ? 'graph_service_unavailable'
            : 'graph_request_rejected'
      );

      error.status = response.status;
      error.payload = envelope;
      throw error;
    }

    if (
      !envelope ||
      envelope.ok !== true ||
      envelope.operation !== 'break_even_graph' ||
      !envelope.data ||
      envelope.data.kind !== 'break_even_graph' ||
      !Array.isArray(envelope.data.points)
    ) {
      throw new Error('graph_unexpected_response');
    }

    return envelope.data;
  };

  const appendCell = (row, value, header = false) => {
    const cell =
      document.createElement(header ? 'th' : 'td');

    if (header) {
      cell.scope = 'row';
    }

    cell.textContent = value;
    row.appendChild(cell);
  };

  const renderTable = (points, breakEven) => {
    clearNode(body);

    const threshold =
      breakEven &&
      Number.isFinite(Number(breakEven.active_students))
        ? Number(breakEven.active_students)
        : null;

    const zoneApi =
      window.ICARE_FINROOM_ZONE_PRESENTATION;

    for (const point of points) {
      const row = document.createElement('tr');

      const zone =
        threshold !== null &&
        zoneApi
          ? zoneApi.classify(
              point.active_students,
              threshold
            )
          : null;

      if (zone && zoneApi) {
        zoneApi.applyZoneClass(row, zone);

        row.title =
          zone.label +
          ' — ' +
          zone.detail;
      }

      if (point.monthly_break_even === true) {
        row.classList.add('is-break-even');
      }

      appendCell(
        row,
        number(point.active_students),
        true
      );

      appendCell(
        row,
        money(point.combined_contribution)
      );

      appendCell(
        row,
        money(point.modeled_operating_costs)
      );

      appendCell(
        row,
        money(point.monthly_coverage_gap)
      );

      appendCell(
        row,
        (
          zone
            ? zone.label + ' — '
            : ''
        ) +
        (
          point.monthly_break_even === true
            ? 'Reached'
            : 'Not reached'
        )
      );

      body.appendChild(row);
    }
  };

  const renderExactBreakEven = breakEven => {
    if (
      !breakEven ||
      breakEven.active_students === null ||
      breakEven.active_students === undefined
    ) {
      exact.textContent =
        'No exact modeled monthly operating break-even was returned within the server search bound.';
      return;
    }

    if (breakEven.within_requested_range === true) {
      exact.textContent =
        'Exact server-calculated monthly operating break-even: ' +
        number(breakEven.active_students) +
        ' active learners.';
      return;
    }

    exact.textContent =
      'Exact server-calculated monthly operating break-even: ' +
      number(breakEven.active_students) +
      ' active learners. The exact threshold lies outside the displayed graph range.';
  };

  /*
   * Presentation geometry only.
   *
   * X and Y values are already calculated by the server.
   * This function maps those returned values to SVG pixel coordinates.
   * It does not derive financial values or an exact break-even.
   */
  const renderSvg = data => {
    const points = data.points;

    clearNode(svg);

    const title = svgNode('title', {
      id: 'finroom-break-even-svg-title'
    });

    title.textContent =
      'Monthly operating break-even graph';

    const desc = svgNode('desc', {
      id: 'finroom-break-even-svg-desc'
    });

    desc.textContent =
      'Server-returned contribution used for operating-cost coverage and modeled operating costs by active learner count. Exact values are available in the table below.';

    svg.append(title, desc);

    if (!points.length) {
      const empty = svgNode('text', {
        x: 450,
        y: 230,
        'text-anchor': 'middle'
      });

      empty.textContent =
        'No graph points were returned by the server.';

      svg.appendChild(empty);
      return;
    }

    const width = 900;
    const height = 460;

    const margin = {
      top: 35,
      right: 35,
      bottom: 65,
      left: 95
    };

    const plotWidth =
      width - margin.left - margin.right;

    const plotHeight =
      height - margin.top - margin.bottom;

    const xValues =
      points.map(point => Number(point.active_students));

    const yValues =
      points.flatMap(point => [
        Number(point.combined_contribution),
        Number(point.modeled_operating_costs)
      ]);

    if (
      xValues.some(value => !Number.isFinite(value)) ||
      yValues.some(value => !Number.isFinite(value))
    ) {
      throw new Error('graph_non_numeric_server_point');
    }

    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);

    const rawYMin = Math.min(...yValues);
    const rawYMax = Math.max(...yValues);

    const yMin = Math.min(0, rawYMin);
    const yMax =
      rawYMax === yMin
        ? yMin + 1
        : rawYMax;

    const xSpan =
      xMax === xMin
        ? 1
        : xMax - xMin;

    const ySpan =
      yMax - yMin;

    const xPixel = value =>
      margin.left +
      (
        (Number(value) - xMin) /
        xSpan
      ) * plotWidth;

    const yPixel = value =>
      margin.top +
      plotHeight -
      (
        (Number(value) - yMin) /
        ySpan
      ) * plotHeight;

    /*
     * Presentation-only zones.
     * Boundaries are thirds of learner-distance to the exact server
     * break-even. They are visual orientation bands, not financial
     * probabilities or risk scores.
     */
    const breakEvenThreshold =
      data.break_even &&
      Number.isFinite(Number(data.break_even.active_students))
        ? Number(data.break_even.active_students)
        : null;

    if (
      breakEvenThreshold !== null &&
      breakEvenThreshold > 0
    ) {
      const zoneSpecs = [
        {
          key: 'critical',
          label: 'CRITICAL',
          start: xMin,
          end: Math.min(
            xMax,
            breakEvenThreshold / 3
          )
        },
        {
          key: 'risk',
          label: 'RISK',
          start: Math.max(
            xMin,
            breakEvenThreshold / 3
          ),
          end: Math.min(
            xMax,
            (2 * breakEvenThreshold) / 3
          )
        },
        {
          key: 'vigilance',
          label: 'WATCH',
          start: Math.max(
            xMin,
            (2 * breakEvenThreshold) / 3
          ),
          end: Math.min(
            xMax,
            breakEvenThreshold
          )
        },
        {
          key: 'good',
          label: 'BREAK-EVEN REACHED',
          start: Math.max(
            xMin,
            breakEvenThreshold
          ),
          end: xMax
        }
      ];

      for (const zone of zoneSpecs) {
        if (zone.end <= zone.start) {
          continue;
        }

        const x1 = xPixel(zone.start);
        const x2 = xPixel(zone.end);

        svg.appendChild(
          svgNode('rect', {
            x: x1,
            y: margin.top,
            width: Math.max(0, x2 - x1),
            height: plotHeight,
            class:
              'finroom-chart-zone finroom-zone-' +
              zone.key
          })
        );

        if ((x2 - x1) >= 78) {
          const label = svgNode('text', {
            x: x1 + (x2 - x1) / 2,
            y: margin.top + 34,
            'text-anchor': 'middle',
            class:
              'finroom-chart-zone-label finroom-zone-' +
              zone.key
          });

          label.textContent = zone.label;
          svg.appendChild(label);
        }
      }
    }

    const grid = svgNode('g', {
      'aria-hidden': 'true'
    });

    for (let index = 0; index <= 4; index += 1) {
      const ratio = index / 4;

      const y =
        margin.top +
        ratio * plotHeight;

      grid.appendChild(
        svgNode('line', {
          x1: margin.left,
          y1: y,
          x2: width - margin.right,
          y2: y,
          class: 'finroom-chart-grid'
        })
      );
    }

    svg.appendChild(grid);

    svg.appendChild(
      svgNode('line', {
        x1: margin.left,
        y1: margin.top,
        x2: margin.left,
        y2: height - margin.bottom,
        class: 'finroom-chart-axis'
      })
    );

    svg.appendChild(
      svgNode('line', {
        x1: margin.left,
        y1: height - margin.bottom,
        x2: width - margin.right,
        y2: height - margin.bottom,
        class: 'finroom-chart-axis'
      })
    );

    const contributionPoints =
      points
        .map(
          point =>
            xPixel(point.active_students) +
            ',' +
            yPixel(point.combined_contribution)
        )
        .join(' ');

    const costPoints =
      points
        .map(
          point =>
            xPixel(point.active_students) +
            ',' +
            yPixel(point.modeled_operating_costs)
        )
        .join(' ');

    svg.appendChild(
      svgNode('polyline', {
        points: contributionPoints,
        class: 'finroom-chart-contribution'
      })
    );

    svg.appendChild(
      svgNode('polyline', {
        points: costPoints,
        class: 'finroom-chart-costs'
      })
    );

    for (const point of points) {
      svg.appendChild(
        svgNode('circle', {
          cx: xPixel(point.active_students),
          cy: yPixel(point.combined_contribution),
          r: 3.5,
          class: 'finroom-chart-point'
        })
      );
    }

    const breakEven = data.break_even;

    /*
     * IMPORTANT:
     * The marker below uses ONLY response.break_even.
     * It never scans/interpolates graph points to discover a threshold.
     */
    if (
      breakEven &&
      breakEven.within_requested_range === true &&
      Number.isFinite(Number(breakEven.active_students))
    ) {
      const markerX =
        xPixel(breakEven.active_students);

      svg.appendChild(
        svgNode('line', {
          x1: markerX,
          y1: margin.top,
          x2: markerX,
          y2: height - margin.bottom,
          class: 'finroom-chart-break-even'
        })
      );

      const markerLabel = svgNode('text', {
        x: markerX,
        y: margin.top + 18,
        'text-anchor': 'middle'
      });

      markerLabel.textContent =
        'Exact server break-even: ' +
        number(breakEven.active_students);

      svg.appendChild(markerLabel);
    }

    /*
     * Current scenario position marker.
     * This is presentation only and never affects the server threshold.
     */
    const activeControl =
      document.getElementById('sim-active-students') ||
      document.querySelector('[name="active_students"]');

    if (activeControl) {
      const currentActiveStudents =
        Number(
          String(activeControl.value ?? '')
            .replace(',', '.')
        );

      if (
        Number.isFinite(currentActiveStudents) &&
        currentActiveStudents >= xMin &&
        currentActiveStudents <= xMax
      ) {
        const currentX =
          xPixel(currentActiveStudents);

        svg.appendChild(
          svgNode('line', {
            x1: currentX,
            y1: margin.top,
            x2: currentX,
            y2: height - margin.bottom,
            class: 'finroom-chart-current-position'
          })
        );

        const currentLabel =
          svgNode('text', {
            x: currentX,
            y: height - margin.bottom - 12,
            'text-anchor': 'middle',
            class: 'finroom-chart-current-label'
          });

        currentLabel.textContent =
          'You are here: ' +
          number(currentActiveStudents);

        svg.appendChild(currentLabel);
      }
    }

    const xLabel = svgNode('text', {
      x: margin.left + plotWidth / 2,
      y: height - 18,
      'text-anchor': 'middle'
    });

    xLabel.textContent = 'Active learners';
    svg.appendChild(xLabel);

    const yLabel = svgNode('text', {
      x: 22,
      y: margin.top + plotHeight / 2,
      transform:
        'rotate(-90 22 ' +
        (margin.top + plotHeight / 2) +
        ')',
      'text-anchor': 'middle'
    });

    yLabel.textContent =
      'Monthly modeled value (FCFA)';

    svg.appendChild(yLabel);

    const xStart = svgNode('text', {
      x: margin.left,
      y: height - margin.bottom + 28,
      'text-anchor': 'start'
    });

    xStart.textContent = number(xMin);

    const xEnd = svgNode('text', {
      x: width - margin.right,
      y: height - margin.bottom + 28,
      'text-anchor': 'end'
    });

    xEnd.textContent = number(xMax);

    svg.append(xStart, xEnd);

    /*
     * ICARE FINROOM E2-D4M-D1
     * Presentation-only numeric axis graduations.
     * These ticks only interpolate display coordinates between
     * server-returned min/max graph values. They do NOT derive
     * any financial result or break-even threshold.
     */
    const tickCount = 5;

    for (let i = 1; i < tickCount; i += 1) {
      const ratio = i / tickCount;

      const xValue =
        xMin + ratio * (xMax - xMin);

      const xTick = svgNode('text', {
        x: xPixel(xValue),
        y: height - margin.bottom + 28,
        'text-anchor': 'middle',
        class: 'finroom-chart-tick-label'
      });

      xTick.textContent =
        number(Math.round(xValue));

      svg.appendChild(xTick);

      const yValue =
        yMin + ratio * (yMax - yMin);

      const yTick = svgNode('text', {
        x: margin.left - 12,
        y: yPixel(yValue) + 4,
        'text-anchor': 'end',
        class: 'finroom-chart-tick-label'
      });

      yTick.textContent =
        money(yValue);

      svg.appendChild(yTick);
    }

    const yTop = svgNode('text', {
      x: margin.left - 12,
      y: margin.top + 5,
      'text-anchor': 'end'
    });

    yTop.textContent = money(yMax);

    const yBottom = svgNode('text', {
      x: margin.left - 12,
      y: height - margin.bottom,
      'text-anchor': 'end'
    });

    yBottom.textContent = money(yMin);

    svg.append(yTop, yBottom);
  };

  const renderGraph = data => {
    const semantics =
      data.semantics &&
      typeof data.semantics === 'object'
        ? data.semantics
        : {};

    if (
      semantics.result_status !== 'simulation' ||
      semantics.graph_is_forecast !== false ||
      semantics.contribution_is_net_margin !== false ||
      semantics.monthly_break_even_is_cumulative_recovery !== false ||
      semantics.capex_included_in_operating_break_even !== false
    ) {
      throw new Error('graph_semantic_contract_mismatch');
    }

    renderExactBreakEven(data.break_even);
    renderSvg(data);
    renderTable(data.points, data.break_even);

    result.hidden = false;
  };

  const clearCurrentResult = () => {
    result.hidden = true;
    exact.textContent = '';
    clearNode(body);

    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
  };

  button.addEventListener('click', async () => {
    const liveUpdate =
      button.dataset.finroomLiveUpdate === 'true';

    clearCurrentResult();

    status.textContent =
      'Calculating the modeled monthly operating break-even on the server…';

    button.disabled = true;

    try {
      const data = await requestGraph();

      renderGraph(data);

      status.textContent =
        'Monthly operating break-even graph calculated by the server.';

      if (
        data.break_even &&
        Number.isFinite(
          Number(data.break_even.active_students)
        )
      ) {
        document.dispatchEvent(
          new CustomEvent(
            'icare:finroom-break-even-ready',
            {
              detail: {
                break_even_active_students:
                  Number(
                    data.break_even.active_students
                  ),
                overrides: readScenario()
              }
            }
          )
        );
      }

      /*
       * Manual graph generation keeps the existing navigation behavior.
       * Automatic live recalculation updates in place so parameter editing
       * never forces the user's viewport away from the controls.
       */
      if (!liveUpdate) {
        requestAnimationFrame(() => {
          const reducedMotion =
            window.matchMedia &&
            window.matchMedia(
              '(prefers-reduced-motion: reduce)'
            ).matches;

          result.scrollIntoView({
            behavior: reducedMotion ? 'auto' : 'smooth',
            block: 'start'
          });
        });
      }
    } catch (error) {
      clearCurrentResult();

      if (
        error &&
        error.message ===
          'graph_progressive_cost_structure_unavailable'
      ) {
        status.textContent =
          'The break-even graph currently supports Current or Expanded cost structures only. Progressive cost structure remains unavailable for graph V1.';
      } else if (
        error &&
        error.message === 'graph_authentication_required'
      ) {
        status.textContent =
          'Your protected FinRoom session is no longer authenticated. Sign in again before generating the graph.';
      } else if (
        error &&
        error.message === 'graph_service_unavailable'
      ) {
        status.textContent =
          'The protected financial simulation service is temporarily unavailable.';
      } else {
        status.textContent =
          'The break-even graph could not be generated. Review the current laboratory assumptions and try again.';
      }

      console.error(
        'FinRoom break-even graph:',
        error
      );
    } finally {
      button.disabled = false;
    }
  });
})();


/*
 * ICARE FINROOM E2-D4M-D2 — live interactive laboratory.
 *
 * FINANCIAL AUTHORITY:
 * - no financial formula is implemented here;
 * - no break-even threshold is derived here;
 * - the controller only reuses the existing server-backed
 *   single_simulation, trajectory and break_even_graph actions;
 * - sensitivity remains explicit/manual.
 *
 * UX CONTRACT:
 * - 450 ms debounce for normal numeric editing;
 * - only the most recent pending input state is executed;
 * - if an existing request is still running, the newest state waits;
 * - automatic graph refresh does not scroll the viewport.
 */
(() => {
  'use strict';

  const form =
    document.getElementById('finroom-simulation-form');

  const status =
    document.getElementById('finroom-simulation-status');

  const graphStatus =
    document.getElementById('finroom-break-even-status');

  const protectedRoom =
    document.getElementById('finroom-protected');

  const snapshotButton =
    document.getElementById('finroom-run-snapshot');

  const trajectoryButton =
    document.getElementById('finroom-run-simulation');

  const graphButton =
    document.getElementById(
      'finroom-run-break-even-graph'
    );

  const activeStudents =
    document.getElementById('sim-active-students');

  const deviceMode =
    document.getElementById('sim-device-mode');

  const homeEnabled =
    document.getElementById('sim-home-enabled');

  const homeConversion =
    document.getElementById('sim-home-conversion');

  const costStructure =
    document.getElementById('sim-cost-structure');

  const horizon =
    document.getElementById('sim-horizon');

  const growthMode =
    document.getElementById('sim-growth-mode');

  const growthRate =
    document.getElementById('sim-growth-rate');

  const manualPath =
    document.getElementById('sim-manual-path');

  if (
    !form ||
    !status ||
    !snapshotButton ||
    !trajectoryButton ||
    !graphButton ||
    !activeStudents ||
    !deviceMode ||
    !homeEnabled ||
    !homeConversion ||
    !costStructure ||
    !horizon ||
    !growthMode ||
    !growthRate ||
    !manualPath
  ) {
    return;
  }

  const DEBOUNCE_MS = 450;
  const BUSY_RETRY_MS = 120;

  let timer = null;
  let retryTimer = null;
  let revision = 0;

  const pending = {
    snapshot: false,
    trajectory: false,
    graph: false
  };

  status.setAttribute('aria-live', 'polite');

  if (graphStatus) {
    graphStatus.setAttribute('aria-live', 'polite');
  }

  const mergeScope = scope => {
    if (scope.snapshot) {
      pending.snapshot = true;
    }

    if (scope.trajectory) {
      pending.trajectory = true;
    }

    if (scope.graph) {
      pending.graph = true;
    }
  };

  const resetPending = () => {
    pending.snapshot = false;
    pending.trajectory = false;
    pending.graph = false;
  };

  const relevantBusy = () =>
    (
      pending.snapshot &&
      snapshotButton.disabled
    ) ||
    (
      pending.trajectory &&
      trajectoryButton.disabled
    ) ||
    (
      pending.graph &&
      graphButton.disabled
    );

  const trajectorySubmit = () => {
    if (
      typeof form.requestSubmit === 'function'
    ) {
      form.requestSubmit(trajectoryButton);
      return;
    }

    form.dispatchEvent(
      new Event(
        'submit',
        {
          bubbles: true,
          cancelable: true
        }
      )
    );
  };

  const executeLatest = expectedRevision => {
    if (expectedRevision !== revision) {
      return;
    }

    if (
      protectedRoom &&
      protectedRoom.hidden
    ) {
      return;
    }

    if (relevantBusy()) {
      status.dataset.liveState = 'waiting';

      status.textContent =
        'Inputs changed — waiting for the current server ' +
        'calculation before applying the latest values…';

      clearTimeout(retryTimer);

      retryTimer = setTimeout(
        () => executeLatest(expectedRevision),
        BUSY_RETRY_MS
      );

      return;
    }

    const runSnapshot = pending.snapshot;
    const runTrajectory = pending.trajectory;
    const runGraph = pending.graph;

    resetPending();

    status.dataset.liveState = 'updating';

    status.textContent =
      'Updating server-authoritative simulation…';

    /*
     * Existing handlers remain the sole client adapters.
     */
    if (runSnapshot) {
      snapshotButton.click();
    }

    if (runTrajectory) {
      trajectorySubmit();
    }

    if (runGraph) {
      if (
        costStructure.value === 'current' ||
        costStructure.value === 'expanded'
      ) {
        /*
         * The graph click handler captures this synchronously,
         * therefore the attribute can be removed immediately.
         */
        graphButton.dataset.finroomLiveUpdate = 'true';

        graphButton.click();

        delete graphButton.dataset.finroomLiveUpdate;
      } else if (graphStatus) {
        graphStatus.textContent =
          'Live break-even graph is available for Current ' +
          'or Expanded cost structures only.';
      }
    }
  };

  const schedule = scope => {
    mergeScope(scope);

    revision += 1;

    const expectedRevision = revision;

    clearTimeout(timer);
    clearTimeout(retryTimer);

    status.dataset.liveState = 'queued';

    status.textContent =
      'Inputs changed — live server update queued…';

    timer = setTimeout(
      () => executeLatest(expectedRevision),
      DEBOUNCE_MS
    );
  };

  const scheduleReferenceScenario = () => {
    schedule({
      snapshot: true,
      trajectory: true,
      graph: true
    });
  };

  const scheduleTrajectoryOnly = () => {
    schedule({
      snapshot: false,
      trajectory: true,
      graph: false
    });
  };

  /*
   * Active learner counts and percentages should feel live while
   * typing, therefore they use input events with debounce.
   */
  activeStudents.addEventListener(
    'input',
    scheduleReferenceScenario
  );

  homeConversion.addEventListener(
    'input',
    scheduleReferenceScenario
  );

  /*
   * Discrete assumption changes can execute immediately through
   * the same debounce queue.
   */
  deviceMode.addEventListener(
    'change',
    scheduleReferenceScenario
  );

  homeEnabled.addEventListener(
    'change',
    scheduleReferenceScenario
  );

  costStructure.addEventListener(
    'change',
    scheduleReferenceScenario
  );

  /*
   * Horizon/growth affect trajectory, but not the current monthly
   * snapshot or the operating break-even graph definition.
   */
  horizon.addEventListener(
    'input',
    scheduleTrajectoryOnly
  );

  growthMode.addEventListener(
    'change',
    scheduleTrajectoryOnly
  );

  growthRate.addEventListener(
    'input',
    scheduleTrajectoryOnly
  );

  /*
   * Manual paths are intentionally refreshed on change rather than
   * every keystroke because an incomplete path is normally invalid.
   */
  manualPath.addEventListener(
    'change',
    scheduleTrajectoryOnly
  );

  status.dataset.liveMode = 'enabled';

  if (!status.textContent.trim()) {
    status.textContent =
      'Live mode ready — change a parameter to recalculate.';
  }
})();
