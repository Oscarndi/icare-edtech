'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const {
  validateEconomicCorridorRequest,
  projectEconomicCorridorForClient,
  evaluateEconomicCorridorRequest
} = require('../api/_finroom-model');

const endpoint =
  require('../api/finroom-simulate');

function baseRequest() {
  return {
    corridor_assessment_id:
      'synthetic:b3-6:corridor:A',

    floor_input: {
      floor_basis_id:
        'synthetic:b3-6:floor:A',

      offer_id:
        'school_b2b2c',

      segment_id:
        'synthetic-segment',

      scenario_id:
        'current',

      requested_cost_level:
        'full_economic_cost',

      cost_basis_ref:
        'synthetic:b3-6:cost-basis:A',

      configuration_ref:
        'synthetic:b3-6:config:A',

      technical_change_ref:
        'synthetic:b3-6:change:A',

      actual_basis: {
        currency:
          'XAF',

        unit:
          'currency_per_learner_month',

        scope_ref:
          'synthetic:b3-6:scope:A',

        effective_date:
          '2099-01-01'
      },

      required_context: {
        currency:
          'XAF',

        unit:
          'currency_per_learner_month',

        scope_ref:
          'synthetic:b3-6:scope:A',

        floor_purpose:
          'full_economic_sustainability'
      },

      completeness_status:
        'complete_for_declared_scope',

      reconciliation_status:
        'resolved',

      coverage_status:
        'resolved',

      allocation: {
        required:
          false,

        status:
          'not_required',

        basis:
          null,

        driver:
          null,

        lifecycle_or_period:
          null,

        utilization_or_capacity:
          null,

        evidence_refs: []
      },

      provenance:
        'synthetic B3.6 floor fixture',

      source_type:
        'internal_estimate',

      confidence:
        'low',

      evidence_refs: [
        'synthetic:b3-6:floor:evidence'
      ],

      notes:
        'synthetic B3.6 smoke'
    },

    target_policy_input: {
      target_policy_id:
        'synthetic:b3-6:target:A',

      offer_id:
        'school_b2b2c',

      segment_id:
        'synthetic-segment',

      scenario_id:
        'current',

      strategic_target: {
        value:
          110,

        currency:
          'XAF',

        unit:
          'currency_per_learner_month',

        scope_ref:
          'synthetic:b3-6:scope:A',

        effective_date:
          '2099-01-01',

        pricing_policy:
          'market_alignment',

        rationale:
          'Synthetic B3.6 management target',

        provenance:
          'synthetic B3.6 target fixture',

        source_type:
          'management_target',

        assumption_status:
          'current_assumption',

        confidence:
          'low',

        evidence_refs: [
          'synthetic:b3-6:target:evidence'
        ]
      },

      floor_context: {
        value:
          100,

        currency:
          'XAF',

        unit:
          'currency_per_learner_month',

        scope_ref:
          'synthetic:b3-6:scope:A',

        floor_cost_level:
          'direct_technical_cost',

        floor_basis_ref:
          'client:fake:floor',

        floor_eligibility_status:
          'conflicting_evidence',

        offer_id:
          'school_b2b2c',

        segment_id:
          'synthetic-segment',

        scenario_id:
          'current',

        evidence_refs: [
          'client:fake:floor:evidence'
        ]
      },

      support_policy:
        null,

      market_context_refs: [
        'synthetic:b3-6:target:context'
      ],

      decision_status:
        'proposed',

      configuration_ref:
        'synthetic:b3-6:config:A',

      technical_change_ref:
        'synthetic:b3-6:change:A',

      notes:
        'synthetic B3.6 smoke'
    },

    affordability_input: {
      affordability_basis_id:
        'synthetic:b3-6:affordability:A',

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
        'synthetic:b3-6:scope:A',

      effective_date:
        '2099-01-01',

      geography_ref:
        'synthetic:b3-6:geography:A',

      affordability_ceiling: {
        evidence_status:
          'observed',

        value:
          120,

        provenance:
          'synthetic B3.6 affordability fixture',

        source_type:
          'pilot_observation',

        confidence:
          'low',

        evidence_refs: [
          'synthetic:b3-6:affordability:evidence'
        ]
      },

      market_context_refs: [
        'synthetic:b3-6:affordability:context'
      ],

      methodology_ref:
        'synthetic:b3-6:methodology:A',

      validation_protocol_ref:
        null,

      configuration_ref:
        'synthetic:b3-6:config:A',

      technical_change_ref:
        'synthetic:b3-6:change:A',

      notes:
        'synthetic B3.6 smoke'
    },

    notes:
      'Synthetic authenticated corridor exposure smoke.'
  };
}

function evaluate(mutator) {
  const input =
    baseRequest();

  if (mutator) {
    mutator(input);
  }

  return evaluateEconomicCorridorRequest(
    input
  );
}

assert.strictEqual(
  typeof validateEconomicCorridorRequest,
  'function'
);

assert.strictEqual(
  typeof projectEconomicCorridorForClient,
  'function'
);

assert.strictEqual(
  typeof evaluateEconomicCorridorRequest,
  'function'
);

