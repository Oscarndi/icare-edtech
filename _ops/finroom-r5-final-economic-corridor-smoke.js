'use strict';

const assert =
  require('node:assert/strict');

const {
  R5_B3_5_ENUMS,
  validateFinalEconomicCorridorStatus,
  validateFinalEconomicCorridorInput,
  adaptTargetSupportToSubsidyPolicy,
  evaluateFinalEconomicCorridor
} = require('../api/_finroom-model');

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

const base = {
  corridor_assessment_id:
    'synthetic:b3-5:corridor',

  floor_basis_id:
    'synthetic:floor:A',

  target_policy_id:
    'synthetic:target:A',

  affordability_basis_id:
    'synthetic:affordability:A',

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

  floor_result: {
    floor_basis_id:
      'synthetic:floor:A',

    requested_cost_level:
      'full_economic_cost',

    eligibility_status:
      'eligible_final',

    eligible_for_final_floor:
      true,

    eligible_as_lower_bound:
      false,

    blocking_reasons: [],

    diagnostics: [],

    cost_basis_ref:
      'synthetic:cost-basis:A',

    configuration_ref:
      'synthetic:config:A',

    technical_change_ref:
      'synthetic:change:A',

    evidence_refs: [
      'evidence:floor'
    ]
  },

  target_policy_result: {
    target_policy_id:
      'synthetic:target:A',

    status:
      'ready_at_or_above_floor',

    target_value:
      110,

    floor_value:
      100,

    relation_to_floor:
      'above',

    subsidy_required:
      false,

    required_support_gap:
      null,

    ready_for_final_target_policy:
      true,

    blocking_reasons: [],

    diagnostics: [],

    floor_basis_ref:
      'synthetic:floor:A',

    configuration_ref:
      'synthetic:config:A',

    technical_change_ref:
      'synthetic:change:A',

    evidence_refs: [
      'evidence:floor',
      'evidence:target'
    ],

    market_context_refs: [
      'context:target'
    ]
  },

  affordability_result: {
    affordability_basis_id:
      'synthetic:affordability:A',

    status:
      'ceiling_observed',

    ceiling_available:
      true,

    ceiling_value:
      120,

    evidence_status:
      'observed',

    ready_for_corridor_use:
      true,

    blocking_reasons: [],

    diagnostics: [],

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

    geography_ref:
      'synthetic:geography',

    methodology_ref:
      'synthetic:methodology',

    validation_protocol_ref:
      null,

    configuration_ref:
      'synthetic:config:A',

    technical_change_ref:
      'synthetic:change:A',

    evidence_refs: [
      'evidence:affordability'
    ],

    market_context_refs: [
      'context:affordability'
    ]
  },

  support_policy:
    null,

  notes:
    'Synthetic B3.5 permanent smoke only.'
};

function evaluate(mutator) {
  const input =
    clone(base);

  if (mutator) {
    mutator(input);
  }

  validateFinalEconomicCorridorInput(
    input
  );

  return evaluateFinalEconomicCorridor(
    input
  );
}

/* --------------------------------------------------------------- */
/* Frozen status vocabulary                                        */
/* --------------------------------------------------------------- */

const expectedStatuses = [
  'valid_corridor',
  'below_economic_floor',
  'above_affordability_ceiling',
  'no_affordability_evidence',
  'incomplete_cost_basis',
  'conflicting_evidence',
  'manual_review_required'
];

for (const status of expectedStatuses) {
  assert.strictEqual(
    validateFinalEconomicCorridorStatus(
      status
    ),
    status
  );
}

assert.ok(
  Object.isFrozen(
    R5_B3_5_ENUMS
  )
);

/* --------------------------------------------------------------- */
/* A. floor < target < ceiling => valid                            */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate();

  assert.strictEqual(
    result.status,
    'valid_corridor'
  );

  assert.strictEqual(
    result.economic_floor.value,
    100
  );

  assert.strictEqual(
    result.strategic_target.value,
    110
  );

  assert.strictEqual(
    result.affordability_ceiling.value,
    120
  );
}

/* --------------------------------------------------------------- */
/* B/C/D. equality remains valid                                   */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.target_policy_result.target_value =
        100;

      input.target_policy_result.relation_to_floor =
        'equal';
    });

  assert.strictEqual(
    result.status,
    'valid_corridor'
  );
}

