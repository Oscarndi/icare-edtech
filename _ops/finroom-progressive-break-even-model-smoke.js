'use strict';

/*
 * ICARE FINROOM — R4F-A
 *
 * Test-first RED contract for server-authoritative,
 * month-specific Progressive operating break-even.
 *
 * This test deliberately describes the frozen R4E contract
 * BEFORE the implementation exists.
 */

const assert = require('assert');

const {
  computeBreakEvenGraph
} = require('../api/_finroom-model');

assert.strictEqual(
  typeof computeBreakEvenGraph,
  'function',
  'computeBreakEvenGraph export'
);

/*
 * Synthetic fixture only.
 *
 * These values are deliberately non-production values.
 * No private FinRoom model data is embedded in this smoke.
 */
const model = {
  metadata: {
    model_version: 'r4f-a-progressive-test-v1',
    currency: 'FCFA',
    status: 'current_assumption',
    updated_at: '2026-10-07'
  },

  school: {
    active_student_monthly_fee: 2000,
    class_monthly_support_fee: 10000,
    teacher_incentive_per_student_subject: 300,
    reference_subject_count: 3,
    reference_class_capacity: 70
  },

  hardware: {
    box_budget_per_class: 185000,
    tablet_unit_cost: 35000,
    tablet_monthly_rental: 1000
  },

  home: {
    learner_monthly_price: 6000,
    school_to_home_conversion_rate: 0.05,
    teacher_cost_per_student_subject: 500,
    teacher_cost_unit:
      'per_student_per_month_per_subject'
  },

  operating_costs: {
    current_fixed_monthly: 100000,
    expanded_fixed_monthly: 200000
  }
};

const plan = {
  base_structure: 'current',

  events: [
    {
      id: 'team-growth',
      kind: 'hiring',
      start_month: 2,
      headcount_delta: 2,
      monthly_unit_cost: 10000,
      status: 'to_validate'
    },

    {
      id: 'office-cost-change',
      kind: 'cost_change',
      start_month: 3,
      monthly_delta: 30000,
      status: 'current_assumption'
    }
  ]
};

const commonOverrides = {
  device_mode: 'school_owned',
  home_enabled: false,
  cost_structure: 'progressive'
};

const commonGraphOptions = {
  min_active_students: 1,
  max_active_students: 1000,
  point_count: 31,
  progressive_horizon_months: 12,
  progressive_cost_plan: plan
};

/*
 * R4E month semantics:
 *
 * month 1:
 *   base current = 100000
 *
 * month 2:
 *   + hiring = 2 * 10000 = 20000
 *   total = 120000
 *
 * month 3:
 *   + previous hiring 20000
 *   + cost change 30000
 *   total = 150000
 */

const month1 = computeBreakEvenGraph(
  model,
  commonOverrides,
  {
    ...commonGraphOptions,
    progressive_month: 1
  }
);

const month2 = computeBreakEvenGraph(
  model,
  commonOverrides,
  {
    ...commonGraphOptions,
    progressive_month: 2
  }
);

const month3 = computeBreakEvenGraph(
  model,
  commonOverrides,
  {
    ...commonGraphOptions,
    progressive_month: 3
  }
);

const cases = [
  [month1, 1, 100000, [], 0],
  [month2, 2, 120000, ['team-growth'], 20000],
  [
    month3,
    3,
    150000,
    ['team-growth', 'office-cost-change'],
    50000
  ]
];

