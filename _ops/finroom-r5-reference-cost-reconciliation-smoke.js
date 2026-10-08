'use strict';

/*
 * R5-B2 synthetic contract smoke.
 *
 * No real ICARE financial value, supplier price,
 * procurement secret or official business assumption
 * is present in this file.
 */

const assert = require('assert');

const {
  R5_REFERENCE_COST_ENUMS,
  validateReferenceCostCoverage,
  validateReferenceTechnicalCostEvidence,
  validateReferenceTechnicalCostEvidenceSet,
  validateCostAllocation
} = require('../api/_finroom-model');

function expectInvalid(fn, label) {
  assert.throws(
    fn,
    undefined,
    label
  );
}

function coverage(overrides = {}) {
  return {
    material: 'unknown',
    component: 'unknown',
    fabrication: 'unknown',
    assembly: 'unknown',
    integration: 'unknown',
    provisioning: 'unknown',
    freight: 'unknown',
    customs: 'unknown',
    tax: 'unknown',
    installation: 'unknown',
    deployment: 'unknown',
    packaging: 'unknown',
    testing: 'unknown',
    warranty: 'unknown',
    other_declared: [],
    ...overrides
  };
}

function money(
  value = 100,
  sourceType = 'technical_fixture'
) {
  return {
    value,
    currency: 'XAF',
    unit: 'synthetic-unit',
    scope: 'synthetic-test-only',
    provenance:
      'synthetic B2 smoke fixture',
    source_type: sourceType,
    assumption_status: 'to_validate',
    effective_date: '2099-01-01',
    confidence: 'low',
    evidence_refs: []
  };
}

function evidence(overrides = {}) {
  return {
    cost_item_id:
      'fixture-reference-cost',
    technical_ref:
      'opaque:fixture:device',
    technical_ref_type:
      'opaque_reference',
    technical_scope:
      'synthetic-device',
    technical_label:
      'Synthetic reference-only device',
    quantity: 1,
    unit_of_measure: 'unit',
    procurement_or_fabrication_mode:
      'purchased',
    cost_origin:
      'purchased_component',
    cost_class:
      'hardware_capex',
    unit_cost: money(),
    cost_coverage: coverage(),
    provenance:
      'synthetic B2 smoke fixture',
    source_type:
      'technical_fixture',
    assumption_status:
      'to_validate',
    effective_date:
      '2099-01-01',
    confidence: 'low',
    evidence_refs: [],
    legacy_cost_ref:
      'legacy:none',
    reconciliation_classification:
      'not_in_legacy',
    reconciliation_action:
      'include_new',
    completeness_status:
      'complete_for_declared_scope',
    notes:
      'Synthetic test only.',
    public_exposure: false,
    ...overrides
  };
}

assert.ok(
  R5_REFERENCE_COST_ENUMS &&
  typeof R5_REFERENCE_COST_ENUMS ===
    'object'
);

assert.strictEqual(
  validateReferenceCostCoverage(
    coverage({
      freight: 'included'
    })
  ).freight,
  'included'
);

assert.strictEqual(
  validateReferenceCostCoverage(
    coverage({
      freight: 'excluded'
    })
  ).freight,
  'excluded'
);

/* opaque technical_ref accepted */
assert.strictEqual(
  validateReferenceTechnicalCostEvidence(
    evidence()
  ).technical_ref,
  'opaque:fixture:device'
);

/* component-like granularity without component_id */
assert.strictEqual(
  validateReferenceTechnicalCostEvidence(
    evidence({
      cost_item_id:
        'fixture-component-like',
      technical_ref:
        'opaque:fixture:component-like',
      technical_ref_type:
        'component'
    })
  ).technical_ref_type,
  'component'
);

/* purchased parent alone */
assert.doesNotThrow(() =>
  validateReferenceTechnicalCostEvidenceSet([
    evidence({
      cost_item_id:
        'fixture-parent',
      technical_ref:
        'opaque:fixture:parent',
      technical_scope:
        'synthetic-parent',
      overlap_group_ref:
        'group-parent'
    })
  ])
);