{
  const result =
    evaluate(input => {
      input.target_policy_result.target_value =
        120;

      input.target_policy_result.relation_to_floor =
        'above';
    });

  assert.strictEqual(
    result.status,
    'valid_corridor'
  );
}

{
  const result =
    evaluate(input => {
      input.target_policy_result.target_value =
        0;

      input.target_policy_result.floor_value =
        0;

      input.target_policy_result.relation_to_floor =
        'equal';

      input.affordability_result.ceiling_value =
        0;
    });

  assert.strictEqual(
    result.status,
    'valid_corridor'
  );

  assert.strictEqual(
    result.economic_floor.value,
    0
  );

  assert.strictEqual(
    result.strategic_target.value,
    0
  );

  assert.strictEqual(
    result.affordability_ceiling.value,
    0
  );
}

/* --------------------------------------------------------------- */
/* E. below final floor without support                            */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.target_policy_result.target_value =
        90;

      input.target_policy_result.relation_to_floor =
        'below';

      input.target_policy_result.status =
        'below_floor_without_support';

      input.target_policy_result.subsidy_required =
        true;

      input.target_policy_result.required_support_gap =
        10;

      input.target_policy_result.ready_for_final_target_policy =
        false;
    });

  assert.strictEqual(
    result.status,
    'below_economic_floor'
  );

  assert.strictEqual(
    result.subsidy_required,
    true
  );

  assert.strictEqual(
    result.required_support_gap,
    10
  );
}

/* --------------------------------------------------------------- */
/* F. below floor with accepted explicit support stays below floor */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.target_policy_result.target_value =
        90;

      input.target_policy_result.relation_to_floor =
        'below';

      input.target_policy_result.status =
        'ready_below_floor_with_support';

      input.target_policy_result.subsidy_required =
        true;

      input.target_policy_result.required_support_gap =
        10;

      input.support_policy = {
        status:
          'approved',

        type:
          'subsidy',

        amount_or_rule:
          'synthetic documented support rule',

        source_ref:
          'synthetic:support:source',

        evidence_refs: [
          'evidence:support'
        ]
      };
    });

  assert.strictEqual(
    result.status,
    'below_economic_floor'
  );

  assert.strictEqual(
    result.support_context.adaptation_status,
    'adapted'
  );

  assert.deepStrictEqual(
    result.support_context.subsidy_policy,
    {
      status:
        'approved',

      type:
        'subsidized',

      amount_or_rule:
        'synthetic documented support rule',

      source_ref:
        'synthetic:support:source'
    }
  );

  /*
   * The analytical gap is preserved independently from the
   * documented support rule; the adapter must not manufacture
   * a subsidy amount from floor-target arithmetic.
   */
  assert.strictEqual(
    result.support_context
      .subsidy_policy
      .amount_or_rule,
    'synthetic documented support rule'
  );
}

/* --------------------------------------------------------------- */
/* Explicit support vocabulary mappings                            */
/* --------------------------------------------------------------- */

for (
  const [sourceType, expectedType] of [
    [
      'subsidy',
      'subsidized'
    ],
    [
      'cross_subsidy',
      'cross_subsidized'
    ],
    [
      'custom_documented_support',
      'custom_documented'
    ]
  ]
) {
  const adapted =
    adaptTargetSupportToSubsidyPolicy({
      status:
        'identified',

      type:
        sourceType,

      amount_or_rule:
        'synthetic rule',

      source_ref:
        'synthetic:source',

      evidence_refs: []
    });

  assert.strictEqual(
    adapted.status,
    'adapted'
  );

  assert.strictEqual(
    adapted.subsidy_policy.type,
    expectedType
  );
}

/* --------------------------------------------------------------- */
/* G. target above usable ceiling                                  */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.target_policy_result.target_value =
        130;

      input.target_policy_result.relation_to_floor =
        'above';
    });

  assert.strictEqual(
    result.status,
    'above_affordability_ceiling'
  );
}

