'use strict';

const assert = require('assert');

const {
  validateModel,
  validateProgressiveCostPlan,
  computeProgressiveOperatingCosts,
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

const rawModel = {
  metadata: {
    model_version: 'progressive-test-v1',
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

const plan = {
  base_structure: 'current',

  events: [
    {
      id: 'sales-hire',
      kind: 'hiring',
      start_month: 4,
      headcount_delta: 2,
      monthly_unit_cost: 101,
      status: 'to_validate'
    },
    {
      id: 'office-change',
      kind: 'cost_change',
      start_month: 7,
      monthly_delta: 53,
      status: 'current_assumption'
    }
  ]
};

const validated =
  validateProgressiveCostPlan(
    plan,
    12
  );

check(
  validated.events.length === 2,
  'two events validated'
);

check(
  validated.events[0].monthly_delta ===
    202,
  'hiring cost derived'
);

const costs =
  computeProgressiveOperatingCosts(
    model,
    plan,
    12
  );

check(
  costs.kind ===
    'progressive_operating_costs',
  'cost engine kind'
);

check(
  costs.months.length === 12,
  '12 cost months'
);

check(
  costs.months[0].total_monthly ===
    10003,
  'month 1 base'
);

check(
  costs.months[2].total_monthly ===
    10003,
  'month 3 before hire'
);

check(
  costs.months[3].event_delta === 202,
  'hire begins month 4'
);

check(
  costs.months[3].total_monthly ===
    10205,
  'hire included month 4'
);

check(
  costs.months[6].event_delta === 255,
  'second event begins month 7'
);

check(
  costs.months[6].total_monthly ===
    10258,
  'both events included'
);

check(
  costs.semantics
    .recruitment_creates_revenue === false,
  'recruitment not revenue'
);

check(
  costs.semantics
    .cost_plan_is_forecast === false,
  'plan not forecast'
);

const trajectory =
  computeFinancialTrajectory(
    model,
    {
      horizon_months: 12,
      initial_active_students: 22,
      growth_mode: 'constant_students',
      device_mode: 'school_owned',
      home_enabled: true,
      cost_structure: 'progressive',
      progressive_cost_plan: plan
    }
  );

check(
  trajectory.months.length === 12,
  'trajectory generated'
);

check(
  trajectory.months.every(
    month => month.active_students === 22
  ),
  'recruitment does not alter students'
);

check(
  trajectory.months[0]
    .fixed_operating_costs === 10003,
  'trajectory month 1 cost'
);

check(
  trajectory.months[3]
    .fixed_operating_costs === 10205,
  'trajectory month 4 cost'
);

check(
  trajectory.months[6]
    .fixed_operating_costs === 10258,
  'trajectory month 7 cost'
);

check(
  trajectory.months[3]
    .progressive_cost_event_delta ===
      202,
  'event delta exposed'
);

check(
  trajectory.months[6]
    .progressive_cost_active_event_ids
    .length === 2,
  'active event ids exposed'
);

check(
  trajectory.semantics
    .recruitment_creates_revenue === false,
  'trajectory recruitment semantics'
);

check(
  trajectory.semantics
    .progressive_cost_plan_is_forecast ===
      false,
  'trajectory plan not forecast'
);

check(
  JSON.stringify(model) === before,
  'official model unchanged'
);

throws(
  () => validateProgressiveCostPlan(
    {
      base_structure: 'invalid',
      events: []
    },
    12
  ),
  'invalid base rejected'
);

throws(
  () => validateProgressiveCostPlan(
    {
      base_structure: 'current',
      events: [
        {
          id: 'x',
          kind: 'hiring',
          start_month: 0,
          headcount_delta: 1,
          monthly_unit_cost: 1
        }
      ]
    },
    12
  ),
  'invalid start month rejected'
);

throws(
  () => validateProgressiveCostPlan(
    {
      base_structure: 'current',
      events: [
        {
          id: 'x',
          kind: 'hiring',
          start_month: 13,
          headcount_delta: 1,
          monthly_unit_cost: 1
        }
      ]
    },
    12
  ),
  'event beyond horizon rejected'
);

throws(
  () => validateProgressiveCostPlan(
    {
      base_structure: 'current',
      events: [
        {
          id: 'same',
          kind: 'cost_change',
          start_month: 2,
          monthly_delta: 1
        },
        {
          id: 'same',
          kind: 'cost_change',
          start_month: 3,
          monthly_delta: 1
        }
      ]
    },
    12
  ),
  'duplicate id rejected'
);

throws(
  () => computeFinancialTrajectory(
    model,
    {
      horizon_months: 12,
      initial_active_students: 22,
      cost_structure: 'progressive'
    }
  ),
  'progressive plan required'
);

throws(
  () => computeFinancialTrajectory(
    model,
    {
      horizon_months: 12,
      initial_active_students: 22,
      cost_structure: 'current',
      progressive_cost_plan: plan
    }
  ),
  'plan rejected outside progressive'
);

console.log(
  'FINROOM_PROGRESSIVE_COST_SMOKE=PASS'
);
console.log(
  'PROGRESSIVE_COST_CHECKS=' + checks
);
