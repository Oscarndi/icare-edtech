'use strict';

/*
 * ICARE FinRoom R5 B3.1 synthetic contract smoke.
 *
 * No real ICARE financial value, supplier value,
 * customer value or willingness-to-pay claim is used here.
 */

const assert = require('assert');

const {
  R5_B3_CORRIDOR_ENUMS,
  validateEconomicCorridorStatus,
  validateR5PricingPolicy,
  validateEconomicFloorCostLevel,
  validateAffordabilityEvidenceStatus,
  validateB3Scenario,
  validateEconomicFloor,
  validateStrategicTarget,
  validateAffordabilityCeiling,
  validateSubsidyPolicy,
  validateEconomicCorridorInput
} = require('../api/_finroom-model');

function expectInvalid(fn, label) {
  assert.throws(
    fn,
    /FINROOM_MODEL_INVALID/,
    label
  );
}

function floor(overrides = {}) {
  return {
    value: 100,
    cost_level: 'full_economic_cost',
    cost_basis_ref:
      'synthetic:cost-basis:fixture',
    completeness_status:
      'complete_for_declared_scope',
    provenance:
      'synthetic B3.1 cost fixture only',
    source_type: 'internal_estimate',
    confidence: 'low',
    evidence_refs: [],
    ...overrides
  };
}

function target(overrides = {}) {
  return {
    value: 120,
    pricing_policy: 'penetration',
    rationale:
      'Synthetic management decision only.',
    provenance:
      'synthetic B3.1 target fixture only',
    source_type: 'management_target',
    assumption_status: 'to_validate',
    confidence: 'low',
    evidence_refs: [],
    ...overrides
  };
}

function ceiling(overrides = {}) {
  return {
    value: 150,
    evidence_status: 'preliminary_estimate',
    provenance:
      'synthetic affordability fixture only',
    source_type: 'market_reference',
    confidence: 'low',
    evidence_refs: [],
    ...overrides
  };
}

function unavailableCeiling() {
  return {
    value: null,
    evidence_status: 'unavailable',
    provenance:
      'No affordability evidence established.',
    source_type: null,
    confidence: null,
    evidence_refs: []
  };
}

function subsidy(overrides = {}) {
  return {
    status: 'declared',
    type: 'subsidized',
    amount_or_rule:
      'synthetic explicit subsidy rule',
    source_ref:
      'synthetic:subsidy-policy',
    ...overrides
  };
}

function corridor(overrides = {}) {
  return {
    corridor_id: 'synthetic-corridor',
    offer_id: 'school_b2b2c',
    segment_id: 'synthetic-segment',
    scenario_id: 'current',
    currency: 'XAF',
    price_unit:
      'currency_per_learner_month',
    effective_date: '2099-01-01',

    configuration_ref:
      'opaque:techroom:configuration:v1',

    technical_change_ref:
      'opaque:techroom:change:candidate',

    scenario_ref:
      'synthetic:financial-scenario',

    economic_floor: floor(),
    strategic_target: target(),
    affordability_ceiling: ceiling(),

    subsidy_policy: null,

    notes:
      'Synthetic B3.1 contract fixture only.',

    ...overrides
  };
}

/* --------------------------------------------------------- */
/* ENUMS                                                     */
/* --------------------------------------------------------- */

assert(
  R5_B3_CORRIDOR_ENUMS
    .corridor_status
    .includes('valid_corridor')
);

assert(
  R5_B3_CORRIDOR_ENUMS
    .pricing_policy
    .includes('value_based')
);

assert.strictEqual(
  validateEconomicCorridorStatus(
    'valid_corridor'
  ),
  'valid_corridor'
);

assert.strictEqual(
  validateR5PricingPolicy(
    'penetration'
  ),
  'penetration'
);

assert.strictEqual(
  validateEconomicFloorCostLevel(
    'full_economic_cost'
  ),
  'full_economic_cost'
);

assert.strictEqual(
  validateAffordabilityEvidenceStatus(
    'preliminary_estimate'
  ),
  'preliminary_estimate'
);

