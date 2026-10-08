'use strict';

/*
 * ICARE FinRoom R5 B3.2 synthetic floor-eligibility smoke.
 *
 * No real ICARE cost, supplier quote, private procurement
 * value or official price recommendation is used here.
 */

const assert = require('assert');

const {
  R5_B3_2_ENUMS,
  validateFloorEligibilityInput,
  evaluateFloorEligibility
} = require('../api/_finroom-model');

function base(overrides = {}) {
  return {
    floor_basis_id: 'synthetic-floor-basis',

    offer_id: 'school_b2b2c',
    segment_id: 'synthetic-segment',
    scenario_id: 'current',

    requested_cost_level:
      'full_economic_cost',

    cost_basis_ref:
      'synthetic:cost-basis',

    configuration_ref:
      'opaque:techroom:configuration',

    technical_change_ref:
      'opaque:techroom:change',

    actual_basis: {
      currency: 'XAF',
      unit: 'currency_per_learner_month',
      scope_ref: 'synthetic:scope:A',
      effective_date: '2099-01-01'
    },

    required_context: {
      currency: 'XAF',
      unit: 'currency_per_learner_month',
      scope_ref: 'synthetic:scope:A',
      floor_purpose:
        'full_economic_sustainability'
    },

    completeness_status:
      'complete_for_declared_scope',

    reconciliation_status: 'resolved',
    coverage_status: 'resolved',

    allocation: {
      required: false,
      status: 'not_required',
      basis: null,
      driver: null,
      lifecycle_or_period: null,
      utilization_or_capacity: null,
      evidence_refs: []
    },

    provenance:
      'synthetic B3.2 fixture only',

    source_type: 'internal_estimate',
    confidence: 'low',
    evidence_refs: [],

    notes: 'synthetic only',

    ...overrides
  };
}

function evaluate(overrides = {}) {
  return evaluateFloorEligibility(
    base(overrides)
  );
}

function expectInvalid(fn, label) {
  assert.throws(
    fn,
    /FINROOM_MODEL_INVALID/,
    label
  );
}

/* --------------------------------------------------------- */
/* ENUM SURFACE                                              */
/* --------------------------------------------------------- */

assert(
  R5_B3_2_ENUMS
    .eligibility_status
    .includes('eligible_final')
);

assert(
  R5_B3_2_ENUMS
    .floor_purpose
    .includes('full_economic_sustainability')
);

assert(
  R5_B3_2_ENUMS
    .reconciliation_status
    .includes('unresolved')
);

assert(
  R5_B3_2_ENUMS
    .coverage_status
    .includes('unknown_contributing')
);

assert(
  R5_B3_2_ENUMS
    .allocation_status
    .includes('complete')
);

/* --------------------------------------------------------- */
/* FINAL ELIGIBILITY MATRIX                                  */
/* --------------------------------------------------------- */

assert.strictEqual(
  evaluate({
    requested_cost_level:
      'direct_technical_cost',
    required_context: {
      ...base().required_context,
      floor_purpose:
        'direct_technical_analysis'
    }
  }).eligibility_status,
  'eligible_final'
);

assert.strictEqual(
  evaluate({
    requested_cost_level:
      'landed_deployed_technical_cost',
    required_context: {
      ...base().required_context,
      floor_purpose:
        'deployed_asset_analysis'
    }
  }).eligibility_status,
  'eligible_final'
);

assert.strictEqual(
  evaluate({
    requested_cost_level:
      'total_service_cost',
    required_context: {
      ...base().required_context,
      floor_purpose:
        'service_sustainability'
    }
  }).eligibility_status,
  'eligible_final'
);

assert.strictEqual(
  evaluate().eligibility_status,
  'eligible_final'
);

/*
 * A more comprehensive level may satisfy a lower-purpose
 * analysis while retaining its true level label.
 */
assert.strictEqual(
  evaluate({
    requested_cost_level:
      'full_economic_cost',
    required_context: {
      ...base().required_context,
      floor_purpose:
        'direct_technical_analysis'
    }
  }).eligibility_status,
  'eligible_final'
);

/* --------------------------------------------------------- */
/* LOWER BOUNDS                                              */
/* --------------------------------------------------------- */

let result = evaluate({
  requested_cost_level:
    'direct_technical_cost',
  required_context: {
    ...base().required_context,
    floor_purpose:
      'full_economic_sustainability'
  }
});

assert.strictEqual(
  result.eligibility_status,
  'eligible_lower_bound'
);

assert.strictEqual(
  result.eligible_for_final_floor,
  false
);

assert.strictEqual(
  result.eligible_as_lower_bound,
  true
);