for (
  const [
    result,
    expectedMonth,
    expectedTotal,
    expectedIds,
    expectedDelta
  ] of cases
) {
  assert.strictEqual(
    result.kind,
    'break_even_graph',
    'kind'
  );

  assert.strictEqual(
    result.authority,
    'server',
    'server authority'
  );

  assert.strictEqual(
    result.official_model_mutated,
    false,
    'official model unchanged'
  );

  assert.strictEqual(
    result.inputs.cost_structure,
    'progressive',
    'Progressive cost structure'
  );

  assert.strictEqual(
    result.inputs.progressive_month,
    expectedMonth,
    'selected Progressive month'
  );

  assert.strictEqual(
    result.semantics
      .progressive_break_even_is_month_specific,
    true,
    'Progressive break-even month-specific semantic'
  );

  assert.strictEqual(
    result.semantics
      .monthly_break_even_is_cumulative_recovery,
    false,
    'monthly break-even separate from cumulative recovery'
  );

  assert.strictEqual(
    result.semantics
      .capex_included_in_operating_break_even,
    false,
    'CAPEX excluded from operating break-even'
  );

  assert.ok(
    result.progressive_cost_context &&
    typeof result.progressive_cost_context === 'object',
    'Progressive cost context exists'
  );

  assert.strictEqual(
    result.progressive_cost_context.month,
    expectedMonth,
    'Progressive context month'
  );

  assert.strictEqual(
    result.progressive_cost_context.base_structure,
    'current',
    'Progressive base structure'
  );

  assert.strictEqual(
    result.progressive_cost_context.base_monthly,
    100000,
    'Progressive base monthly operating cost'
  );

  assert.strictEqual(
    result.progressive_cost_context.event_delta,
    expectedDelta,
    'Progressive event delta'
  );

  assert.strictEqual(
    result.progressive_cost_context.total_monthly,
    expectedTotal,
    'Progressive resolved monthly operating costs'
  );

  assert.deepStrictEqual(
    result.progressive_cost_context.active_event_ids,
    expectedIds,
    'Progressive active event IDs'
  );

  assert.ok(
    result.break_even &&
    typeof result.break_even === 'object',
    'break_even object'
  );

  assert.ok(
    Number.isInteger(
      result.break_even.active_students
    ) ||
    result.break_even.active_students === null,
    'exact threshold is integer or null'
  );

  assert.strictEqual(
    result.break_even.modeled_operating_costs,
    expectedTotal,
    'exact threshold uses Progressive month operating costs'
  );

  assert.ok(
    Array.isArray(result.points),
    'graph points'
  );

  assert.ok(
    result.points.length > 0,
    'graph contains points'
  );

  for (const point of result.points) {
    assert.strictEqual(
      point.modeled_operating_costs,
      expectedTotal,
      'all graph points use selected month operating costs'
    );
  }
}

/*
 * Month-specific financial threshold must respond to
 * Progressive cost changes.
 *
 * Higher operating cost cannot produce a lower threshold
 * under otherwise identical assumptions.
 */
assert.ok(
  month2.break_even.active_students === null ||
  month1.break_even.active_students === null ||
  month2.break_even.active_students >=
    month1.break_even.active_students,
  'month 2 threshold monotonic with higher costs'
);

assert.ok(
  month3.break_even.active_students === null ||
  month2.break_even.active_students === null ||
  month3.break_even.active_students >=
    month2.break_even.active_students,
  'month 3 threshold monotonic with higher costs'
);

/*
 * Current / Expanded compatibility contract:
 * Progressive-only response fields must not be required
 * for existing structures.
 */
const current = computeBreakEvenGraph(
  model,
  {
    device_mode: 'school_owned',
    home_enabled: false,
    cost_structure: 'current'
  },
  {
    min_active_students: 1,
    max_active_students: 1000,
    point_count: 31
  }
);

const expanded = computeBreakEvenGraph(
  model,
  {
    device_mode: 'school_owned',
    home_enabled: false,
    cost_structure: 'expanded'
  },
  {
    min_active_students: 1,
    max_active_students: 1000,
    point_count: 31
  }
);

assert.strictEqual(
  current.kind,
  'break_even_graph',
  'Current remains supported'
);

assert.strictEqual(
  expanded.kind,
  'break_even_graph',
  'Expanded remains supported'
);

assert.strictEqual(
  current.authority,
  'server',
  'Current remains server-authoritative'
);

assert.strictEqual(
  expanded.authority,
  'server',
  'Expanded remains server-authoritative'
);

assert.strictEqual(
  current.inputs.cost_structure,
  'current',
  'Current contract unchanged'
);

assert.strictEqual(
  expanded.inputs.cost_structure,
  'expanded',
  'Expanded contract unchanged'
);

console.log(
  'FINROOM_PROGRESSIVE_BREAK_EVEN_MODEL_SMOKE=PASS'
);

console.log(
  'PROGRESSIVE_MONTH_1_COST=' +
  month1.progressive_cost_context.total_monthly
);

console.log(
  'PROGRESSIVE_MONTH_2_COST=' +
  month2.progressive_cost_context.total_monthly
);

console.log(
  'PROGRESSIVE_MONTH_3_COST=' +
  month3.progressive_cost_context.total_monthly
);

console.log(
  'PROGRESSIVE_MONTH_1_BE=' +
  month1.break_even.active_students
);

console.log(
  'PROGRESSIVE_MONTH_2_BE=' +
  month2.break_even.active_students
);

console.log(
  'PROGRESSIVE_MONTH_3_BE=' +
  month3.break_even.active_students
);
