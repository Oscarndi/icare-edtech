'use strict';

const assert =
  require('node:assert/strict');

const {
  R5_PRICING_GOVERNANCE_ENUMS,
  validatePricingGovernanceDecisionInput,
  validatePricingGovernanceTransition,
  evaluatePricingGovernanceDecision
} = require('../api/_finroom-model');

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function baseCorridor() {
  return {
    corridor_assessment_id:
      'synthetic:corridor:A',

    status:
      'valid_corridor',

    economic_floor: {
      value:
        100,

      floor_basis_id:
        'synthetic:floor:A',

      requested_cost_level:
        'full_economic_cost',

      eligibility_status:
        'eligible_final'
    },

    strategic_target: {
      value:
        110,

      target_policy_id:
        'synthetic:target:A',

      pricing_policy:
        'market_alignment',

      target_policy_status:
        'ready_at_or_above_floor',

      relation_to_floor:
        'above'
    },

    affordability_ceiling: {
      value:
        120,

      available:
        true,

      usable:
        true,

      affordability_basis_id:
        'synthetic:affordability:A',

      status:
        'ceiling_observed',

      evidence_status:
        'observed'
    },

    floor_gap:
      10,

    affordability_headroom:
      10,

    subsidy_required:
      false,

    required_support_gap:
      null,

    support_context: {
      adaptation_status:
        'not_present',

      source_support_policy:
        null,

      subsidy_policy:
        null
    },

    comparison_dimensions: {
      offer_id:
        'school_b2b2c',

      segment_id:
        'synthetic-segment',

      scenario_id:
        'current',

      currency:
        'XAF',

      unit:
        'currency_per_learner_month',

      scope_ref:
        'synthetic:scope:A',

      effective_date:
        '2099-01-01'
    },

    blocking_reasons: [],

    diagnostics: [],

    evidence_by_authority: {
      floor: [
        'evidence:floor'
      ],

      target_policy: [
        'evidence:target'
      ],

      support_policy: [],

      affordability: [
        'evidence:affordability'
      ]
    },

    evidence_refs: [
      'evidence:floor',
      'evidence:target',
      'evidence:affordability'
    ],

    market_context_by_authority: {
      target_policy: [
        'context:target'
      ],

      affordability: [
        'context:affordability'
      ]
    },

    market_context_refs: [
      'context:target',
      'context:affordability'
    ],

    configuration_refs: {
      floor:
        null,

      target_policy:
        null,

      affordability:
        null
    },

    technical_change_refs: {
      floor:
        null,

      target_policy:
        null,

      affordability:
        null
    }
  };
}

function baseDecision() {
  return {
    pricing_decision_id:
      'synthetic:decision:A',

    corridor_assessment_ref:
      'synthetic:corridor:A',

    target_policy_ref:
      'synthetic:target:A',

    offer_id:
      'school_b2b2c',

    segment_id:
      'synthetic-segment',

    scenario_id:
      'current',

    currency:
      'XAF',

    unit:
      'currency_per_learner_month',

    scope_ref:
      'synthetic:scope:A',

    effective_date:
      '2099-01-01',

    governed_target: {
      value:
        110,

      pricing_policy:
        'market_alignment'
    },

    target_policy_context: {
      target_policy_id:
        'synthetic:target:A',

      pricing_policy:
        'market_alignment'
    },

    corridor_result:
      baseCorridor(),

    status:
      'proposed',

    decision_rationale:
      'Synthetic governance rationale.',

    decision_provenance: {
      actor_ref:
        'actor:synthetic',

      decided_at:
        '2099-01-01T00:00:00Z',

      source_ref:
        'source:synthetic'
    },

    approval:
      null,

    supersession:
      null,

    evidence_refs: [
      'evidence:governance'
    ],

    notes:
      'Synthetic governance smoke only.'
  };
}

function evaluate(mutator) {
  const input =
    baseDecision();

  if (mutator) {
    mutator(input);
  }

  validatePricingGovernanceDecisionInput(
    input
  );

  return evaluatePricingGovernanceDecision(
    input
  );
}

function mustThrow(mutator) {
  const input =
    baseDecision();

  mutator(input);

  assert.throws(
    () =>
      validatePricingGovernanceDecisionInput(
        input
      )
  );
}

/* --------------------------------------------------------------- */
/* enum surface                                                    */
/* --------------------------------------------------------------- */

assert.ok(
  Object.isFrozen(
    R5_PRICING_GOVERNANCE_ENUMS
  )
);