/* child decomposition alone */
assert.doesNotThrow(() =>
  validateReferenceTechnicalCostEvidenceSet([
    evidence({
      cost_item_id:
        'fixture-child-a',
      technical_ref:
        'opaque:fixture:child-a',
      technical_scope:
        'synthetic-child-a'
    }),
    evidence({
      cost_item_id:
        'fixture-child-b',
      technical_ref:
        'opaque:fixture:child-b',
      technical_scope:
        'synthetic-child-b'
    })
  ])
);

/* explicit incremental assembly may coexist */
assert.doesNotThrow(() =>
  validateReferenceTechnicalCostEvidenceSet([
    evidence({
      cost_item_id:
        'fixture-parent-assembly',
      technical_ref:
        'opaque:fixture:parent-assembly',
      technical_scope:
        'synthetic-parent'
    }),
    evidence({
      cost_item_id:
        'fixture-incremental-assembly',
      technical_ref:
        'opaque:fixture:assembly',
      technical_ref_type:
        'assembly',
      technical_scope:
        'synthetic-assembly',
      cost_origin: 'assembly',
      parent_cost_item_ref:
        'fixture-parent-assembly',
      incremental_to_parent: true
    })
  ])
);

/* fully-in-legacy duplicate is representable but excluded */
assert.doesNotThrow(() =>
  validateReferenceTechnicalCostEvidenceSet([
    evidence({
      cost_item_id:
        'fixture-legacy-covered',
      technical_ref:
        'opaque:fixture:legacy-covered',
      technical_scope:
        'synthetic-legacy-covered',
      legacy_cost_ref:
        'hardware.tablet_unit_cost',
      reconciliation_classification:
        'fully_in_legacy',
      reconciliation_action:
        'exclude_duplicate'
    })
  ])
);

/* unknown overlap remains representable */
assert.doesNotThrow(() =>
  validateReferenceTechnicalCostEvidenceSet([
    evidence({
      cost_item_id:
        'fixture-unresolved',
      technical_ref:
        'opaque:fixture:unresolved',
      technical_scope:
        'synthetic-unresolved',
      legacy_cost_ref:
        'hardware.box_budget_per_class',
      reconciliation_classification:
        'unknown_requires_validation',
      reconciliation_action:
        'manual_review_required',
      completeness_status:
        'partial_known_gaps'
    })
  ])
);

/* partial completeness is analytical only */
assert.strictEqual(
  validateReferenceTechnicalCostEvidence(
    evidence({
      cost_item_id:
        'fixture-partial',
      technical_ref:
        'opaque:fixture:partial',
      technical_scope:
        'synthetic-partial',
      completeness_status:
        'partial_known_gaps'
    })
  ).completeness_status,
  'partial_known_gaps'
);

/* explicit one-time allocation metadata */
assert.doesNotThrow(() =>
  validateCostAllocation({
    allocation_id:
      'fixture-allocation',
    source_cost_ref:
      'fixture-reference-cost',
    offer_id:
      'school_b2b2c',
    segment_id:
      'fixture-segment',
    allocation_basis:
      'per_class',
    allocation_driver:
      'synthetic classes served',
    allocation_period:
      'synthetic lifecycle period',
    allocated_value: 0,
    currency: 'XAF',
    assumptions: {
      lifecycle_months: 1
    },
    evidence_refs: [],
    status: 'TEST_ONLY'
  })
);

/* duplicate same technical cost item */
expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidenceSet([
      evidence({
        cost_item_id:
          'fixture-duplicate',
        technical_ref:
          'opaque:fixture:dup-a',
        technical_scope:
          'synthetic-dup-a'
      }),
      evidence({
        cost_item_id:
          'fixture-duplicate',
        technical_ref:
          'opaque:fixture:dup-b',
        technical_scope:
          'synthetic-dup-b'
      })
    ]),
  'duplicate cost item must reject'
);

