'use strict';

const assert = require('assert');

const {
  validateModel,
  computeSensitivityAnalysis
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
 * Not ICARE private financial assumptions.
 */
const rawModel = {
  metadata: {
    model_version: 'sensitivity-test-v1',
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

const scenarios = [
  {
    id: 'reference',
    label: 'Reference assumptions',
    options: {
      horizon_months: 12,
      initial_active_students: 22,
      growth_mode: 'constant_students',
      device_mode: 'school_owned',
      home_enabled: true,
      cost_structure: 'current'
    }
  },

  {
    id: 'growth',
    label: 'Growth sensitivity',
    options: {
      horizon_months: 12,
      initial_active_students: 22,
      growth_mode: 'modeled_growth_rate',
      monthly_growth_rate: 0.05,
      device_mode: 'school_owned',
      home_enabled: true,
      home_conversion_rate: 0.40,
      cost_structure: 'current'
    }
  },

  {
    id: 'hiring',
    label: 'Progressive cost sensitivity',
    options: {
      horizon_months: 12,
      initial_active_students: 22,
      growth_mode: 'constant_students',
      device_mode: 'school_owned',
      home_enabled: true,
      cost_structure: 'progressive',

      progressive_cost_plan: {
        base_structure: 'current',

        events: [
          {
            id: 'hire-event',
            kind: 'hiring',
            start_month: 5,
            headcount_delta: 2,
            monthly_unit_cost: 101,
            status: 'to_validate'
          }
        ]
      }
    }
  },

  {
    id: 'devices',
    label: 'ICARE device sensitivity',
    options: {
      horizon_months: 12,
      initial_active_students: 22,
      growth_mode: 'constant_students',
      device_mode: 'icare_supplied',
      home_enabled: true,
      cost_structure: 'current'
    }
  }
];

const analysis =
  computeSensitivityAnalysis(
    model,
    scenarios
  );

check(
  analysis.kind ===
    'financial_sensitivity_analysis',
  'analysis kind'
);

check(
  analysis.authority === 'server',
  'server authority'
);

check(
  analysis.official_model_mutated === false,
  'mutation marker'
);

check(
  JSON.stringify(model) === before,
  'model actually unchanged'
);

check(
  analysis.scenario_count === 4,
  'four scenarios'
);

check(
  analysis.results.length === 4,
  'four results'
);

check(
  analysis.comparisons.length === 4,
  'four comparisons'
);

check(
  analysis.baseline_scenario_id ===
    'reference',
  'first scenario is reference'
);

check(
  analysis.semantics
    .analysis_is_forecast === false,
  'analysis not forecast'
);

check(
  analysis.semantics
    .probabilities_assigned === false,
  'no probabilities'
);

check(
  analysis.semantics
    .ranking_performed === false,
  'no ranking'
);

check(
  analysis.semantics
    .baseline_is_reference_not_recommendation ===
      true,
  'reference is not recommendation'
);

check(
  analysis.semantics
    .field_evidence_may_inform_proposed_revisions ===
      true,
  'field evidence may inform revisions'
);

check(
  analysis.semantics
    .assumption_revisions_require_human_review ===
      true,
  'assumption revisions require human review'
);

check(
  analysis.semantics
    .field_evidence_automatically_replaces_assumptions ===
      false,
  'field evidence does not auto replace assumptions'
);

check(
  !Object.prototype.hasOwnProperty.call(
    analysis.semantics,
    'field_results_should_replace_assumptions'
  ),
  'obsolete replacement semantic removed'
);

const reference =
  analysis.results.find(
    item => item.id === 'reference'
  );

const growth =
  analysis.results.find(
    item => item.id === 'growth'
  );

const hiring =
  analysis.results.find(
    item => item.id === 'hiring'
  );

const devices =
  analysis.results.find(
    item => item.id === 'devices'
  );

check(!!reference, 'reference exists');
check(!!growth, 'growth exists');
check(!!hiring, 'hiring exists');
check(!!devices, 'devices exists');

check(
  reference.trajectory.months.length === 12,
  'reference trajectory retained'
);

check(
  growth.summary.ending_active_students >
    reference.summary.ending_active_students,
  'growth affects ending students'
);

check(
  growth.totals.total_revenue >
    reference.totals.total_revenue,
  'growth affects revenue'
);

check(
  hiring.summary.ending_active_students ===
    reference.summary.ending_active_students,
  'hiring does not create students'
);

check(
  hiring.totals.total_revenue ===
    reference.totals.total_revenue,
  'hiring does not create revenue'
);

check(
  hiring.totals.operating_costs >
    reference.totals.operating_costs,
  'hiring increases costs'
);

check(
  devices.totals.hardware_capex >
    reference.totals.hardware_capex,
  'ICARE devices increase capex'
);

check(
  Number.isFinite(
    reference.totals.total_revenue
  ),
  'revenue total finite'
);

check(
  Number.isFinite(
    reference.totals.combined_contribution
  ),
  'contribution total finite'
);

check(
  Number.isFinite(
    reference.totals.operating_costs
  ),
  'operating cost total finite'
);

check(
  Number.isFinite(
    reference.totals.hardware_capex
  ),
  'capex total finite'
);

const baselineComparison =
  analysis.comparisons.find(
    item => item.id === 'reference'
  );

check(
  baselineComparison.delta_total_revenue === 0,
  'baseline revenue delta zero'
);

check(
  baselineComparison
    .delta_combined_contribution === 0,
  'baseline contribution delta zero'
);

check(
  baselineComparison
    .delta_operating_costs === 0,
  'baseline cost delta zero'
);

check(
  baselineComparison
    .delta_hardware_capex === 0,
  'baseline capex delta zero'
);

const hiringComparison =
  analysis.comparisons.find(
    item => item.id === 'hiring'
  );

check(
  hiringComparison.delta_total_revenue === 0,
  'hiring revenue delta zero'
);

check(
  hiringComparison.delta_operating_costs > 0,
  'hiring cost delta positive'
);

throws(
  () => computeSensitivityAnalysis(
    model,
    [scenarios[0]]
  ),
  'one scenario rejected'
);

throws(
  () => computeSensitivityAnalysis(
    model,
    [
      scenarios[0],
      {
        ...scenarios[1],
        id: 'reference'
      }
    ]
  ),
  'duplicate scenario id rejected'
);

throws(
  () => computeSensitivityAnalysis(
    model,
    [
      scenarios[0],
      {
        id: 'bad',
        label: 'Bad',
        options: {
          horizon_months: 13
        }
      }
    ]
  ),
  'invalid trajectory propagated'
);

console.log(
  'FINROOM_SENSITIVITY_SMOKE=PASS'
);
console.log(
  'SENSITIVITY_CHECKS=' + checks
);