result = evaluate({
  requested_cost_level:
    'landed_deployed_technical_cost',
  required_context: {
    ...base().required_context,
    floor_purpose:
      'service_sustainability'
  }
});

assert.strictEqual(
  result.eligibility_status,
  'eligible_lower_bound'
);

/* --------------------------------------------------------- */
/* ECONOMICALLY INELIGIBLE BUT STRUCTURALLY REPRESENTABLE    */
/* --------------------------------------------------------- */

result = evaluate({
  completeness_status:
    'incomplete_required_costs'
});

assert.strictEqual(
  result.eligibility_status,
  'incomplete_required_costs'
);

assert.strictEqual(
  result.eligible_for_final_floor,
  false
);

assert.strictEqual(
  result.eligible_as_lower_bound,
  false
);

result = evaluate({
  reconciliation_status: 'unresolved'
});

assert.strictEqual(
  result.eligibility_status,
  'unresolved_reconciliation'
);

result = evaluate({
  coverage_status: 'unknown_contributing'
});

assert.strictEqual(
  result.eligibility_status,
  'unresolved_cost_coverage'
);

/* --------------------------------------------------------- */
/* ACTUAL VS REQUIRED DIMENSIONS                             */
/* --------------------------------------------------------- */

result = evaluate({
  actual_basis: {
    ...base().actual_basis,
    currency: 'USD'
  }
});

assert.strictEqual(
  result.eligibility_status,
  'currency_mismatch'
);

result = evaluate({
  actual_basis: {
    ...base().actual_basis,
    unit: 'currency_per_device'
  }
});

assert.strictEqual(
  result.eligibility_status,
  'unit_mismatch'
);

result = evaluate({
  actual_basis: {
    ...base().actual_basis,
    scope_ref: 'synthetic:scope:B'
  }
});

assert.strictEqual(
  result.eligibility_status,
  'scope_mismatch'
);

result = evaluate({
  actual_basis: {
    ...base().actual_basis,
    effective_date: null
  }
});

assert.strictEqual(
  result.eligibility_status,
  'effective_date_missing'
);

/* --------------------------------------------------------- */
/* ALLOCATION                                                */
/* --------------------------------------------------------- */

result = evaluate({
  allocation: {
    required: true,
    status: 'incomplete',
    basis: null,
    driver: null,
    lifecycle_or_period: null,
    utilization_or_capacity: null,
    evidence_refs: []
  }
});

assert.strictEqual(
  result.eligibility_status,
  'missing_allocation_basis'
);

/*
 * Complete explicit allocation is acceptable.
 * No lifecycle value is invented.
 */
result = evaluate({
  allocation: {
    required: true,
    status: 'complete',
    basis: 'per_learner',
    driver: 'synthetic learner allocation',
    lifecycle_or_period: 'synthetic:36-month-window',
    utilization_or_capacity:
      'synthetic:declared-capacity',
    evidence_refs: [
      'synthetic:allocation-evidence'
    ]
  }
});

assert.strictEqual(
  result.eligibility_status,
  'eligible_final'
);

/*
 * required=false must align with not_required.
 */
result = evaluate({
  allocation: {
    required: false,
    status: 'complete',
    basis: 'per_learner',
    driver: 'synthetic',
    lifecycle_or_period: 'synthetic',
    utilization_or_capacity: null,
    evidence_refs: []
  }
});

assert.strictEqual(
  result.eligibility_status,
  'missing_allocation_basis'
);

/*
 * unresolved allocation is not automatically conflicting evidence.
 * It blocks final eligibility as missing/unresolved allocation basis.
 */
result = evaluate({
  allocation: {
    required: true,
    status: 'unresolved',
    basis: 'per_learner',
    driver: 'synthetic unresolved allocation',
    lifecycle_or_period: 'synthetic:period',
    utilization_or_capacity: null,
    evidence_refs: []
  }
});

assert.strictEqual(
  result.eligibility_status,
  'missing_allocation_basis'
);

/*
 * A not-required allocation must not carry hidden mechanics.
 */
result = evaluate({
  allocation: {
    required: false,
    status: 'not_required',
    basis: 'per_learner',
    driver: 'synthetic contradictory driver',
    lifecycle_or_period: 'synthetic:period',
    utilization_or_capacity: null,
    evidence_refs: []
  }
});

assert.strictEqual(
  result.eligibility_status,
  'missing_allocation_basis'
);

assert.strictEqual(
  result.eligible_for_final_floor,
  false
);

/*
 * Even evidence-only payload is inconsistent with not_required.
 */
