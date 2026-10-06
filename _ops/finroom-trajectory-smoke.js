'use strict';

const assert = require('assert');

const {
  validateModel,
  validateTrajectoryOptions,
  activeStudentsForTrajectoryMonth,
  computeFinancialTrajectory
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
 * Synthetic test fixture only.
 * Not ICARE production financial data.
 */
const rawModel = {
  metadata: {
    model_version: 'trajectory-test-v1',
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
const before = JSON.stringify(model);

check(
  typeof validateTrajectoryOptions ===
    'function',
  'trajectory validator exported'
);

check(
  typeof activeStudentsForTrajectoryMonth ===
    'function',
  'growth helper exported'
);

check(
  typeof computeFinancialTrajectory ===
    'function',
  'trajectory engine exported'
);

const constant =
  computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 22,
    growth_mode: 'constant_students',
    device_mode: 'school_owned',
    home_enabled: true,
    cost_structure: 'current'
  });

check(
  constant.kind === 'financial_trajectory',
  'trajectory kind'
);

check(
  constant.authority === 'server',
  'server authority'
);

check(
  constant.official_model_mutated === false,
  'no mutation marker'
);

check(
  JSON.stringify(model) === before,
  'model actually unchanged'
);

check(
  constant.months.length === 12,
  '12 month horizon'
);

check(
  constant.months.every(
    month => month.active_students === 22
  ),
  'constant student trajectory'
);

check(
  constant.months[0].month === 1 &&
  constant.months[11].month === 12,
  'month numbering'
);

check(
  constant.months[0].classes_required === 2,
  'class calculation reused'
);

check(
  Number.isFinite(
    constant.months[0].school_revenue
  ),
  'school revenue present'
);

check(
  Number.isFinite(
    constant.months[0].home_revenue
  ),
  'home revenue present'
);

check(
  constant.months[0].total_revenue ===
    constant.months[0].school_revenue +
    constant.months[0].home_revenue,
  'total revenue'
);

check(
  Number.isFinite(
    constant.months[0]
      .school_teacher_incentives
  ),
  'school teacher cost'
);

check(
  Number.isFinite(
    constant.months[0].home_teacher_cost
  ),
  'home teacher cost'
);

check(
  Number.isFinite(
    constant.months[0]
      .combined_contribution
  ),
  'combined contribution'
);

check(
  constant.months[0]
    .fixed_operating_costs === 10003,
  'current fixed costs'
);

check(
  Number.isFinite(
    constant.months[0]
      .monthly_coverage_gap
  ),
  'monthly coverage gap'
);

check(
  Number.isFinite(
    constant.months[0]
      .cumulative_coverage_gap
  ),
  'cumulative coverage gap'
);

check(
  constant.months[0].hardware_capex ===
    2 * 503,
  'initial box capex'
);

check(
  constant.months[1].hardware_capex === 0,
  'no repeated box capex'
);

check(
  constant.semantics
    .trajectory_is_forecast === false,
  'trajectory not forecast'
);

check(
  constant.semantics
    .monthly_break_even_is_cumulative_recovery ===
      false,
  'break-even separated from recovery'
);

const growth =
  computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'modeled_growth_rate',
    monthly_growth_rate: 0.10,
    device_mode: 'school_owned',
    home_enabled: false,
    cost_structure: 'expanded'
  });

check(
  growth.months[0].active_students === 10,
  'growth month 1 is initial'
);

check(
  growth.months[1].active_students === 11,
  'growth month 2'
);

check(
  growth.months[2].active_students === 12,
  'growth month 3 rounded'
);

check(
  growth.months[0].home_revenue === 0,
  'school-only home revenue zero'
);

check(
  growth.months[0].home_contribution === 0,
  'school-only home contribution zero'
);

check(
  growth.months[0]
    .fixed_operating_costs === 20011,
  'expanded costs'
);

check(
  growth.semantics
    .growth_is_sensitivity === true,
  'growth explicitly sensitivity'
);


const manualPath = [
  10, 12, 9, 15, 15, 18,
  20, 17, 25, 30, 28, 35
];

const manual =
  computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'manual_monthly_path',
    monthly_growth_rate: 0,
    manual_monthly_path: manualPath,
    device_mode: 'school_owned',
    home_enabled: false,
    cost_structure: 'current'
  });

