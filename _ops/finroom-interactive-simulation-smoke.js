'use strict';

const assert = require('assert');

const {
  validateModel,
  validateSimulationOverrides,
  computeInteractiveSimulation
} = require('../api/_finroom-model');

let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function throws(fn, message) {
  assert.throws(fn, message);
  checks += 1;
}

/*
 * Synthetic values only.
 * These values are intentionally unrelated to ICARE's
 * private financial assumptions.
 */
const rawModel = {
  metadata: {
    model_version: 'test-v1',
    currency: 'TEST',
    status: 'current_assumption',
    updated_at: '2099-01-01T00:00:00Z'
  },

  school: {
    active_student_monthly_fee: 101,
    class_monthly_support_fee: 17,
    teacher_incentive_per_student_subject: 7,
    reference_subject_count: 2,
    reference_class_capacity: 11
  },

  hardware: {
    box_budget_per_class: 503,
    tablet_unit_cost: 211,
    tablet_monthly_rental: 13
  },

  home: {
    learner_monthly_price: 307,
    school_to_home_conversion_rate: 0.25,
    teacher_cost_per_student_subject: 19,
    teacher_cost_unit:
      'per_student_per_month_per_subject'
  },

  operating_costs: {
    current_fixed_monthly: 10003,
    expanded_fixed_monthly: 20011
  }
};

const model = validateModel(rawModel);

check(
  typeof validateSimulationOverrides === 'function',
  'override validator exported'
);

check(
  typeof computeInteractiveSimulation === 'function',
  'simulation function exported'
);

const before = JSON.stringify(model);

const base =
  computeInteractiveSimulation(model, {
    active_students: 22,
    device_mode: 'school_owned',
    home_enabled: true,
    home_conversion_rate: 0.5,
    cost_structure: 'current'
  });

check(
  base.kind === 'financial_simulation',
  'simulation kind'
);

check(
  base.authority === 'server',
  'server authority'
);

check(
  base.official_model_mutated === false,
  'official model not mutated marker'
);

check(
  JSON.stringify(model) === before,
  'official model actually unchanged'
);

check(
  base.inputs.active_students === 22,
  'active students override'
);

check(
  base.inputs.device_mode === 'school_owned',
  'device mode override'
);

check(
  base.inputs.home_enabled === true,
  'home enabled'
);

check(
  base.inputs.home_conversion_rate === 0.5,
  'home conversion override'
);

check(
  base.inputs.cost_structure === 'current',
  'current cost structure'
);

check(
  Number.isFinite(
    base.scenario.monthly.school_revenue
  ),
  'school revenue calculated'
);

check(
  Number.isFinite(
    base.scenario.monthly.home_revenue
  ),
  'home revenue calculated'
);

check(
  Number.isFinite(
    base.scenario.monthly.combined_contribution
  ),
  'combined contribution calculated'
);

check(
  base.operating_costs.fixed_monthly ===
    model.operating_costs.current_fixed_monthly,
  'current fixed cost selected'
);

check(
  Number.isFinite(
    base.coverage.monthly_coverage_gap
  ),
  'coverage gap calculated'
);

check(
  typeof base.coverage.monthly_break_even ===
    'boolean',
  'monthly break-even boolean'
);

check(
  base.semantics.result_status === 'simulation',
  'simulation label'
);

check(
  base.semantics.growth_is_forecast === false,
  'not forecast'
);

check(
  base.semantics.contribution_is_net_margin ===
    false,
  'contribution not net margin'
);

check(
  base.semantics.capex_coverage_is_payback ===
    false,
  'capex coverage not payback'
);

const noHome =
  computeInteractiveSimulation(model, {
    active_students: 22,
    home_enabled: false,
    cost_structure: 'expanded'
  });

check(
  noHome.inputs.home_conversion_rate === 0,
  'school-only conversion zero'
);

check(
  noHome.scenario.monthly.home_revenue === 0,
  'school-only home revenue zero'
);

check(
  noHome.scenario.monthly.home_contribution === 0,
  'school-only home contribution zero'
);

check(
  noHome.operating_costs.fixed_monthly ===
    model.operating_costs.expanded_fixed_monthly,
  'expanded fixed cost selected'
);

const progressive =
  computeInteractiveSimulation(model, {
    active_students: 22,
    cost_structure: 'progressive'
  });

check(
  progressive.operating_costs.fixed_monthly ===
    null,
  'progressive fixed cost intentionally unresolved'
);

check(
  progressive.operating_costs
    .progressive_status ===
      'deferred_to_trajectory_engine',
  'progressive status explicit'
);

check(
  progressive.coverage.monthly_coverage_gap ===
    null,
  'progressive coverage deferred'
);

check(
  progressive.coverage.monthly_break_even ===
    null,
  'progressive break-even deferred'
);

throws(
  () => computeInteractiveSimulation(
    model,
    {
      active_students: 0
    }
  ),
  'zero students rejected'
);

throws(
  () => computeInteractiveSimulation(
    model,
    {
      device_mode: 'invalid'
    }
  ),
  'invalid device mode rejected'
);

throws(
  () => computeInteractiveSimulation(
    model,
    {
      home_conversion_rate: 1.1
    }
  ),
  'invalid home conversion rejected'
);

throws(
  () => computeInteractiveSimulation(
    model,
    {
      cost_structure: 'invalid'
    }
  ),
  'invalid cost structure rejected'
);

throws(
  () => computeInteractiveSimulation(
    model,
    {
      unexpected_private_override: 1
    }
  ),
  'unknown override rejected'
);

console.log(
  'FINROOM_INTERACTIVE_SIMULATION_SMOKE=PASS'
);
console.log(
  'INTERACTIVE_SIMULATION_CHECKS=' + checks
);