result = evaluate({
  allocation: {
    required: false,
    status: 'not_required',
    basis: null,
    driver: null,
    lifecycle_or_period: null,
    utilization_or_capacity: null,
    evidence_refs: [
      'synthetic:unexpected-allocation-evidence'
    ]
  }
});

assert.strictEqual(
  result.eligibility_status,
  'missing_allocation_basis'
);

/* --------------------------------------------------------- */
/* CONFLICT / SOURCE SAFETY                                  */
/* --------------------------------------------------------- */

result = evaluate({
  reconciliation_status: 'conflicting'
});

assert.strictEqual(
  result.eligibility_status,
  'conflicting_evidence'
);

result = evaluate({
  coverage_status: 'conflicting'
});

assert.strictEqual(
  result.eligibility_status,
  'conflicting_evidence'
);

/*
 * A technical fixture may remain structurally representable,
 * but cannot qualify as official economic evidence.
 */
result = evaluate({
  source_type: 'technical_fixture'
});

assert.strictEqual(
  result.eligibility_status,
  'conflicting_evidence'
);

assert.strictEqual(
  result.eligible_for_final_floor,
  false
);

/* --------------------------------------------------------- */
/* MULTIPLE BLOCKERS + PRECEDENCE                            */
/* --------------------------------------------------------- */

result = evaluate({
  source_type: 'technical_fixture',

  actual_basis: {
    currency: 'USD',
    unit: 'currency_per_device',
    scope_ref: 'synthetic:scope:B',
    effective_date: null
  },

  reconciliation_status: 'unresolved',
  coverage_status: 'unknown_contributing',

  completeness_status:
    'incomplete_required_costs',

  allocation: {
    required: true,
    status: 'incomplete',
    basis: null,
    driver: null,
    lifecycle_or_period: null,
    utilization_or_capacity: null,
    evidence_refs: []
  }
});

assert.strictEqual(
  result.eligibility_status,
  'conflicting_evidence'
);

assert(
  result.blocking_reasons.length >= 7
);

/* --------------------------------------------------------- */
/* TECHROOM TRACEABILITY                                     */
/* --------------------------------------------------------- */

result = evaluate({
  technical_change_ref:
    'opaque:change:component-X-to-Y',

  configuration_ref:
    'opaque:configuration:v2'
});

assert.strictEqual(
  result.technical_change_ref,
  'opaque:change:component-X-to-Y'
);

assert.strictEqual(
  result.configuration_ref,
  'opaque:configuration:v2'
);

/*
 * TechRoom linkage is optional for non-technical-change cases.
 */
result = evaluate({
  technical_change_ref: null,
  configuration_ref: null
});

assert.strictEqual(
  result.eligibility_status,
  'eligible_final'
);

/* --------------------------------------------------------- */
/* CURRENT / EXPANDED                                        */
/* --------------------------------------------------------- */

assert.strictEqual(
  evaluate({
    scenario_id: 'current'
  }).eligibility_status,
  'eligible_final'
);

assert.strictEqual(
  evaluate({
    scenario_id: 'expanded'
  }).eligibility_status,
  'eligible_final'
);

/* --------------------------------------------------------- */
/* MALFORMED STRUCTURE MUST REJECT                           */
/* --------------------------------------------------------- */

expectInvalid(
  () => {
    const x = base();
    delete x.floor_basis_id;
    validateFloorEligibilityInput(x);
  },
  'missing floor basis id rejects'
);

expectInvalid(
  () => {
    const x = base();
    delete x.actual_basis.currency;
    validateFloorEligibilityInput(x);
  },
  'missing actual currency rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.actual_basis.currency = null;
    validateFloorEligibilityInput(x);
  },
  'null actual currency rejects'
);

expectInvalid(
  () => {
    const x = base();
    delete x.required_context.floor_purpose;
    validateFloorEligibilityInput(x);
  },
  'missing floor purpose rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.requested_cost_level = 'manufacturing_cost';
    validateFloorEligibilityInput(x);
  },
  'invented cost level rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.reconciliation_status = 'maybe';
    validateFloorEligibilityInput(x);
  },
  'unknown reconciliation status rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.coverage_status = 'unknown';
    validateFloorEligibilityInput(x);
  },
  'unknown aggregate coverage enum rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.allocation.basis = 'invented_basis';
    validateFloorEligibilityInput(x);
  },
  'invented allocation basis rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.technical_change_ref = '';
    validateFloorEligibilityInput(x);
  },
  'empty TechRoom change ref rejects'
);

console.log(
  'FINROOM_R5_FLOOR_ELIGIBILITY_SMOKE=PASS'
);