assert.strictEqual(
  typeof endpoint.validateEnvelope,
  'function'
);

const envelope =
  endpoint.validateEnvelope({
    operation:
      'economic_corridor',

    corridor:
      baseRequest()
  });

assert.strictEqual(
  envelope.operation,
  'economic_corridor'
);

for (const forbidden of [
  'overrides',
  'options',
  'scenarios'
]) {
  assert.throws(
    () =>
      endpoint.validateEnvelope({
        operation:
          'economic_corridor',

        corridor:
          baseRequest(),

        [forbidden]:
          forbidden === 'scenarios'
            ? []
            : {}
      })
  );
}

for (const forbidden of [
  'floor_result',
  'target_policy_result',
  'affordability_result',
  'economic_floor',
  'strategic_target',
  'affordability_ceiling',
  'final_status',
  'ready_for_final_target_policy',
  'ready_for_corridor_use'
]) {
  assert.throws(
    () =>
      endpoint.validateEnvelope({
        operation:
          'economic_corridor',

        corridor: {
          ...baseRequest(),
          [forbidden]: {}
        }
      })
  );
}

assert.throws(
  () =>
    endpoint.validateEnvelope({
      operation:
        'economic_corridor'
    })
);

assert.throws(
  () =>
    endpoint.validateEnvelope({
      operation:
        'single_simulation',

      overrides: {},

      corridor:
        baseRequest()
    })
);

const result =
  evaluate();

assert.strictEqual(
  result.kind,
  'economic_corridor'
);

assert.strictEqual(
  result.status,
  'valid_corridor'
);

assert.strictEqual(
  result.economic_floor.value,
  100
);

assert.strictEqual(
  result.economic_floor.status,
  'eligible_final'
);

assert.strictEqual(
  result.economic_floor.cost_level,
  'full_economic_cost'
);

assert.strictEqual(
  result.strategic_target.value,
  110
);

assert.strictEqual(
  result.strategic_target.status,
  'ready_at_or_above_floor'
);

assert.strictEqual(
  result.strategic_target.pricing_policy,
  'market_alignment'
);

assert.strictEqual(
  result.affordability_ceiling.value,
  120
);

assert.strictEqual(
  result.headroom,
  10
);

for (const [where, field, value] of [
  ['floor', 'offer_id', 'home_saas'],
  ['floor', 'segment_id', 'other-segment'],
  ['floor', 'scenario_id', 'expanded'],
  ['floor_basis', 'currency', 'USD'],
  ['floor_basis', 'unit', 'currency_per_month'],
  ['floor_basis', 'scope_ref', 'synthetic:scope:OTHER'],
  ['floor_basis', 'effective_date', '2099-02-01']
]) {
  assert.throws(
    () =>
      evaluate(input => {
        if (where === 'floor') {
          input.floor_input[field] =
            value;
        } else {
          input.floor_input
            .actual_basis[field] =
              value;
        }
      })
  );
}

{
  const equality =
    evaluate(input => {
      input.target_policy_input
        .strategic_target.value =
          100;

      input.affordability_input
        .affordability_ceiling.value =
          100;
    });

  assert.strictEqual(
    equality.status,
    'valid_corridor'
  );

  assert.strictEqual(
    equality.floor_gap,
    0
  );

  assert.strictEqual(
    equality.headroom,
    0
  );
}

{
  const unavailable =
    evaluate(input => {
      input.affordability_input
        .affordability_ceiling = {
          evidence_status:
            'unavailable',

          value:
            null,

          provenance:
            'synthetic unavailable',

          source_type:
            null,

          confidence:
            null,

          evidence_refs: []
        };
    });

  assert.strictEqual(
    unavailable.status,
    'no_affordability_evidence'
  );

  assert.strictEqual(
    unavailable.affordability_ceiling.value,
    null
  );
}

const serialized =
  JSON.stringify(result);

for (const forbidden of [
  'floor_input',
  'target_policy_input',
  'affordability_input',
  'evidence_refs',
  'market_context_refs',
  'evidence_by_authority',
  'market_context_by_authority',
  'source_ref',
  'configuration_ref',
  'technical_change_ref',
  'support_context',
  'amount_or_rule',
  'FINROOM_MODEL_JSON'
]) {
  assert.strictEqual(
    serialized.includes(forbidden),
    false
  );
}

assert.deepStrictEqual(
  result.semantics,
  {
    evaluation_server_authoritative:
      true,

    floor_metadata_server_authoritative:
      true,

    floor_value_source:
      'declared_input',

    floor_value_server_sourced:
      false,

    required_support_gap_is_diagnostic:
      true,

    required_support_gap_is_approved_support:
      false,

    affordability_is_not_wtp_validation:
      true,

    corridor_is_not_demand_validation:
      true,

    corridor_is_not_profitability_proof:
      true,

    corridor_is_not_market_acceptance:
      true
  }
);