assert.strictEqual(
  validateB3Scenario('current'),
  'current'
);

assert.strictEqual(
  validateB3Scenario('expanded'),
  'expanded'
);

/* --------------------------------------------------------- */
/* ACCEPT                                                    */
/* --------------------------------------------------------- */

assert.doesNotThrow(() =>
  validateEconomicCorridorInput(
    corridor()
  )
);

/* Exact equality corridor boundary is representable. */
assert.doesNotThrow(() =>
  validateEconomicCorridorInput(
    corridor({
      economic_floor: floor({
        value: 100
      }),
      strategic_target: target({
        value: 100
      }),
      affordability_ceiling: ceiling({
        value: 100
      })
    })
  )
);

/* Zero remains a real value. */
assert.doesNotThrow(() =>
  validateEconomicCorridorInput(
    corridor({
      economic_floor: floor({
        value: 0
      }),
      strategic_target: target({
        value: 0
      }),
      affordability_ceiling: ceiling({
        value: 0
      })
    })
  )
);

/* Expanded scenario. */
assert.doesNotThrow(() =>
  validateEconomicCorridorInput(
    corridor({
      scenario_id: 'expanded'
    })
  )
);

/*
 * Ceiling unavailable:
 * null is absence, never zero or infinity.
 */
assert.doesNotThrow(() =>
  validateEconomicCorridorInput(
    corridor({
      affordability_ceiling:
        unavailableCeiling()
    })
  )
);

/*
 * Below-floor target may be represented only
 * with explicit subsidy documentation.
 */
assert.doesNotThrow(() =>
  validateEconomicCorridorInput(
    corridor({
      strategic_target: target({
        value: 80,
        pricing_policy: 'subsidized'
      }),
      subsidy_policy: subsidy()
    })
  )
);

/* Preliminary competitor context is representable. */
assert.doesNotThrow(() =>
  validateEconomicCorridorInput(
    corridor({
      affordability_ceiling: ceiling({
        source_type:
          'competitor_reference',
        evidence_status:
          'preliminary_estimate'
      })
    })
  )
);

/* Public/statistical purchasing-power source may inform affordability. */
assert.doesNotThrow(() =>
  validateEconomicCorridorInput(
    corridor({
      affordability_ceiling: ceiling({
        source_type:
          'statutory_source',
        evidence_status:
          'observed',
        evidence_refs: [
          'synthetic:statistical-source'
        ]
      })
    })
  )
);

/*
 * Incomplete cost basis is representable for a later
 * server-derived incomplete_cost_basis result.
 */
assert.doesNotThrow(() =>
  validateEconomicCorridorInput(
    corridor({
      economic_floor: floor({
        completeness_status:
          'incomplete_required_costs'
      })
    })
  )
);

/*
 * TechRoom refs are opaque traceability only.
 */
assert.doesNotThrow(() =>
  validateEconomicCorridorInput(
    corridor({
      configuration_ref:
        'opaque:configuration:next',
      technical_change_ref:
        'opaque:change:component-replacement',
      scenario_ref:
        'synthetic:candidate:change-impact'
    })
  )
);

/* --------------------------------------------------------- */
/* REJECT                                                    */
/* --------------------------------------------------------- */

expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        economic_floor: floor({
          value: -1
        })
      })
    ),
  'negative floor rejects'
);

expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        strategic_target: target({
          value: -1
        })
      })
    ),
  'negative target rejects'
);

expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        affordability_ceiling:
          ceiling({
            value: -1
          })
      })
    ),
  'negative ceiling rejects'
);

expectInvalid(
  () => {
    const x = corridor();
    delete x.price_unit;
    validateEconomicCorridorInput(x);
  },
  'missing price unit rejects'
);

expectInvalid(
  () => {
    const x = corridor();
    delete x.effective_date;
    validateEconomicCorridorInput(x);
  },
  'missing effective date rejects'
);

