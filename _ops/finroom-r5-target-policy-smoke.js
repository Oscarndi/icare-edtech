'use strict';

/*
 * ICARE FinRoom R5 B3.3 synthetic target-policy smoke.
 *
 * No real ICARE target, customer price, supplier quote,
 * willingness-to-pay claim or confidential support agreement
 * is used here.
 */

const assert = require('assert');

const {
  R5_B3_3_ENUMS,
  validateTargetPolicyInput,
  evaluateTargetPolicy
} = require('../api/_finroom-model');

function base(overrides = {}) {
  return {
    target_policy_id:
      'synthetic-target-policy',

    offer_id:
      'school_b2b2c',

    segment_id:
      'synthetic-segment',

    scenario_id:
      'current',

    strategic_target: {
      value: 120,
      currency: 'XAF',
      unit:
        'currency_per_learner_month',
      scope_ref:
        'synthetic:scope:A',
      effective_date:
        '2099-01-01',

      pricing_policy:
        'market_alignment',

      rationale:
        'Synthetic target-policy test only.',

      provenance:
        'synthetic B3.3 fixture',

      source_type:
        'management_target',

      assumption_status:
        'current_assumption',

      confidence:
        'low',

      evidence_refs: []
    },

    floor_context: {
      value: 100,
      currency: 'XAF',
      unit:
        'currency_per_learner_month',
      scope_ref:
        'synthetic:scope:A',

      floor_cost_level:
        'full_economic_cost',

      floor_basis_ref:
        'synthetic:floor:basis',

      floor_eligibility_status:
        'eligible_final',

      offer_id:
        'school_b2b2c',

      segment_id:
        'synthetic-segment',

      scenario_id:
        'current',

      evidence_refs: []
    },

    support_policy: null,

    market_context_refs: [],

    decision_status:
      'proposed',

    configuration_ref:
      'opaque:configuration:v1',

    technical_change_ref:
      'opaque:change:v1',

    notes:
      'synthetic only',

    ...overrides
  };
}

function evaluate(overrides = {}) {
  return evaluateTargetPolicy(
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
  R5_B3_3_ENUMS
    .target_policy_status
    .includes(
      'ready_at_or_above_floor'
    )
);

assert(
  R5_B3_3_ENUMS
    .target_policy_status
    .includes(
      'ready_below_floor_with_support'
    )
);

assert(
  R5_B3_3_ENUMS
    .support_type
    .includes('cross_subsidy')
);

/* --------------------------------------------------------- */
/* TARGET ABOVE / EQUAL FLOOR                               */
/* --------------------------------------------------------- */

let result = evaluate();

assert.strictEqual(
  result.status,
  'ready_at_or_above_floor'
);

assert.strictEqual(
  result.relation_to_floor,
  'above'
);

assert.strictEqual(
  result.subsidy_required,
  false
);

assert.strictEqual(
  result.required_support_gap,
  null
);

assert.strictEqual(
  result.ready_for_final_target_policy,
  true
);

result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    value: 100
  }
});

assert.strictEqual(
  result.status,
  'ready_at_or_above_floor'
);

assert.strictEqual(
  result.relation_to_floor,
  'equal'
);

/* --------------------------------------------------------- */
/* BELOW FLOOR — SUBSIDY                                    */
/* --------------------------------------------------------- */

result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    value: 70,
    pricing_policy: 'subsidized'
  },

  support_policy: {
    status: 'approved',
    type: 'subsidy',
    amount_or_rule:
      'Synthetic rule covers declared gap.',
    source_ref:
      'synthetic:support:source',
    evidence_refs: [
      'synthetic:support:evidence'
    ]
  }
});

assert.strictEqual(
  result.status,
  'ready_below_floor_with_support'
);

assert.strictEqual(
  result.relation_to_floor,
  'below'
);

assert.strictEqual(
  result.subsidy_required,
  true
);