/* --------------------------------------------------------------- */
/* H. unavailable ceiling is not infinity                          */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.affordability_result.status =
        'ceiling_unavailable';

      input.affordability_result.ceiling_available =
        false;

      input.affordability_result.ceiling_value =
        null;

      input.affordability_result.evidence_status =
        'unavailable';

      input.affordability_result.ready_for_corridor_use =
        false;

      input.affordability_result.evidence_refs =
        [];
    });

  assert.strictEqual(
    result.status,
    'no_affordability_evidence'
  );

  assert.strictEqual(
    result.affordability_ceiling.value,
    null
  );

  assert.strictEqual(
    result.affordability_headroom,
    null
  );
}

/* --------------------------------------------------------------- */
/* I. non-final floor => incomplete cost basis                     */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.floor_result.eligibility_status =
        'eligible_lower_bound';

      input.floor_result.eligible_for_final_floor =
        false;

      input.floor_result.eligible_as_lower_bound =
        true;

      input.target_policy_result.status =
        'floor_not_final';

      input.target_policy_result.ready_for_final_target_policy =
        false;
    });

  assert.strictEqual(
    result.status,
    'incomplete_cost_basis'
  );
}

/* --------------------------------------------------------------- */
/* J. conflicting floor evidence has highest precedence            */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.floor_result.eligibility_status =
        'conflicting_evidence';

      input.floor_result.eligible_for_final_floor =
        false;

      input.floor_result.blocking_reasons = [
        {
          status:
            'conflicting_evidence',

          code:
            'SYNTHETIC_CONFLICT'
        }
      ];

      input.currency =
        'EUR';
    });

  assert.strictEqual(
    result.status,
    'conflicting_evidence'
  );
}

/* --------------------------------------------------------------- */
/* K. upstream affordability manual review                         */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.affordability_result.status =
        'manual_review_required';

      input.affordability_result.ready_for_corridor_use =
        false;

      input.affordability_result.evidence_status =
        'validated_for_declared_scope';
    });

  assert.strictEqual(
    result.status,
    'manual_review_required'
  );
}

/* --------------------------------------------------------------- */
/* L-N. dimension mismatch => manual review, no arithmetic claim   */
/* --------------------------------------------------------------- */

for (
  const [
    field,
    changedValue,
    expectedCode
  ] of [
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
    ],
    [
      'segment_id',
      'other-segment',
      'SEGMENT_MISMATCH'
    ]
  ]
) {
  const result =
    evaluate(input => {
      input[field] =
        changedValue;
    });

  assert.strictEqual(
    result.status,
    'manual_review_required'
  );

  assert.ok(
    result.diagnostics.some(
      item =>
        item.code === expectedCode
    )
  );
}

/* --------------------------------------------------------------- */
/* O. explicit artifact identity mismatch => manual review         */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.target_policy_id =
        'synthetic:target:other';
    });

  assert.strictEqual(
    result.status,
    'manual_review_required'
  );

  assert.ok(
    result.diagnostics.some(
      item =>
        item.code ===
        'TARGET_POLICY_ID_MISMATCH'
    )
  );
}

/* --------------------------------------------------------------- */
/* P. contradictory final floor > usable ceiling => conflict       */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.target_policy_result.floor_value =
        130;

      input.target_policy_result.target_value =
        120;

      input.target_policy_result.relation_to_floor =
        'below';

      input.target_policy_result.status =
        'ready_below_floor_with_support';

      input.target_policy_result.subsidy_required =
        true;

      input.target_policy_result.required_support_gap =
        10;

      input.affordability_result.ceiling_value =
        110;

      input.support_policy = {
        status:
          'approved',

        type:
          'cross_subsidy',

        amount_or_rule:
          'synthetic cross-support rule',

        source_ref:
          'synthetic:cross-support',

        evidence_refs: []
      };
    });

  assert.strictEqual(
    result.status,
    'conflicting_evidence'
  );

  assert.ok(
    result.diagnostics.some(
      item =>
        item.code ===
        'FINAL_FLOOR_ABOVE_AFFORDABILITY_CEILING'
    )
  );
}

/* --------------------------------------------------------------- */
/* Q. preliminary ceiling may be compared without maturity upgrade */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.affordability_result.status =
        'ceiling_preliminary';

      input.affordability_result.evidence_status =
        'preliminary_estimate';

      input.affordability_result.ready_for_corridor_use =
        true;
    });

  assert.strictEqual(
    result.status,
    'valid_corridor'
  );

  assert.strictEqual(
    result.affordability_ceiling.status,
    'ceiling_preliminary'
  );

  assert.strictEqual(
    result.affordability_ceiling.evidence_status,
    'preliminary_estimate'
  );
}