/*
 * B3.6 monetary-floor authority semantics:
 * B3.2 metadata is server-evaluated, while the monetary
 * floor value remains a declared analytical input.
 */
{
  const low =
    evaluate(input => {
      input.target_policy_input
        .floor_context.value =
          100;
    });

  const high =
    evaluate(input => {
      input.target_policy_input
        .floor_context.value =
          105;
    });

  assert.strictEqual(
    low.economic_floor.value,
    100
  );

  assert.strictEqual(
    high.economic_floor.value,
    105
  );

  assert.strictEqual(
    low.semantics
      .floor_value_source,
    'declared_input'
  );

  assert.strictEqual(
    low.semantics
      .floor_value_server_sourced,
    false
  );

  assert.strictEqual(
    low.semantics
      .evaluation_server_authoritative,
    true
  );

  assert.strictEqual(
    low.semantics
      .floor_metadata_server_authoritative,
    true
  );
}

/*
 * required_support_gap is a diagnostic calculation only.
 */
{
  const below =
    evaluate(input => {
      input.target_policy_input
        .strategic_target.value =
          90;
    });

  assert.strictEqual(
    below.status,
    'below_economic_floor'
  );

  assert.strictEqual(
    below.required_support_gap,
    10
  );

  assert.strictEqual(
    below.semantics
      .required_support_gap_is_diagnostic,
    true
  );

  assert.strictEqual(
    below.semantics
      .required_support_gap_is_approved_support,
    false
  );
}

/*
 * Projection must not forward arbitrary evaluator-owned
 * messages/codes/status values.
 */
{
  const projected =
    projectEconomicCorridorForClient({
      corridor_assessment_id:
        'synthetic:b3-6:projection-safety',

      status:
        'manual_review_required',

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
          'synthetic:b3-6:scope:A',

        effective_date:
          '2099-01-01'
      },

      economic_floor: {
        value:
          100,

        eligibility_status:
          'eligible_final',

        requested_cost_level:
          'full_economic_cost'
      },

      strategic_target: {
        value:
          110,

        target_policy_status:
          'ready_at_or_above_floor',

        pricing_policy:
          'market_alignment'
      },

      affordability_ceiling: {
        value:
          120,

        status:
          'ceiling_observed',

        evidence_status:
          'observed',

        available:
          true,

        usable:
          true
      },

      floor_gap:
        10,

      affordability_headroom:
        10,

      subsidy_required:
        false,

      required_support_gap:
        0,

      blocking_reasons: [
        {
          status:
            'SECRET-BLOCKING-STATUS',

          code:
            'SECRET-BLOCKING-CODE'
        }
      ],

      diagnostics: [
        {
          severity:
            'warning',

          code:
            'SECRET-DIAGNOSTIC-CODE',

          message:
            'SECRET-DIAGNOSTIC-MESSAGE'
        }
      ]
    });

  const projectionSerialized =
    JSON.stringify(projected);

  for (const secret of [
    'SECRET-BLOCKING-STATUS',
    'SECRET-BLOCKING-CODE',
    'SECRET-DIAGNOSTIC-CODE',
    'SECRET-DIAGNOSTIC-MESSAGE'
  ]) {
    assert.strictEqual(
      projectionSerialized.includes(secret),
      false
    );
  }

  assert.deepStrictEqual(
    projected.blocking_reasons,
    [
      {
        code:
          'corridor_blocking_condition'
      }
    ]
  );

  assert.deepStrictEqual(
    projected.diagnostics,
    [
      {
        severity:
          'warning',

        code:
          'corridor_diagnostic'
      }
    ]
  );
}

/*
 * The over-broad legacy authority label must disappear.
 */
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(
    result.semantics,
    'server_authoritative'
  ),
  false
);

const endpointSource =
  fs.readFileSync(
    path.join(
      __dirname,
      '../api/finroom-simulate.js'
    ),
    'utf8'
  );

for (const token of [
  "'economic_corridor'",
  "'corridor'",
  'evaluateEconomicCorridorRequest',
  "case 'economic_corridor':"
]) {
  assert.strictEqual(
    endpointSource.includes(token),
    true
  );
}

assert.strictEqual(
  endpointSource.includes(
    'evaluatePricingGovernanceDecision'
  ),
  false
);

console.log(
  'FINROOM_R5_B3_6_CORRIDOR_ENDPOINT_SMOKE=PASS'
);

console.log(
  'FINROOM_R5_B3_6_SERVER_AUTHORITY=PASS'
);

console.log(
  'FINROOM_R5_B3_6_EXACT_DIMENSIONS=PASS'
);

console.log(
  'FINROOM_R5_B3_6_SELECTIVE_DISCLOSURE=PASS'
);

console.log(
  'FINROOM_R5_B3_6_CLAIM_SAFETY=PASS'
);

console.log(
  'FINROOM_R5_B3_6_MONETARY_FLOOR_AUTHORITY_SEMANTICS=PASS'
);

console.log(
  'FINROOM_R5_B3_6_REQUIRED_SUPPORT_GAP_DIAGNOSTIC_ONLY=PASS'
);

console.log(
  'FINROOM_R5_B3_6_DIAGNOSTIC_SANITIZATION=PASS'
);

console.log(
  'FINROOM_R5_B3_6_GOVERNANCE_SEPARATION=PASS'
);