assert.strictEqual(
  result.required_support_gap,
  30
);

assert.strictEqual(
  result.ready_for_final_target_policy,
  true
);

/* --------------------------------------------------------- */
/* BELOW FLOOR — CROSS SUBSIDY                              */
/* --------------------------------------------------------- */

result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    value: 80,
    pricing_policy:
      'cross_subsidized'
  },

  support_policy: {
    status: 'identified',
    type: 'cross_subsidy',
    amount_or_rule:
      'Synthetic cross-support rule.',
    source_ref:
      'synthetic:cross-support',
    evidence_refs: []
  }
});

assert.strictEqual(
  result.status,
  'ready_below_floor_with_support'
);

assert.strictEqual(
  result.required_support_gap,
  20
);

/* --------------------------------------------------------- */
/* BELOW FLOOR — CUSTOM DOCUMENTED                          */
/* --------------------------------------------------------- */

result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    value: 90,
    pricing_policy:
      'custom_documented'
  },

  support_policy: {
    status: 'identified',
    type:
      'custom_documented_support',
    amount_or_rule:
      'Synthetic documented exceptional support.',
    source_ref:
      'synthetic:custom-support',
    evidence_refs: []
  }
});

assert.strictEqual(
  result.status,
  'ready_below_floor_with_support'
);

/* --------------------------------------------------------- */
/* BELOW FLOOR WITHOUT SUPPORT                              */
/* --------------------------------------------------------- */

result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    value: 80,
    pricing_policy:
      'penetration'
  }
});

assert.strictEqual(
  result.status,
  'below_floor_without_support'
);

assert.strictEqual(
  result.ready_for_final_target_policy,
  false
);

assert.strictEqual(
  result.required_support_gap,
  20
);

/* Missing support with subsidized policy still blocks. */
result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    value: 80,
    pricing_policy:
      'subsidized'
  },

  support_policy: null
});

assert.strictEqual(
  result.status,
  'below_floor_without_support'
);

/* Rejected support blocks. */
result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    value: 80,
    pricing_policy:
      'subsidized'
  },

  support_policy: {
    status: 'rejected',
    type: 'subsidy',
    amount_or_rule:
      'Rejected synthetic support.',
    source_ref: null,
    evidence_refs: []
  }
});

assert.strictEqual(
  result.status,
  'below_floor_without_support'
);

/* Unresolved support requires review, not readiness. */
result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    value: 80,
    pricing_policy:
      'subsidized'
  },

  support_policy: {
    status: 'unresolved',
    type: 'subsidy',
    amount_or_rule:
      'Synthetic unresolved support.',
    source_ref: null,
    evidence_refs: []
  }
});

assert.strictEqual(
  result.status,
  'manual_review_required'
);

assert.strictEqual(
  result.ready_for_final_target_policy,
  false
);

/* Mismatched support type blocks. */
result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    value: 80,
    pricing_policy:
      'subsidized'
  },

  support_policy: {
    status: 'approved',
    type: 'cross_subsidy',
    amount_or_rule:
      'Synthetic mismatch.',
    source_ref:
      'synthetic:mismatch',
    evidence_refs: []
  }
});

assert.strictEqual(
  result.status,
  'below_floor_without_support'
);

/* --------------------------------------------------------- */
/* FLOOR MUST BE FINAL                                      */
/* --------------------------------------------------------- */

result = evaluate({
  floor_context: {
    ...base().floor_context,
    floor_eligibility_status:
      'eligible_lower_bound'
  }
});

assert.strictEqual(
  result.status,
  'floor_not_final'
);

assert.strictEqual(
  result.relation_to_floor,
  'not_comparable'
);

assert.strictEqual(
  result.required_support_gap,
  null
);

/* --------------------------------------------------------- */
/* DIMENSION MISMATCH                                       */
/* --------------------------------------------------------- */

result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    currency: 'USD'
  }
});

assert.strictEqual(
  result.status,
  'currency_mismatch'
);