/* --------------------------------------------------------------- */
/* R. unresolved support => manual review                          */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate(input => {
      input.target_policy_result.target_value =
        90;

      input.target_policy_result.relation_to_floor =
        'below';

      input.target_policy_result.status =
        'manual_review_required';

      input.target_policy_result.subsidy_required =
        true;

      input.target_policy_result.required_support_gap =
        10;

      input.target_policy_result.ready_for_final_target_policy =
        false;

      input.support_policy = {
        status:
          'unresolved',

        type:
          'subsidy',

        amount_or_rule:
          'synthetic unresolved rule',

        source_ref:
          null,

        evidence_refs: []
      };
    });

  assert.strictEqual(
    result.status,
    'manual_review_required'
  );

  assert.strictEqual(
    result.support_context.adaptation_status,
    'not_ready'
  );
}

/* --------------------------------------------------------------- */
/* S. provenance channels remain separate                          */
/* --------------------------------------------------------------- */

{
  const input =
    clone(base);

  input.support_policy = {
    status:
      'identified',

    type:
      'custom_documented_support',

    amount_or_rule:
      'synthetic documented rule',

    source_ref:
      'synthetic:support',

    evidence_refs: [
      'evidence:support'
    ]
  };

  const result =
    evaluateFinalEconomicCorridor(
      input
    );

  assert.deepStrictEqual(
    result.evidence_by_authority.floor,
    [
      'evidence:floor'
    ]
  );

  assert.deepStrictEqual(
    result.evidence_by_authority.affordability,
    [
      'evidence:affordability'
    ]
  );

  assert.deepStrictEqual(
    result.market_context_by_authority.target_policy,
    [
      'context:target'
    ]
  );

  assert.deepStrictEqual(
    result.market_context_by_authority.affordability,
    [
      'context:affordability'
    ]
  );

  assert.ok(
    result.evidence_refs.includes(
      'evidence:target'
    )
  );

  assert.ok(
    result.evidence_refs.includes(
      'evidence:support'
    )
  );

  assert.strictEqual(
    result.evidence_refs.includes(
      'context:target'
    ),
    false
  );

  assert.strictEqual(
    result.evidence_refs.includes(
      'context:affordability'
    ),
    false
  );

  assert.deepStrictEqual(
    result.market_context_refs,
    [
      'context:target',
      'context:affordability'
    ]
  );
}

/* --------------------------------------------------------------- */
/* T. context alone cannot change classification                   */
/* --------------------------------------------------------------- */

{
  const withoutContext =
    clone(base);

  withoutContext.target_policy_result.market_context_refs =
    [];

  withoutContext.affordability_result.market_context_refs =
    [];

  const withContext =
    clone(base);

  withContext.target_policy_result.market_context_refs = [
    'context:one'
  ];

  withContext.affordability_result.market_context_refs = [
    'context:two'
  ];

  const resultA =
    evaluateFinalEconomicCorridor(
      withoutContext
    );

  const resultB =
    evaluateFinalEconomicCorridor(
      withContext
    );

  assert.strictEqual(
    resultA.status,
    resultB.status
  );

  assert.strictEqual(
    resultA.floor_gap,
    resultB.floor_gap
  );

  assert.strictEqual(
    resultA.affordability_headroom,
    resultB.affordability_headroom
  );
}

/* --------------------------------------------------------------- */
/* U. no false proof fields                                        */
/* --------------------------------------------------------------- */

{
  const result =
    evaluate();

  const serialized =
    JSON.stringify(result);

  for (const forbidden of [
    'validated_willingness_to_pay',
    'validated_demand',
    'market_acceptance_validated',
    'profitability_validated',
    'product_market_fit'
  ]) {
    assert.strictEqual(
      serialized.includes(forbidden),
      false
    );
  }
}

console.log(
  'FINROOM_R5_FINAL_ECONOMIC_CORRIDOR_SMOKE=PASS'
);

console.log(
  'FINROOM_R5_B3_5_SUPPORT_ADAPTER=PASS'
);

console.log(
  'FINROOM_R5_B3_5_PROVENANCE_CHANNEL_SEPARATION=PASS'
);

console.log(
  'FINROOM_R5_B3_5_DECISION_PRECEDENCE=PASS'
);