/* --------------------------------------------------------------- */
/* proposed valid corridor                                         */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate();

  assert.strictEqual(
    result.governance_readiness_status,
    'governance_ready'
  );

  assert.strictEqual(
    result.requested_status,
    'proposed'
  );

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    true
  );

  assert.strictEqual(
    result.governed_target.value,
    110
  );

  assert.strictEqual(
    result.governed_target.pricing_policy,
    'market_alignment'
  );

  assert.strictEqual(
    result.governed_target.pricing_policy_binding,
    'b3_5_strategic_target'
  );
}

/* --------------------------------------------------------------- */
/* explicit approval                                               */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.status =
        'approved';

      input.approval = {
        approver_ref:
          'approver:synthetic',

        approved_at:
          '2099-01-02T00:00:00Z',

        approval_ref:
          'approval:synthetic'
      };
    });

  assert.strictEqual(
    result.governance_readiness_status,
    'governance_ready'
  );

  assert.strictEqual(
    result.requested_status,
    'approved'
  );

  assert.ok(
    result.diagnostics.some(
      item =>
        item.code ===
        'GOVERNANCE_APPROVAL_ONLY'
    )
  );
}

/* approval metadata required */
mustThrow(input => {
  input.status =
    'approved';

  input.approval =
    null;
});

/* approval metadata forbidden for non-approved */
mustThrow(input => {
  input.status =
    'proposed';

  input.approval = {
    approver_ref:
      'approver:synthetic',

    approved_at:
      '2099-01-02T00:00:00Z',

    approval_ref:
      'approval:synthetic'
  };
});

/* --------------------------------------------------------------- */
/* rejected                                                        */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.status =
        'rejected';
    });

  assert.strictEqual(
    result.requested_status,
    'rejected'
  );

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    true
  );
}

/* --------------------------------------------------------------- */
/* superseded requires successor ref                               */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.status =
        'superseded';

      input.supersession = {
        supersedes_decision_ref:
          null,

        superseded_by_decision_ref:
          'synthetic:decision:B'
      };
    });

  assert.strictEqual(
    result.requested_status,
    'superseded'
  );
}

mustThrow(input => {
  input.status =
    'superseded';

  input.supersession =
    null;
});

/* --------------------------------------------------------------- */
/* transition matrix                                               */
/* --------------------------------------------------------------- */

function transition(
  from,
  to
) {
  return validatePricingGovernanceTransition({
    pricing_decision_id:
      'synthetic:decision:A',

    from_status:
      from,

    to_status:
      to
  });
}

for (const [from, to] of [
  [null, 'proposed'],
  ['proposed', 'approved'],
  ['proposed', 'rejected'],
  ['proposed', 'superseded'],
  ['approved', 'superseded']
]) {
  assert.strictEqual(
    transition(from, to).allowed,
    true
  );
}

for (const [from, to] of [
  ['proposed', 'proposed'],
  ['approved', 'proposed'],
  ['approved', 'rejected'],
  ['rejected', 'proposed'],
  ['rejected', 'approved'],
  ['rejected', 'superseded'],
  ['superseded', 'proposed'],
  ['superseded', 'approved'],
  ['superseded', 'rejected']
]) {
  assert.strictEqual(
    transition(from, to).allowed,
    false
  );
}

/* --------------------------------------------------------------- */
/* exact corridor binding                                          */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.corridor_assessment_ref =
        'synthetic:corridor:other';
    });

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    false
  );

  assert.ok(
    result.blocking_reasons.some(
      item =>
        item.code ===
        'CORRIDOR_ASSESSMENT_REF_MISMATCH'
    )
  );
}

/* target policy identity mismatch */
{
  const result =
    evaluate(input => {
      input.target_policy_ref =
        'synthetic:target:other';
    });

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    false
  );

  assert.ok(
    result.blocking_reasons.some(
      item =>
        item.code ===
        'TARGET_POLICY_REF_MISMATCH'
    )
  );
}

/* explicit target policy context mismatch */
{
  const result =
    evaluate(input => {
      input.target_policy_context.target_policy_id =
        'synthetic:target:other';
    });

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    false
  );

  assert.ok(
    result.blocking_reasons.some(
      item =>
        item.code ===
        'TARGET_POLICY_CONTEXT_REF_MISMATCH'
    )
  );
}

/* --------------------------------------------------------------- */
/* pricing policy is explicit; never inferred                      */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.governed_target.pricing_policy =
        'premium';
    });

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    false
  );

  assert.ok(
    result.blocking_reasons.some(
      item =>
        item.code ===
        'PRICING_POLICY_AUTHORITY_MISMATCH'
    )
  );
}