assert.strictEqual(
  result.relation_to_floor,
  'not_comparable'
);

assert.strictEqual(
  result.required_support_gap,
  null
);

result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    unit: 'currency_per_device'
  }
});

assert.strictEqual(
  result.status,
  'unit_mismatch'
);

result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    scope_ref:
      'synthetic:scope:B'
  }
});

assert.strictEqual(
  result.status,
  'scope_mismatch'
);

result = evaluate({
  floor_context: {
    ...base().floor_context,
    scenario_id: 'expanded'
  }
});

assert.strictEqual(
  result.status,
  'offer_segment_scenario_mismatch'
);

/* --------------------------------------------------------- */
/* SOURCE AUTHORITY                                         */
/* --------------------------------------------------------- */

/*
 * B3.1 authority:
 * technical_fixture is structurally invalid for StrategicTarget.
 * B3.3 must not bypass or weaken that rule.
 */
expectInvalid(
  () => {
    const x = base();

    x.strategic_target = {
      ...x.strategic_target,
      source_type:
        'technical_fixture'
    };

    validateTargetPolicyInput(x);
  },
  'technical fixture rejects structurally'
);

/*
 * Generic technical/accounting source types may exist in R5,
 * but they cannot qualify final strategic-target readiness.
 */
for (const source_type of [
  'supplier_quote',
  'invoice',
  'payroll_policy'
]) {
  result = evaluate({
    strategic_target: {
      ...base().strategic_target,
      source_type
    }
  });

  assert.strictEqual(
    result.status,
    'invalid_target_evidence'
  );

  assert.strictEqual(
    result.ready_for_final_target_policy,
    false
  );
}

/*
 * Competitor context can inform a target.
 * This creates no WTP/demand claim.
 */
result = evaluate({
  strategic_target: {
    ...base().strategic_target,
    pricing_policy:
      'market_alignment',
    source_type:
      'competitor_reference'
  },

  market_context_refs: [
    'synthetic:competitor-context'
  ]
});

/*
 * Canonical B3.3 target-relevant source types remain
 * representable without creating market-validation claims.
 */
for (const source_type of [
  'management_target',
  'internal_estimate',
  'market_reference',
  'competitor_reference',
  'customer_interview',
  'pilot_observation',
  'contract',
  'statutory_source'
]) {
  const r = evaluate({
    strategic_target: {
      ...base().strategic_target,
      source_type
    }
  });

  assert.strictEqual(
    r.status,
    'ready_at_or_above_floor'
  );

  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      r,
      'validated_willingness_to_pay'
    ),
    false
  );

  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      r,
      'validated_demand'
    ),
    false
  );
}

assert.strictEqual(
  result.status,
  'ready_at_or_above_floor'
);

assert.strictEqual(
  Object.prototype.hasOwnProperty.call(
    result,
    'validated_willingness_to_pay'
  ),
  false
);

assert.strictEqual(
  Object.prototype.hasOwnProperty.call(
    result,
    'validated_demand'
  ),
  false
);

assert.strictEqual(
  Object.prototype.hasOwnProperty.call(
    result,
    'affordability_ceiling'
  ),
  false
);

/* --------------------------------------------------------- */
/* DECISION STATUS DOES NOT BECOME MARKET EVIDENCE          */
/* --------------------------------------------------------- */

result = evaluate({
  decision_status: 'approved'
});

assert.strictEqual(
  result.status,
  'ready_at_or_above_floor'
);

assert.strictEqual(
  Object.prototype.hasOwnProperty.call(
    result,
    'validated_willingness_to_pay'
  ),
  false
);

/* --------------------------------------------------------- */
/* TECHROOM TRACEABILITY                                    */
/* --------------------------------------------------------- */

result = evaluate({
  configuration_ref:
    'opaque:any-config',

  technical_change_ref:
    'opaque:any-change'
});