expectInvalid(
  () => {
    const x = corridor();
    delete x.offer_id;
    validateEconomicCorridorInput(x);
  },
  'missing offer rejects'
);

expectInvalid(
  () => {
    const x = corridor();
    delete x.segment_id;
    validateEconomicCorridorInput(x);
  },
  'missing segment rejects'
);

expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        scenario_id: 'progressive'
      })
    ),
  'progressive corridor deferred'
);

expectInvalid(
  () => {
    const x = corridor();
    delete x.economic_floor.cost_level;
    validateEconomicCorridorInput(x);
  },
  'missing floor level rejects'
);

expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        economic_floor: floor({
          cost_level:
            'manufacturing_cost'
        })
      })
    ),
  'invalid floor level rejects'
);

/* Competitor price cannot establish internal cost floor. */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        economic_floor: floor({
          source_type:
            'competitor_reference'
        })
      })
    ),
  'competitor cannot establish floor'
);

/* Management target cannot establish affordability. */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        affordability_ceiling: ceiling({
          source_type:
            'management_target'
        })
      })
    ),
  'management target cannot establish affordability'
);

/* Technical fixture cannot establish affordability. */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        affordability_ceiling: ceiling({
          source_type:
            'technical_fixture'
        })
      })
    ),
  'technical fixture cannot establish affordability'
);

/*
 * Competitor reference alone cannot be promoted to
 * validated affordability.
 */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        affordability_ceiling: ceiling({
          source_type:
            'competitor_reference',
          evidence_status:
            'validated_for_declared_scope',
          evidence_refs: [
            'synthetic:competitor'
          ]
        })
      })
    ),
  'competitor alone cannot validate affordability'
);

/* Validated affordability requires explicit evidence refs. */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        affordability_ceiling: ceiling({
          source_type:
            'customer_interview',
          evidence_status:
            'validated_for_declared_scope',
          evidence_refs: []
        })
      })
    ),
  'validated affordability needs evidence refs'
);

/* Missing affordability contract is not infinity. */
expectInvalid(
  () => {
    const x = corridor();
    delete x.affordability_ceiling;
    validateEconomicCorridorInput(x);
  },
  'missing ceiling contract rejects'
);

/* unavailable != zero */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        affordability_ceiling: {
          ...unavailableCeiling(),
          value: 0
        }
      })
    ),
  'unavailable cannot become zero'
);

/* unavailable cannot fabricate source */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        affordability_ceiling: {
          ...unavailableCeiling(),
          source_type:
            'market_reference'
        }
      })
    ),
  'unavailable cannot fabricate source'
);

/* Below floor requires explicit subsidy. */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        strategic_target: target({
          value: 80
        }),
        subsidy_policy: null
      })
    ),
  'below floor without subsidy rejects'
);

/* Invalid subsidy semantics reject. */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        strategic_target: target({
          value: 80
        }),
        subsidy_policy: subsidy({
          type: 'premium'
        })
      })
    ),
  'invalid subsidy type rejects'
);

/*
 * Caller cannot claim a final corridor result.
 */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        status: 'valid_corridor'
      })
    ),
  'caller result status rejects'
);

/*
 * Hidden FX seams reject.
 */
for (const key of [
  'fx_rate',
  'fx_policy',
  'currency_conversion',
  'converted_currency'
]) {
  expectInvalid(
    () =>
      validateEconomicCorridorInput(
        corridor({
          [key]:
            'synthetic-hidden-fx'
        })
      ),
    key + ' rejects'
  );
}

/* Nested currency creates undeclared FX authority. */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        strategic_target: target({
          currency: 'USD'
        })
      })
    ),
  'nested currency rejects'
);

/*
 * Empty technical-change/configuration refs do not establish
 * traceability.
 */
expectInvalid(
  () =>
    validateEconomicCorridorInput(
      corridor({
        technical_change_ref: ''
      })
    ),
  'empty technical change ref rejects'
);

console.log(
  'FINROOM_R5_ECONOMIC_CORRIDOR_SMOKE=PASS'
);