/* --------------------------------------------------------------- */
/* governance cannot manufacture new price                         */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.governed_target.value =
        111;
    });

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    false
  );

  assert.ok(
    result.blocking_reasons.some(
      item =>
        item.code ===
        'GOVERNED_TARGET_VALUE_MISMATCH'
    )
  );
}

/* zero remains real */
{
  const input =
    baseDecision();

  input.governed_target.value =
    0;

  input.corridor_result.strategic_target.value =
    0;

  input.corridor_result.economic_floor.value =
    0;

  input.corridor_result.affordability_ceiling.value =
    0;

  const result =
    evaluatePricingGovernanceDecision(
      input
    );

  assert.strictEqual(
    result.governed_target.value,
    0
  );
}

/* --------------------------------------------------------------- */
/* exact dimensions                                                */
/* --------------------------------------------------------------- */

for (
  const [
    key,
    changedValue,
    expectedCode
  ] of [
    [
      'offer_id',
      'home_saas',
      'OFFER_MISMATCH'
    ],
    [
      'segment_id',
      'other-segment',
      'SEGMENT_MISMATCH'
    ],
    [
      'scenario_id',
      'expanded',
      'SCENARIO_MISMATCH'
    ],
    [
      'currency',
      'EUR',
      'CURRENCY_MISMATCH'
    ],
    [
      'unit',
      'currency_per_school_month',
      'UNIT_MISMATCH'
    ],
    [
      'scope_ref',
      'synthetic:scope:B',
      'SCOPE_MISMATCH'
    ],
    [
      'effective_date',
      '2099-02-01',
      'EFFECTIVE_DATE_MISMATCH'
    ]
  ]
) {
  const result =
    evaluate(input => {
      input[key] =
        changedValue;
    });

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    false
  );

  assert.ok(
    result.blocking_reasons.some(
      item =>
        item.code === expectedCode
    )
  );
}

/* --------------------------------------------------------------- */
/* below floor with ready upstream support can be approved         */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.status =
        'approved';

      input.approval = {
        approver_ref:
          'approver:synthetic',

        approved_at:
          '2099-01-02T00:00:00Z',

        approval_ref:
          'approval:synthetic'
      };

      input.governed_target.value =
        90;

      input.corridor_result.status =
        'below_economic_floor';

      input.corridor_result.strategic_target.value =
        90;

      input.corridor_result.subsidy_required =
        true;

      input.corridor_result.support_context = {
        adaptation_status:
          'adapted',

        source_support_policy: {
          status:
            'approved',

          type:
            'subsidy',

          amount_or_rule:
            'synthetic rule',

          source_ref:
            'synthetic:support',

          evidence_refs: []
        },

        subsidy_policy: {
          status:
            'approved',

          type:
            'subsidized',

          amount_or_rule:
            'synthetic rule',

          source_ref:
            'synthetic:support'
        }
      };
    });

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    true
  );

  assert.strictEqual(
    result.analytical_snapshot.status,
    'below_economic_floor'
  );
}

/* below floor without ready support cannot be approved */
{
  const result =
    evaluate(input => {
      input.status =
        'approved';

      input.approval = {
        approver_ref:
          'approver:synthetic',

        approved_at:
          '2099-01-02T00:00:00Z',

        approval_ref:
          'approval:synthetic'
      };

      input.governed_target.value =
        90;

      input.corridor_result.status =
        'below_economic_floor';

      input.corridor_result.strategic_target.value =
        90;

      input.corridor_result.subsidy_required =
        true;
    });

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    false
  );

  assert.ok(
    result.blocking_reasons.some(
      item =>
        item.code ===
        'BELOW_FLOOR_SUPPORT_NOT_READY'
    )
  );
}

/* --------------------------------------------------------------- */
/* non-approvable analytical states                                */
/* --------------------------------------------------------------- */

for (const corridorStatus of [
  'incomplete_cost_basis',
  'conflicting_evidence',
  'manual_review_required',
  'above_affordability_ceiling'
]) {
  const result =
    evaluate(input => {
      input.status =
        'approved';

      input.approval = {
        approver_ref:
          'approver:synthetic',

        approved_at:
          '2099-01-02T00:00:00Z',

        approval_ref:
          'approval:synthetic'
      };

      input.corridor_result.status =
        corridorStatus;
    });

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    false
  );
}

/* no affordability may still be governance-approved,
   but remains analytically explicit and implies no WTP */
{
  const result =
    evaluate(input => {
      input.status =
        'approved';

      input.approval = {
        approver_ref:
          'approver:synthetic',

        approved_at:
          '2099-01-02T00:00:00Z',

        approval_ref:
          'approval:synthetic'
      };

      input.corridor_result.status =
        'no_affordability_evidence';

      input.corridor_result.affordability_ceiling.value =
        null;

      input.corridor_result.affordability_ceiling.available =
        false;
    });

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    true
  );

  assert.strictEqual(
    result.analytical_snapshot.status,
    'no_affordability_evidence'
  );

  assert.strictEqual(
    result.analytical_snapshot
      .affordability_ceiling_value,
    null
  );
}