/* parent + overlapping child without incremental flag */
expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidenceSet([
      evidence({
        cost_item_id:
          'fixture-parent-overlap',
        technical_ref:
          'opaque:fixture:parent-overlap',
        technical_scope:
          'synthetic-parent-overlap'
      }),
      evidence({
        cost_item_id:
          'fixture-child-overlap',
        technical_ref:
          'opaque:fixture:child-overlap',
        technical_scope:
          'synthetic-child-overlap',
        parent_cost_item_ref:
          'fixture-parent-overlap',
        incremental_to_parent: false
      })
    ]),
  'parent child overlap must reject'
);

/* legacy duplicate cannot be included as new */
expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidence(
      evidence({
        cost_item_id:
          'fixture-bad-legacy',
        technical_ref:
          'opaque:fixture:bad-legacy',
        technical_scope:
          'synthetic-bad-legacy',
        legacy_cost_ref:
          'hardware.tablet_unit_cost',
        reconciliation_classification:
          'fully_in_legacy',
        reconciliation_action:
          'include_new'
      })
    ),
  'legacy duplicate included as new must reject'
);

/* unknown reconciliation cannot enter final aggregate */
expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidenceSet(
      [
        evidence({
          cost_item_id:
            'fixture-final-unresolved',
          technical_ref:
            'opaque:fixture:final-unresolved',
          technical_scope:
            'synthetic-final-unresolved',
          source_type:
            'internal_estimate',
          unit_cost:
            money(
              100,
              'internal_estimate'
            ),
          legacy_cost_ref:
            'hardware.box_budget_per_class',
          reconciliation_classification:
            'unknown_requires_validation',
          reconciliation_action:
            'manual_review_required'
        })
      ],
      {
        final_aggregate: true
      }
    ),
  'unknown final aggregate must reject'
);

/* landed quote already includes freight */
expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidenceSet([
      evidence({
        cost_item_id:
          'fixture-landed-parent',
        technical_ref:
          'opaque:fixture:landed-parent',
        technical_scope:
          'synthetic-landed-parent',
        overlap_group_ref:
          'landed-group',
        cost_coverage:
          coverage({
            freight: 'included'
          })
      }),
      evidence({
        cost_item_id:
          'fixture-extra-freight',
        technical_ref:
          'opaque:fixture:extra-freight',
        technical_scope:
          'synthetic-extra-freight',
        overlap_group_ref:
          'landed-group',
        supplemental_charge_type:
          'freight',
        cost_origin:
          'shipping'
      })
    ]),
  'included freight cannot be added again'
);

/* included tax cannot be added again */
expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidenceSet([
      evidence({
        cost_item_id:
          'fixture-tax-parent',
        technical_ref:
          'opaque:fixture:tax-parent',
        technical_scope:
          'synthetic-tax-parent',
        overlap_group_ref:
          'tax-group',
        cost_coverage:
          coverage({
            tax: 'included'
          })
      }),
      evidence({
        cost_item_id:
          'fixture-extra-tax',
        technical_ref:
          'opaque:fixture:extra-tax',
        technical_scope:
          'synthetic-extra-tax',
        overlap_group_ref:
          'tax-group',
        supplemental_charge_type:
          'tax',
        cost_class:
          'tax_cost'
      })
    ]),
  'included tax cannot be added again'
);

expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidence(
      evidence({
        provenance: ''
      })
    ),
  'missing provenance must reject'
);

expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidence(
      evidence({
        effective_date: ''
      })
    ),
  'missing effective date must reject'
);

expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidence(
      evidence({
        source_type:
          'unsupported-source'
      })
    ),
  'unsupported source type must reject'
);

expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidence(
      evidence({
        quantity: -1
      })
    ),
  'negative quantity must reject'
);

expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidence(
      evidence({
        unit_cost:
          money(-1)
      })
    ),
  'negative monetary value must reject'
);

/* recurring allocation without allocation basis */
expectInvalid(
  () =>
    validateCostAllocation({
      allocation_id:
        'fixture-bad-allocation',
      source_cost_ref:
        'fixture-reference-cost',
      offer_id:
        'school_b2b2c',
      segment_id:
        'fixture-segment',
      allocation_driver:
        'synthetic driver',
      allocation_period:
        'synthetic period',
      allocated_value: 0,
      currency: 'XAF',
      assumptions: {},
      evidence_refs: [],
      status: 'TEST_ONLY'
    }),
  'allocation basis is mandatory'
);

