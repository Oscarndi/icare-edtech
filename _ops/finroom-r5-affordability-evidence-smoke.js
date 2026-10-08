'use strict';

/*
 * ICARE FinRoom R5 B3.4 synthetic affordability-evidence smoke.
 *
 * No real customer identity, parent/learner data,
 * willingness-to-pay result, private contract,
 * partner negotiation or confidential market dataset
 * is used here.
 */

const assert = require('assert');

const {
  R5_B3_4_ENUMS,
  validateAffordabilityEvidenceInput,
  evaluateAffordabilityEvidence
} = require('../api/_finroom-model');

function base(overrides = {}) {
  return {
    affordability_basis_id:
      'synthetic-affordability-basis',

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

    affordability_ceiling: {
      evidence_status:
        'preliminary_estimate',

      value: 120,

      provenance:
        'synthetic B3.4 fixture',

      source_type:
        'market_reference',

      confidence:
        'low',

      evidence_refs: [],

      ...(overrides.affordability_ceiling || {})
    },

    market_context_refs:
      overrides.market_context_refs || [],

    methodology_ref:
      Object.prototype.hasOwnProperty.call(
        overrides,
        'methodology_ref'
      )
        ? overrides.methodology_ref
        : 'synthetic:methodology',

    validation_protocol_ref:
      Object.prototype.hasOwnProperty.call(
        overrides,
        'validation_protocol_ref'
      )
        ? overrides.validation_protocol_ref
        : null,

    configuration_ref:
      Object.prototype.hasOwnProperty.call(
        overrides,
        'configuration_ref'
      )
        ? overrides.configuration_ref
        : 'opaque:configuration:v1',

    technical_change_ref:
      Object.prototype.hasOwnProperty.call(
        overrides,
        'technical_change_ref'
      )
        ? overrides.technical_change_ref
        : 'opaque:change:v1',

    notes:
      'synthetic only',

    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) =>
          ![
            'affordability_ceiling',
            'market_context_refs',
            'methodology_ref',
            'validation_protocol_ref',
            'configuration_ref',
            'technical_change_ref'
          ].includes(key)
      )
    )
  };
}

