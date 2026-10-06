'use strict';

const assert = require('assert');

const {
  validateModel,
  loadModelFromEnvironment,
  computeScenario,
  findBreakEvenStudents,
  buildFinancialPresentation
} = require('../api/_finroom-model');

/*
 * Deliberately synthetic values.
 * These are TEST FIXTURES, not ICARE production financial data.
 */
const model = {
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

let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

check(validateModel(model) === model, 'model validates');

const owned = computeScenario(
  model,
  22,
  'school_owned'
);

check(owned.classes_required === 2, 'class ceil');
check(
  owned.monthly.school_revenue ===
    (22 * 101) + (2 * 17),
  'school revenue'
);

check(
  owned.monthly.school_teacher_incentives ===
    22 * 7 * 2,
  'school teacher incentives'
);

check(
  owned.monthly.school_contribution ===
    owned.monthly.school_revenue -
    owned.monthly.school_teacher_incentives,
  'school contribution'
);

check(
  owned.capex.box === 2 * 503,
  'box capex'
);

check(
  owned.capex.tablets === 0,
  'school-owned tablets capex'
);

const supplied = computeScenario(
  model,
  22,
  'icare_supplied'
);

check(
  supplied.monthly.school_revenue ===
    owned.monthly.school_revenue +
    (22 * 13),
  'tablet rental revenue'
);

check(
  supplied.capex.tablets === 22 * 211,
  'tablet capex'
);

check(
  owned.monthly.home_learners === 5.5,
  'home conversion'
);

check(
  owned.monthly.home_revenue ===
    Math.round(5.5 * 307),
  'home revenue'
);

check(
  owned.monthly.home_teacher_cost ===
    Math.round(5.5 * 19 * 2),
  'home teacher per subject semantics'
);

check(
  owned.monthly.home_contribution ===
    owned.monthly.home_revenue -
    owned.monthly.home_teacher_cost,
  'home contribution'
);

check(
  owned.monthly.combined_contribution ===
    owned.monthly.school_contribution +
    owned.monthly.home_contribution,
  'combined contribution'
);

const presentation =
  buildFinancialPresentation(model);

check(
  presentation.scenarios.length === 6,
  '60/300/600 x two device modes'
);

check(
  presentation.semantics.home_teacher_cost_unit ===
    'per_student_per_month_per_subject',
  'decision B frozen'
);

check(
  presentation.semantics.minibox_included === false,
  'MiniBox excluded'
);

check(
  presentation.semantics.irr_status === 'deferred',
  'IRR deferred'
);

const be = findBreakEvenStudents(
  model,
  model.operating_costs.current_fixed_monthly,
  {
    deviceMode: 'school_owned',
    includeHome: true
  }
);

check(
  Number.isInteger(be) && be > 0,
  'break-even integer found'
);

process.env.FINROOM_MODEL_JSON =
  JSON.stringify(model);

const loaded =
  loadModelFromEnvironment();

check(
  loaded.metadata.model_version === 'test-v1',
  'environment model loads'
);

delete process.env.FINROOM_MODEL_JSON;

assert.throws(
  () => loadModelFromEnvironment(),
  /FINROOM_MODEL_JSON/
);
checks += 1;

process.env.FINROOM_MODEL_JSON = '{bad-json';

assert.throws(
  () => loadModelFromEnvironment(),
  /FINROOM_MODEL_JSON/
);
checks += 1;

delete process.env.FINROOM_MODEL_JSON;

const wrongUnit = JSON.parse(
  JSON.stringify(model)
);

wrongUnit.home.teacher_cost_unit =
  'per_student_per_month_total';

assert.throws(
  () => validateModel(wrongUnit),
  /teacher_cost_unit/
);
checks += 1;

console.log('FINROOM_MODEL_SMOKE=PASS');
console.log(`MODEL_CHECKS=${checks}`);