/* --------------------------------------------------------------- */
/* analytical/governance provenance separation                     */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate();

  assert.deepStrictEqual(
    result.governance_evidence_refs,
    [
      'evidence:governance'
    ]
  );

  assert.ok(
    result.analytical_evidence_refs.includes(
      'evidence:target'
    )
  );

  assert.strictEqual(
    result.analytical_evidence_refs.includes(
      'evidence:governance'
    ),
    false
  );

  assert.deepStrictEqual(
    result.analytical_market_context_refs,
    [
      'context:target',
      'context:affordability'
    ]
  );

  assert.strictEqual(
    result.governance_evidence_refs.includes(
      'context:target'
    ),
    false
  );
}

/* --------------------------------------------------------------- */
/* no false proof / no persistence / no publication                */
/* --------------------------------------------------------------- */

{
  const serialized =
    JSON.stringify(
      evaluate()
    );

  for (const forbidden of [
    'validated_willingness_to_pay',
    'validated_demand',
    'profitability_validated',
    'market_acceptance_validated',
    'product_market_fit',
    'published',
    'persisted',
    'billing_activated'
  ]) {
    assert.strictEqual(
      serialized.includes(forbidden),
      false
    );
  }
}

console.log(
  'FINROOM_R5_PRICING_GOVERNANCE_SMOKE=PASS'
);

console.log(
  'FINROOM_R5_PRICING_GOVERNANCE_TRANSITIONS=PASS'
);

console.log(
  'FINROOM_R5_PRICING_GOVERNANCE_APPROVAL_SAFETY=PASS'
);

console.log(
  'FINROOM_R5_PRICING_GOVERNANCE_PROVENANCE_SEPARATION=PASS'
);

console.log(
  'FINROOM_R5_PRICING_GOVERNANCE_NO_AUTO_PRICE=PASS'
);

/* R5 SEMANTIC REPAIR — GOVERNANCE AUTHORITY + SUPERSESSION */

{
  const input =
    baseDecision();

  input.governed_target.pricing_policy =
    'premium';

  /*
   * Even if a governance-local context copies the same arbitrary
   * policy, B3.5 remains authoritative.
   */
  input.target_policy_context.pricing_policy =
    'premium';

  const result =
    evaluatePricingGovernanceDecision(
      input
    );

  assert.strictEqual(
    result.ready_for_declared_governance_status,
    false
  );

  assert.ok(
    result.blocking_reasons.some(
      item =>
        item.code ===
        'PRICING_POLICY_AUTHORITY_MISMATCH'
    )
  );
}

mustThrow(input => {
  input.status = 'proposed';

  input.supersession = {
    supersedes_decision_ref: null,
    superseded_by_decision_ref:
      'synthetic:decision:B'
  };
});

mustThrow(input => {
  input.status = 'approved';

  input.approval = {
    approver_ref:
      'approver:synthetic',

    approved_at:
      '2099-01-02T00:00:00Z',

    approval_ref:
      'approval:synthetic'
  };

  input.supersession = {
    supersedes_decision_ref: null,
    superseded_by_decision_ref:
      'synthetic:decision:B'
  };
});

mustThrow(input => {
  input.status = 'rejected';

  input.supersession = {
    supersedes_decision_ref: null,
    superseded_by_decision_ref:
      'synthetic:decision:B'
  };
});

mustThrow(input => {
  input.supersession = {
    supersedes_decision_ref:
      input.pricing_decision_id,

    superseded_by_decision_ref: null
  };
});

mustThrow(input => {
  input.status = 'superseded';

  input.supersession = {
    supersedes_decision_ref: null,

    superseded_by_decision_ref:
      input.pricing_decision_id
  };
});

{
  const input =
    baseDecision();

  input.status = 'superseded';

  input.supersession = {
    supersedes_decision_ref:
      'synthetic:decision:OLDER',

    superseded_by_decision_ref:
      'synthetic:decision:B'
  };

  validatePricingGovernanceDecisionInput(
    input
  );
}

console.log(
  'FINROOM_R5_PRICING_GOVERNANCE_POLICY_AUTHORITY_REPAIR=PASS'
);

console.log(
  'FINROOM_R5_PRICING_GOVERNANCE_SUPERSESSION_HARDENING=PASS'
);