assert.strictEqual(
  result.configuration_ref,
  'opaque:any-config'
);

assert.strictEqual(
  result.technical_change_ref,
  'opaque:any-change'
);

/*
 * Technical refs are optional for non-change cases.
 */
result = evaluate({
  configuration_ref: null,
  technical_change_ref: null
});

assert.strictEqual(
  result.status,
  'ready_at_or_above_floor'
);

/* --------------------------------------------------------- */
/* CURRENT / EXPANDED                                       */
/* --------------------------------------------------------- */

assert.strictEqual(
  evaluate({
    scenario_id: 'current',

    floor_context: {
      ...base().floor_context,
      scenario_id: 'current'
    }
  }).status,
  'ready_at_or_above_floor'
);

assert.strictEqual(
  evaluate({
    scenario_id: 'expanded',

    floor_context: {
      ...base().floor_context,
      scenario_id: 'expanded'
    }
  }).status,
  'ready_at_or_above_floor'
);

/* --------------------------------------------------------- */
/* STRUCTURAL INVALIDITY                                    */
/* --------------------------------------------------------- */

expectInvalid(
  () => {
    const x = base();
    delete x.target_policy_id;
    validateTargetPolicyInput(x);
  },
  'missing target policy id rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.strategic_target.value = -1;
    validateTargetPolicyInput(x);
  },
  'negative target rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.strategic_target.value = null;
    validateTargetPolicyInput(x);
  },
  'missing numeric target rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.strategic_target.pricing_policy =
      'invented_policy';
    validateTargetPolicyInput(x);
  },
  'invented pricing policy rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.support_policy = {
      status: 'approved',
      type: 'subsidy',
      amount_or_rule: 'synthetic',
      source_ref: null,
      evidence_refs: []
    };

    validateTargetPolicyInput(x);
  },
  'approved support requires source ref'
);

expectInvalid(
  () => {
    const x = base();
    x.support_policy = {
      status: 'identified',
      type: 'invented_support',
      amount_or_rule: 'synthetic',
      source_ref:
        'synthetic:source',
      evidence_refs: []
    };

    validateTargetPolicyInput(x);
  },
  'invented support type rejects'
);

/* --------------------------------------------------------- */
/* POLICY VOCABULARY REPRESENTABILITY                       */
/* --------------------------------------------------------- */

for (const pricing_policy of [
  'penetration',
  'market_alignment',
  'value_based',
  'premium',
  'skimming',
  'cost_plus',
  'subsidized',
  'cross_subsidized',
  'custom_documented'
]) {
  const x = base();

  x.strategic_target = {
    ...x.strategic_target,
    pricing_policy
  };

  /*
   * At/above floor does not require support merely
   * because the policy name is subsidized/cross-subsidized.
   */
  assert.strictEqual(
    evaluateTargetPolicy(x).status,
    'ready_at_or_above_floor'
  );
}

/* --------------------------------------------------------- */
/* NO SILENT TECHNICAL-CHANGE TARGET MUTATION               */
/* --------------------------------------------------------- */

{
  const before = base({
    strategic_target: {
      ...base().strategic_target,
      value: 120
    },

    floor_context: {
      ...base().floor_context,
      value: 100
    }
  });

  const afterTechnicalChange = {
    ...before,

    technical_change_ref:
      'opaque:change:new-floor',

    floor_context: {
      ...before.floor_context,
      value: 140,
      floor_basis_ref:
        'synthetic:new-floor'
    }
  };

  const r =
    evaluateTargetPolicy(afterTechnicalChange);

  assert.strictEqual(
    r.target_value,
    120
  );

  assert.strictEqual(
    r.floor_value,
    140
  );

  assert.strictEqual(
    r.status,
    'below_floor_without_support'
  );

  assert.strictEqual(
    r.required_support_gap,
    20
  );
}

console.log(
  'FINROOM_R5_TARGET_POLICY_SMOKE=PASS'
);