check(
  manual.months.map(
    month => month.active_students
  ).join(',') === manualPath.join(','),
  'manual monthly path exact'
);

check(
  manual.inputs.manual_monthly_path.join(',') ===
    manualPath.join(','),
  'manual monthly path exposed'
);

check(
  manual.semantics.trajectory_is_forecast === false,
  'manual path not forecast'
);

throws(
  () => computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'manual_monthly_path',
    manual_monthly_path: []
  }),
  'empty manual path rejected'
);

throws(
  () => computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'manual_monthly_path',
    manual_monthly_path: [10, 11]
  }),
  'wrong manual path length rejected'
);

throws(
  () => computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'manual_monthly_path',
    manual_monthly_path:
      [10, 11, 12, 13, 14, 0, 16, 17, 18, 19, 20, 21]
  }),
  'zero manual students rejected'
);

throws(
  () => computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'manual_monthly_path',
    manual_monthly_path:
      [10, 11, 12, 13, 14, -1, 16, 17, 18, 19, 20, 21]
  }),
  'negative manual students rejected'
);

throws(
  () => computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'manual_monthly_path',
    manual_monthly_path:
      [10, 11, 12, 13, 14, 15.5, 16, 17, 18, 19, 20, 21]
  }),
  'fractional manual students rejected'
);

throws(
  () => computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'manual_monthly_path',
    manual_monthly_path:
      [10, 11, 12, 13, 14, '15', 16, 17, 18, 19, 20, 21]
  }),
  'nonnumeric manual students rejected'
);

throws(
  () => computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'manual_monthly_path',
    manual_monthly_path:
      [11, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
  }),
  'manual initial mismatch rejected'
);

throws(
  () => computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'manual_monthly_path',
    monthly_growth_rate: 0.1,
    manual_monthly_path:
      [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
  }),
  'manual growth rate rejected'
);

throws(
  () => computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'constant_students',
    manual_monthly_path:
      [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
  }),
  'manual path rejected outside manual mode'
);

const supplied =
  computeFinancialTrajectory(model, {
    horizon_months: 12,
    initial_active_students: 10,
    growth_mode: 'modeled_growth_rate',
    monthly_growth_rate: 0.10,
    device_mode: 'icare_supplied',
    home_enabled: false,
    cost_structure: 'current'
  });

check(
  supplied.months[0].hardware_capex ===
    503 + (10 * 211),
  'initial box and tablet capex'
);

check(
  supplied.months[1].hardware_capex ===
    1 * 211,
  'incremental tablet capex'
);

check(
  supplied.semantics
    .device_lifecycle_costs_complete ===
      false,
  'device lifecycle explicitly incomplete'
);

const h24 =
  computeFinancialTrajectory(model, {
    horizon_months: 24,
    initial_active_students: 22
  });

check(
  h24.months.length === 24,
  '24 month horizon'
);

const h36 =
  computeFinancialTrajectory(model, {
    horizon_months: 36,
    initial_active_students: 22
  });

check(
  h36.months.length === 36,
  '36 month horizon'
);

throws(
  () => computeFinancialTrajectory(
    model,
    {
      horizon_months: 13
    }
  ),
  'invalid horizon rejected'
);

throws(
  () => computeFinancialTrajectory(
    model,
    {
      initial_active_students: 0
    }
  ),
  'zero students rejected'
);

throws(
  () => computeFinancialTrajectory(
    model,
    {
      growth_mode: 'invalid'
    }
  ),
  'invalid growth mode rejected'
);

throws(
  () => computeFinancialTrajectory(
    model,
    {
      growth_mode: 'constant_students',
      monthly_growth_rate: 0.1
    }
  ),
  'growth rate rejected in constant mode'
);

throws(
  () => computeFinancialTrajectory(
    model,
    {
      cost_structure: 'progressive'
    }
  ),
  'progressive deferred to D2'
);

throws(
  () => computeFinancialTrajectory(
    model,
    {
      unknown_override: 1
    }
  ),
  'unknown trajectory override rejected'
);

console.log(
  'FINROOM_TRAJECTORY_SMOKE=PASS'
);
console.log(
  'TRAJECTORY_CHECKS=' + checks
);