function evaluate(overrides = {}) {
  return evaluateAffordabilityEvidence(
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

for (const status of [
  'ceiling_unavailable',
  'ceiling_preliminary',
  'ceiling_to_validate',
  'ceiling_observed',
  'ceiling_validated_for_declared_scope',
  'invalid_affordability_evidence',
  'scope_or_dimension_mismatch',
  'manual_review_required'
]) {
  assert(
    R5_B3_4_ENUMS
      .affordability_status
      .includes(status)
  );
}

/* --------------------------------------------------------- */
/* UNAVAILABLE                                               */
/* --------------------------------------------------------- */

let result = evaluate({
  affordability_ceiling: {
    evidence_status:
      'unavailable',

    value: null,

    provenance:
      'synthetic unavailable',

    source_type: null,
    confidence: null,
    evidence_refs: []
  }
});

assert.strictEqual(
  result.status,
  'ceiling_unavailable'
);

assert.strictEqual(
  result.ceiling_available,
  false
);

assert.strictEqual(
  result.ceiling_value,
  null
);

assert.strictEqual(
  result.ready_for_corridor_use,
  false
);

/*
 * Missing evidence must not become zero or infinity.
 */
assert.notStrictEqual(
  result.ceiling_value,
  0
);

assert.notStrictEqual(
  result.ceiling_value,
  Infinity
);

/* --------------------------------------------------------- */
/* PRELIMINARY                                               */
/* --------------------------------------------------------- */

result = evaluate();

assert.strictEqual(
  result.status,
  'ceiling_preliminary'
);

assert.strictEqual(
  result.ceiling_value,
  120
);

assert.strictEqual(
  result.ceiling_available,
  true
);

assert.strictEqual(
  result.ready_for_corridor_use,
  true
);

/* competitor reference is preliminary-capable */
result = evaluate({
  affordability_ceiling: {
    evidence_status:
      'preliminary_estimate',

    value: 100,

    provenance:
      'synthetic competitor context',

    source_type:
      'competitor_reference',

    confidence:
      'low',

    evidence_refs: [
      'synthetic:competitor'
    ]
  }
});

assert.strictEqual(
  result.status,
  'ceiling_preliminary'
);

/* --------------------------------------------------------- */
/* TO VALIDATE                                               */
/* --------------------------------------------------------- */

result = evaluate({
  affordability_ceiling: {
    evidence_status:
      'to_validate',

    value: 110,

    provenance:
      'synthetic interview candidate',

    source_type:
      'customer_interview',

    confidence:
      'low',

    evidence_refs: [
      'synthetic:interview'
    ]
  }
});

assert.strictEqual(
  result.status,
  'ceiling_to_validate'
);

assert.strictEqual(
  result.ready_for_corridor_use,
  true
);

/* --------------------------------------------------------- */
/* OBSERVED                                                  */
/* --------------------------------------------------------- */

for (const source_type of [
  'pilot_observation',
  'customer_interview'
]) {
  result = evaluate({
    affordability_ceiling: {
      evidence_status:
        'observed',

      value: 115,

      provenance:
        'synthetic observation',

      source_type,

      confidence:
        'medium',

      evidence_refs: [
        'synthetic:observation'
      ]
    }
  });

  assert.strictEqual(
    result.status,
    'ceiling_observed'
  );
}

/* --------------------------------------------------------- */
/* VALIDATED FOR DECLARED SCOPE                             */
/* --------------------------------------------------------- */

for (const source_type of [
  'contract',
  'pilot_observation'
]) {
  result = evaluate({
    affordability_ceiling: {
      evidence_status:
        'validated_for_declared_scope',

      value: 130,

      provenance:
        'synthetic validated fixture',

      source_type,

      confidence:
        'high',

      evidence_refs: [
        'synthetic:validated:evidence'
      ]
    },

    validation_protocol_ref:
      'synthetic:validation:protocol'
  });

  assert.strictEqual(
    result.status,
    'ceiling_validated_for_declared_scope'
  );

  assert.strictEqual(
    result.ceiling_available,
    true
  );

  assert.strictEqual(
    result.ready_for_corridor_use,
    true
  );
}

/*
 * B3.1 may structurally accept some validated sources,
 * but B3.4 requires a declared protocol for B3.4-final readiness.
 */
result = evaluate({
  affordability_ceiling: {
    evidence_status:
      'validated_for_declared_scope',

    value: 130,

    provenance:
      'synthetic validation without protocol',

    source_type:
      'contract',

    confidence:
      'high',

    evidence_refs: [
      'synthetic:validated:evidence'
    ]
  },

  validation_protocol_ref: null
});

assert.strictEqual(
  result.status,
  'manual_review_required'
);

assert.strictEqual(
  result.ready_for_corridor_use,
  false
);

assert.strictEqual(
  result.ceiling_value,
  130
);

/* --------------------------------------------------------- */
/* ZERO IS A REAL VALUE                                     */
/* --------------------------------------------------------- */

result = evaluate({
  affordability_ceiling: {
    evidence_status:
      'preliminary_estimate',

    value: 0,

    provenance:
      'synthetic zero boundary',

    source_type:
      'market_reference',

    confidence:
      'low',

    evidence_refs: []
  }
});

assert.strictEqual(
  result.status,
  'ceiling_preliminary'
);

assert.strictEqual(
  result.ceiling_value,
  0
);

assert.strictEqual(
  result.ceiling_available,
  true
);

/* --------------------------------------------------------- */
/* STRUCTURAL INVALIDITY — B3.1 AUTHORITY                   */
/* --------------------------------------------------------- */

expectInvalid(
  () => {
    const x = base({
      affordability_ceiling: {
        evidence_status:
          'unavailable',

        value: 1,

        provenance:
          'synthetic invalid unavailable',

        source_type: null,
        confidence: null,
        evidence_refs: []
      }
    });

    validateAffordabilityEvidenceInput(x);
  },
  'unavailable with numeric value rejects'
);

expectInvalid(
  () => {
    const x = base({
      affordability_ceiling: {
        evidence_status:
          'unavailable',

        value: null,

        provenance:
          'synthetic invalid unavailable',

        source_type:
          'market_reference',

        confidence: null,
        evidence_refs: []
      }
    });

    validateAffordabilityEvidenceInput(x);
  },
  'unavailable with source rejects'
);

expectInvalid(
  () => {
    const x = base({
      affordability_ceiling: {
        evidence_status:
          'unavailable',

        value: null,

        provenance:
          'synthetic invalid unavailable',

        source_type: null,

        confidence:
          'low',

        evidence_refs: []
      }
    });

    validateAffordabilityEvidenceInput(x);
  },
  'unavailable with confidence rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.affordability_ceiling.value = -1;

    validateAffordabilityEvidenceInput(x);
  },
  'negative ceiling rejects'
);

expectInvalid(
  () => {
    const x = base();
    x.affordability_ceiling.value = null;

    validateAffordabilityEvidenceInput(x);
  },
  'missing available ceiling rejects'
);

for (const source_type of [
  'management_target',
  'technical_fixture',
  'supplier_quote'
]) {
  expectInvalid(
    () => {
      const x = base();

      x.affordability_ceiling = {
        ...x.affordability_ceiling,
        source_type
      };

      validateAffordabilityEvidenceInput(x);
    },
    `non-affordability source rejects: ${source_type}`
  );
}

expectInvalid(
  () => {
    const x = base({
      affordability_ceiling: {
        evidence_status:
          'validated_for_declared_scope',

        value: 120,

        provenance:
          'synthetic competitor',

        source_type:
          'competitor_reference',

        confidence:
          'medium',

        evidence_refs: [
          'synthetic:competitor'
        ]
      },

      validation_protocol_ref:
        'synthetic:protocol'
    });

    validateAffordabilityEvidenceInput(x);
  },
  'validated competitor reference rejects'
);

expectInvalid(
  () => {
    const x = base({
      affordability_ceiling: {
        evidence_status:
          'validated_for_declared_scope',

        value: 120,

        provenance:
          'synthetic no evidence refs',

        source_type:
          'contract',

        confidence:
          'high',

        evidence_refs: []
      },

      validation_protocol_ref:
        'synthetic:protocol'
    });

    validateAffordabilityEvidenceInput(x);
  },
  'validated ceiling requires evidence refs'
);

/*
 * Nested/shadow currency remains prohibited by B3.1.
 */
expectInvalid(
  () => {
    const x = base();

    x.affordability_ceiling = {
      ...x.affordability_ceiling,
      currency: 'XAF'
    };

    validateAffordabilityEvidenceInput(x);
  },
  'shadow currency rejects'
);

/* --------------------------------------------------------- */
/* CURRENT / EXPANDED                                       */
/* --------------------------------------------------------- */

assert.strictEqual(
  evaluate({
    scenario_id: 'current'
  }).status,
  'ceiling_preliminary'
);

assert.strictEqual(
  evaluate({
    scenario_id: 'expanded'
  }).status,
  'ceiling_preliminary'
);

/* --------------------------------------------------------- */
/* TRACEABILITY                                             */
/* --------------------------------------------------------- */

result = evaluate({
  geography_ref:
    'opaque:geography:A',

  configuration_ref:
    'opaque:any-config',

  technical_change_ref:
    'opaque:any-change',

  market_context_refs: [
    'opaque:market-context:A'
  ]
});

assert.strictEqual(
  result.geography_ref,
  'opaque:geography:A'
);

assert.strictEqual(
  result.configuration_ref,
  'opaque:any-config'
);

assert.strictEqual(
  result.technical_change_ref,
  'opaque:any-change'
);

assert.strictEqual(
  result.evidence_refs.includes(
    'opaque:market-context:A'
  ),
  false
);

assert.deepStrictEqual(
  result.market_context_refs,
  [
    'opaque:market-context:A'
  ]
);

/* optional geography / tech refs */
result = evaluate({
  geography_ref: null,
  configuration_ref: null,
  technical_change_ref: null
});

assert.strictEqual(
  result.geography_ref,
  null
);

assert.strictEqual(
  result.configuration_ref,
  null
);

assert.strictEqual(
  result.technical_change_ref,
  null
);

/* --------------------------------------------------------- */
/* TECH CHANGE MUST NOT MUTATE CEILING                      */
/* --------------------------------------------------------- */

const before =
  evaluate({
    affordability_ceiling: {
      value: 120
    },

    technical_change_ref:
      'opaque:change:before'
  });

const after =
  evaluate({
    affordability_ceiling: {
      value: 120
    },

    technical_change_ref:
      'opaque:change:after'
  });

assert.strictEqual(
  before.ceiling_value,
  120
);

assert.strictEqual(
  after.ceiling_value,
  120
);

/* --------------------------------------------------------- */
/* NO TARGET / FLOOR / WTP / DEMAND CLAIM CREATION          */
/* --------------------------------------------------------- */

result = evaluate({
  affordability_ceiling: {
    evidence_status:
      'observed',

    value: 120,

    provenance:
      'synthetic observed evidence',

    source_type:
      'customer_interview',

    confidence:
      'medium',

    evidence_refs: [
      'synthetic:interview'
    ]
  }
});

for (const forbidden of [
  'validated_willingness_to_pay',
  'validated_demand',
  'market_acceptance_validated',
  'strategic_target',
  'economic_floor',
  'corridor_status'
]) {
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(
      result,
      forbidden
    ),
    false
  );
}