/* test fixture cannot be exposed as public official evidence */
expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidence(
      evidence({
        public_exposure: true
      })
    ),
  'technical fixture public exposure must reject'
);


/*
 * Same technical identity may legitimately carry
 * multiple distinct economic cost lines.
 */
assert.doesNotThrow(() =>
  validateReferenceTechnicalCostEvidenceSet([
    evidence({
      cost_item_id:
        'fixture-same-device-acquisition',
      technical_ref:
        'opaque:fixture:same-device',
      technical_scope:
        'synthetic-same-device',
      cost_origin:
        'purchased_component',
      cost_class:
        'hardware_capex'
    }),
    evidence({
      cost_item_id:
        'fixture-same-device-installation',
      technical_ref:
        'opaque:fixture:same-device',
      technical_scope:
        'synthetic-same-device',
      cost_origin:
        'installation',
      cost_class:
        'installation_cost'
    })
  ])
);

/*
 * A contributing final-aggregate cost cannot retain
 * unresolved coverage.
 */
expectInvalid(
  () =>
    validateReferenceTechnicalCostEvidenceSet(
      [
        evidence({
          cost_item_id:
            'fixture-final-unknown-coverage',
          technical_ref:
            'opaque:fixture:final-unknown-coverage',
          technical_scope:
            'synthetic-final-unknown-coverage',
          source_type:
            'internal_estimate',
          unit_cost:
            money(
              100,
              'internal_estimate'
            ),
          cost_coverage:
            coverage({
              material: 'excluded',
              component: 'excluded',
              fabrication: 'excluded',
              assembly: 'excluded',
              integration: 'excluded',
              provisioning: 'excluded',
              freight: 'unknown',
              customs: 'excluded',
              tax: 'excluded',
              installation: 'excluded',
              deployment: 'excluded',
              packaging: 'excluded',
              testing: 'excluded',
              warranty: 'excluded'
            })
        })
      ],
      {
        final_aggregate: true
      }
    ),
  'unknown coverage cannot enter final aggregate'
);

/*
 * A complete contributing line with explicit coverage
 * may enter a final aggregate.
 */
assert.doesNotThrow(() =>
  validateReferenceTechnicalCostEvidenceSet(
    [
      evidence({
        cost_item_id:
          'fixture-final-known-coverage',
        technical_ref:
          'opaque:fixture:final-known-coverage',
        technical_scope:
          'synthetic-final-known-coverage',
        source_type:
          'internal_estimate',
        unit_cost:
          money(
            100,
            'internal_estimate'
          ),
        cost_coverage:
          coverage({
            material: 'excluded',
            component: 'included',
            fabrication: 'excluded',
            assembly: 'excluded',
            integration: 'excluded',
            provisioning: 'excluded',
            freight: 'excluded',
            customs: 'excluded',
            tax: 'excluded',
            installation: 'excluded',
            deployment: 'excluded',
            packaging: 'excluded',
            testing: 'excluded',
            warranty: 'excluded'
          })
      })
    ],
    {
      final_aggregate: true
    }
  )
);

/*
 * A non-contributing fully-covered legacy duplicate may
 * remain auditable even when its detailed coverage is
 * partially unknown, because it contributes no new cost.
 */
assert.doesNotThrow(() =>
  validateReferenceTechnicalCostEvidenceSet(
    [
      evidence({
        cost_item_id:
          'fixture-final-legacy-excluded',
        technical_ref:
          'opaque:fixture:final-legacy-excluded',
        technical_scope:
          'synthetic-final-legacy-excluded',
        source_type:
          'internal_estimate',
        unit_cost:
          money(
            100,
            'internal_estimate'
          ),
        legacy_cost_ref:
          'hardware.tablet_unit_cost',
        reconciliation_classification:
          'fully_in_legacy',
        reconciliation_action:
          'exclude_duplicate'
      })
    ],
    {
      final_aggregate: true
    }
  )
);

console.log(
  'FINROOM_R5_REFERENCE_COST_RECONCILIATION_SMOKE=PASS'
);