console.log(
  'FINROOM_R5_AFFORDABILITY_EVIDENCE_SMOKE=PASS'
);


/*
 * ICARE_R5_B3_4_PROVENANCE_CHANNEL_SEPARATION_TESTS_V1
 *
 * market_context_refs are contextual only.
 * They MUST NOT be promoted to affordability evidence and MUST NOT
 * change evidence maturity, availability, readiness or result status.
 *
 * Fixtures are copied from already-valid permanent B3.4 smoke cases.
 */
(() => {
  const assertProv =
    require('node:assert/strict');

  const {
    evaluateAffordabilityEvidence:
      evaluateAffordabilityEvidenceProv
  } = require('../api/_finroom-model');

  const capturedCases =
[
  {
    "raw": {
      "affordability_basis_id": "synthetic-affordability-basis",
      "offer_id": "school_b2b2c",
      "segment_id": "synthetic-segment",
      "scenario_id": "current",
      "currency": "XAF",
      "unit": "currency_per_learner_month",
      "scope_ref": "synthetic:scope:A",
      "effective_date": "2099-01-01",
      "geography_ref": "synthetic:geography",
      "affordability_ceiling": {
        "evidence_status": "unavailable",
        "value": null,
        "provenance": "synthetic unavailable",
        "source_type": null,
        "confidence": null,
        "evidence_refs": []
      },
      "market_context_refs": [],
      "methodology_ref": "synthetic:methodology",
      "validation_protocol_ref": null,
      "configuration_ref": "opaque:configuration:v1",
      "technical_change_ref": "opaque:change:v1",
      "notes": "synthetic only"
    },
    "status": "ceiling_unavailable",
    "ready_for_corridor_use": false,
    "ceiling_available": false
  },
  {
    "raw": {
      "affordability_basis_id": "synthetic-affordability-basis",
      "offer_id": "school_b2b2c",
      "segment_id": "synthetic-segment",
      "scenario_id": "current",
      "currency": "XAF",
      "unit": "currency_per_learner_month",
      "scope_ref": "synthetic:scope:A",
      "effective_date": "2099-01-01",
      "geography_ref": "synthetic:geography",
      "affordability_ceiling": {
        "evidence_status": "preliminary_estimate",
        "value": 120,
        "provenance": "synthetic B3.4 fixture",
        "source_type": "market_reference",
        "confidence": "low",
        "evidence_refs": []
      },
      "market_context_refs": [],
      "methodology_ref": "synthetic:methodology",
      "validation_protocol_ref": null,
      "configuration_ref": "opaque:configuration:v1",
      "technical_change_ref": "opaque:change:v1",
      "notes": "synthetic only"
    },
    "status": "ceiling_preliminary",
    "ready_for_corridor_use": true,
    "ceiling_available": true
  },
  {
    "raw": {
      "affordability_basis_id": "synthetic-affordability-basis",
      "offer_id": "school_b2b2c",
      "segment_id": "synthetic-segment",
      "scenario_id": "current",
      "currency": "XAF",
      "unit": "currency_per_learner_month",
      "scope_ref": "synthetic:scope:A",
      "effective_date": "2099-01-01",
      "geography_ref": "synthetic:geography",
      "affordability_ceiling": {
        "evidence_status": "to_validate",
        "value": 110,
        "provenance": "synthetic interview candidate",
        "source_type": "customer_interview",
        "confidence": "low",
        "evidence_refs": [
          "synthetic:interview"
        ]
      },
      "market_context_refs": [],
      "methodology_ref": "synthetic:methodology",
      "validation_protocol_ref": null,
      "configuration_ref": "opaque:configuration:v1",
      "technical_change_ref": "opaque:change:v1",
      "notes": "synthetic only"
    },
    "status": "ceiling_to_validate",
    "ready_for_corridor_use": true,
    "ceiling_available": true
  },
  {
    "raw": {
      "affordability_basis_id": "synthetic-affordability-basis",
      "offer_id": "school_b2b2c",
      "segment_id": "synthetic-segment",
      "scenario_id": "current",
      "currency": "XAF",
      "unit": "currency_per_learner_month",
      "scope_ref": "synthetic:scope:A",
      "effective_date": "2099-01-01",
      "geography_ref": "synthetic:geography",
      "affordability_ceiling": {
        "evidence_status": "observed",
        "value": 115,
        "provenance": "synthetic observation",
        "source_type": "pilot_observation",
        "confidence": "medium",
        "evidence_refs": [
          "synthetic:observation"
        ]
      },
      "market_context_refs": [],
      "methodology_ref": "synthetic:methodology",
      "validation_protocol_ref": null,
      "configuration_ref": "opaque:configuration:v1",
      "technical_change_ref": "opaque:change:v1",
      "notes": "synthetic only"
    },
    "status": "ceiling_observed",
    "ready_for_corridor_use": true,
    "ceiling_available": true
  },
  {
    "raw": {
      "affordability_basis_id": "synthetic-affordability-basis",
      "offer_id": "school_b2b2c",
      "segment_id": "synthetic-segment",
      "scenario_id": "current",
      "currency": "XAF",
      "unit": "currency_per_learner_month",
      "scope_ref": "synthetic:scope:A",
      "effective_date": "2099-01-01",
      "geography_ref": "synthetic:geography",
      "affordability_ceiling": {
        "evidence_status": "validated_for_declared_scope",
        "value": 130,
        "provenance": "synthetic validated fixture",
        "source_type": "contract",
        "confidence": "high",
        "evidence_refs": [
          "synthetic:validated:evidence"
        ]
      },
      "market_context_refs": [],
      "methodology_ref": "synthetic:methodology",
      "validation_protocol_ref": "synthetic:validation:protocol",
      "configuration_ref": "opaque:configuration:v1",
      "technical_change_ref": "opaque:change:v1",
      "notes": "synthetic only"
    },
    "status": "ceiling_validated_for_declared_scope",
    "ready_for_corridor_use": true,
    "ceiling_available": true
  },
  {
    "raw": {
      "affordability_basis_id": "synthetic-affordability-basis",
      "offer_id": "school_b2b2c",
      "segment_id": "synthetic-segment",
      "scenario_id": "current",
      "currency": "XAF",
      "unit": "currency_per_learner_month",
      "scope_ref": "synthetic:scope:A",
      "effective_date": "2099-01-01",
      "geography_ref": "synthetic:geography",
      "affordability_ceiling": {
        "evidence_status": "validated_for_declared_scope",
        "value": 130,
        "provenance": "synthetic validation without protocol",
        "source_type": "contract",
        "confidence": "high",
        "evidence_refs": [
          "synthetic:validated:evidence"
        ]
      },
      "market_context_refs": [],
      "methodology_ref": "synthetic:methodology",
      "validation_protocol_ref": null,
      "configuration_ref": "opaque:configuration:v1",
      "technical_change_ref": "opaque:change:v1",
      "notes": "synthetic only"
    },
    "status": "manual_review_required",
    "ready_for_corridor_use": false,
    "ceiling_available": true
  }
];

  assertProv.ok(
    capturedCases.length >= 3,
    'Expected multiple captured B3.4 semantic cases'
  );

  for (
    let index = 0;
    index < capturedCases.length;
    index += 1
  ) {
    const fixture =
      capturedCases[index];

    const withoutContext =
      JSON.parse(
        JSON.stringify(
          fixture.raw
        )
      );

    withoutContext.market_context_refs = [];

    const withContext =
      JSON.parse(
        JSON.stringify(
          fixture.raw
        )
      );

    const contextRef =
      'context:b3-4-provenance:' +
      index;

    withContext.market_context_refs = [
      contextRef
    ];

    const baseline =
      evaluateAffordabilityEvidenceProv(
        withoutContext
      );

    const result =
      evaluateAffordabilityEvidenceProv(
        withContext
      );

    assertProv.deepStrictEqual(
      result.evidence_refs,
      [
        ...withContext
          .affordability_ceiling
          .evidence_refs
      ],
      'Direct affordability evidence mismatch for case ' +
        index
    );

    assertProv.deepStrictEqual(
      result.market_context_refs,
      [
        contextRef
      ],
      'Market-context result channel mismatch for case ' +
        index
    );

    assertProv.strictEqual(
      result.evidence_refs.includes(
        contextRef
      ),
      false,
      'Market context leaked into affordability evidence for case ' +
        index
    );

    /*
     * Context alone must not upgrade or downgrade the evidence object.
     */
    assertProv.strictEqual(
      result.status,
      baseline.status,
      'Market context changed affordability result status'
    );

    assertProv.strictEqual(
      result.evidence_status,
      baseline.evidence_status,
      'Market context changed evidence maturity'
    );

    assertProv.strictEqual(
      result.ready_for_corridor_use,
      baseline.ready_for_corridor_use,
      'Market context changed corridor readiness'
    );

    assertProv.strictEqual(
      result.ceiling_available,
      baseline.ceiling_available,
      'Market context changed ceiling availability'
    );

    assertProv.strictEqual(
      result.ceiling_value,
      baseline.ceiling_value,
      'Market context changed ceiling value'
    );

    assertProv.deepStrictEqual(
      result.blocking_reasons,
      baseline.blocking_reasons,
      'Market context changed blockers'
    );

    assertProv.deepStrictEqual(
      result.diagnostics,
      baseline.diagnostics,
      'Market context changed diagnostics'
    );
  }

  const statuses =
    capturedCases.map(
      item => item.status
    );

  assertProv.ok(
    statuses.includes(
      'manual_review_required'
    ),
    'Manual-review affordability path not permanently covered'
  );

  assertProv.ok(
    statuses.includes(
      'ceiling_unavailable'
    ),
    'Unavailable affordability path not permanently covered'
  );

  console.log(
    'FINROOM_R5_B3_4_PROVENANCE_CHANNEL_SEPARATION=PASS'
  );
})();
