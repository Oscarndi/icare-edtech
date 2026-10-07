'use strict';

const assert = require('assert');

const model =
  require('../api/_finroom-model');

const {
  R5_CONTRACT_ENUMS,
  validateCanonicalMonetaryValue,
  validateR5AssumptionStatus,
  validateR5Confidence,
  validateR5SourceType,
  validateR5CostClass,
  validateR5OfferId,
  validateR5PricingDecisionStatus,
  validateR5TechnicalCostOrigin,
  validateR5ProcurementMode,
  validateR5LegacyReconciliationClass,
  validateR5LegacyReconciliationAction,
  validateR5AllocationBasis,
  validateR5TechnicalCostCompleteness,
  validateR5EconomicCostCompleteness,
  validateTechnicalComponent,
  validateTechnicalSubmodule,
  validateTechnicalModule,
  validateTechnicalProductConfiguration,
  validateTechnicalCostItem,
  validateTechnicalCostBasisHandoff,
  validateLegacyCostReconciliation,
  validateCostAllocation
} = model;

function expectInvalid(fn, message) {
  assert.throws(
    fn,
    /FINROOM_MODEL_INVALID/,
    message
  );
}

const legacyExports = [
  'validateModel',
  'loadModelFromEnvironment',
  'computeScenario',
  'findBreakEvenStudents',
  'computeBreakEvenGraph',
  'buildFinancialPresentation',
  'validateSimulationOverrides',
  'computeInteractiveSimulation',
  'validateTrajectoryOptions',
  'activeStudentsForTrajectoryMonth',
  'validateProgressiveCostPlan',
  'computeProgressiveOperatingCosts',
  'computeFinancialTrajectory',
  'validateSensitivityScenarios',
  'trajectoryTotals',
  'computeSensitivityAnalysis',
  'validateAssumptionStatus',
  'validateFieldObservation',
  'validateFieldEvidenceSet',
  'buildFieldCalibrationRevision',
  'applyRevisionToSimulationOverrides'
];

for (const name of legacyExports) {
  assert.strictEqual(
    typeof model[name],
    'function',
    `legacy export missing: ${name}`
  );
}

assert.ok(
  Object.isFrozen(R5_CONTRACT_ENUMS),
  'R5 enum registry must be frozen'
);

const validatorMatrix = [
  [
    R5_CONTRACT_ENUMS.assumption_status,
    validateR5AssumptionStatus
  ],
  [
    R5_CONTRACT_ENUMS.confidence,
    validateR5Confidence
  ],
  [
    R5_CONTRACT_ENUMS.source_type,
    validateR5SourceType
  ],
  [
    R5_CONTRACT_ENUMS.cost_class,
    validateR5CostClass
  ],
  [
    R5_CONTRACT_ENUMS.offer_id,
    validateR5OfferId
  ],
  [
    R5_CONTRACT_ENUMS.pricing_decision_status,
    validateR5PricingDecisionStatus
  ],
  [
    R5_CONTRACT_ENUMS.technical_cost_origin,
    validateR5TechnicalCostOrigin
  ],
  [
    R5_CONTRACT_ENUMS
      .procurement_or_fabrication_mode,
    validateR5ProcurementMode
  ],
  [
    R5_CONTRACT_ENUMS
      .legacy_reconciliation_class,
    validateR5LegacyReconciliationClass
  ],
  [
    R5_CONTRACT_ENUMS
      .legacy_reconciliation_action,
    validateR5LegacyReconciliationAction
  ],
  [
    R5_CONTRACT_ENUMS.allocation_basis,
    validateR5AllocationBasis
  ],
  [
    R5_CONTRACT_ENUMS
      .technical_cost_completeness,
    validateR5TechnicalCostCompleteness
  ],
  [
    R5_CONTRACT_ENUMS
      .economic_cost_completeness,
    validateR5EconomicCostCompleteness
  ]
];

for (
  const [values, validator] of validatorMatrix
) {
  for (const value of values) {
    assert.strictEqual(
      validator(value),
      value
    );
  }

  expectInvalid(
    () => validator('__invalid__'),
    'unknown enum value must reject'
  );
}

const monetaryValue = {
  value: 0,
  currency: 'XAF',
  unit: 'currency_per_device',
  scope: 'synthetic_test_only',
  provenance: 'synthetic smoke fixture',
  source_type: 'technical_fixture',
  assumption_status: 'to_validate',
  effective_date: '2099-01-01',
  confidence: 'low',
  evidence_refs: [],
  notes: 'No real ICARE financial value.'
};

assert.strictEqual(
  validateCanonicalMonetaryValue(
    monetaryValue
  ),
  monetaryValue
);

expectInvalid(
  () =>
    validateCanonicalMonetaryValue({
      ...monetaryValue,
      currency: ''
    }),
  'empty currency must reject'
);

expectInvalid(
  () =>
    validateCanonicalMonetaryValue({
      ...monetaryValue,
      unit: ''
    }),
  'empty unit must reject'
);

expectInvalid(
  () =>
    validateCanonicalMonetaryValue({
      ...monetaryValue,
      source_type: 'unknown'
    }),
  'unknown source type must reject'
);

expectInvalid(
  () =>
    validateCanonicalMonetaryValue({
      ...monetaryValue,
      confidence: 'certain'
    }),
  'unknown confidence must reject'
);

expectInvalid(
  () =>
    validateCanonicalMonetaryValue({
      ...monetaryValue,
      value: -1
    }),
  'negative monetary value must reject'
);

const component = {
  component_id: 'fixture-component',
  name: 'Synthetic component',
  quantity: 1,
  unit_of_measure: 'unit',
  procurement_or_fabrication_mode:
    'purchased',
  technical_reference:
    'synthetic-reference',
  lifecycle_class: 'test_only',
  evidence_refs: []
};

assert.strictEqual(
  validateTechnicalComponent(component),
  component
);

expectInvalid(
  () =>
    validateTechnicalComponent({
      ...component,
      quantity: 0
    }),
  'zero component quantity must reject'
);

const submodule = {
  submodule_id: 'fixture-submodule',
  name: 'Synthetic submodule',
  quantity: 1,
  components: [component],
  submodule_cost_items: [],
  evidence_refs: []
};

assert.strictEqual(
  validateTechnicalSubmodule(submodule),
  submodule
);

const moduleItem = {
  module_id: 'fixture-module',
  name: 'Synthetic module',
  quantity: 1,
  submodules: [submodule],
  components: [],
  module_cost_items: [],
  evidence_refs: []
};

assert.strictEqual(
  validateTechnicalModule(moduleItem),
  moduleItem
);

const configuration = {
  configuration_id:
    'fixture-configuration',
  product_id: 'fixture-product',
  product_version: 'test-v0',
  configuration_name:
    'Synthetic configuration',
  maturity_status: 'TEST_ONLY',
  effective_date: '2099-01-01',
  modules: [moduleItem],
  evidence_refs: []
};

assert.strictEqual(
  validateTechnicalProductConfiguration(
    configuration
  ),
  configuration
);

const costItem = {
  cost_item_id: 'fixture-cost-item',
  technical_ref: component.component_id,
  configuration_id:
    configuration.configuration_id,
  component_id: component.component_id,
  cost_origin: 'purchased_component',
  cost_class: 'hardware_capex',
  quantity: 1,
  unit_cost: monetaryValue,
  procurement_or_fabrication_mode:
    'purchased',
  source_type: 'technical_fixture',
  provenance: 'synthetic smoke fixture',
  effective_date: '2099-01-01',
  assumption_status: 'to_validate',
  confidence: 'low',
  evidence_refs: [],
  included_in_legacy_cost: false
};

assert.strictEqual(
  validateTechnicalCostItem(costItem),
  costItem
);

expectInvalid(
  () =>
    validateTechnicalCostItem({
      ...costItem,
      included_in_legacy_cost: 'no'
    }),
  'legacy inclusion flag must be boolean'
);

expectInvalid(
  () =>
    validateTechnicalCostItem({
      ...costItem,
      quantity: -1
    }),
  'negative technical cost quantity rejects'
);

const handoff = {
  handoff_id: 'fixture-handoff',
  configuration_id:
    configuration.configuration_id,
  configuration_version:
    configuration.product_version,
  technical_cost_basis_id:
    'fixture-cost-basis',
  currency: 'XAF',
  effective_date: '2099-01-01',
  total_direct_cost: 0,
  landed_cost: 0,
  deployed_cost: 0,
  lifecycle_assumptions: {},
  unresolved_cost_items: [],
  evidence_refs: [],
  maturity_status: 'TEST_ONLY',
  disclosure_class: 'TEST_ONLY'
};

assert.strictEqual(
  validateTechnicalCostBasisHandoff(
    handoff
  ),
  handoff
);

const reconciliation = {
  reconciliation_id:
    'fixture-reconciliation',
  model_version: 'test-v0',
  technical_cost_ref:
    costItem.cost_item_id,
  legacy_cost_ref:
    'synthetic.legacy.reference',
  classification:
    'unknown_requires_validation',
  reconciliation_action:
    'manual_review_required'
};

assert.strictEqual(
  validateLegacyCostReconciliation(
    reconciliation
  ),
  reconciliation
);

assert.doesNotThrow(
  () =>
    validateLegacyCostReconciliation({
      ...reconciliation,
      overlap_amount: 0
    }),
  'zero known overlap may be represented'
);

expectInvalid(
  () =>
    validateLegacyCostReconciliation({
      ...reconciliation,
      overlap_amount: -1
    }),
  'negative overlap must reject'
);

const allocation = {
  allocation_id: 'fixture-allocation',
  source_cost_ref:
    costItem.cost_item_id,
  offer_id: 'box',
  segment_id: 'synthetic-segment',
  allocation_basis: 'per_class',
  allocation_driver:
    'synthetic-test-driver',
  allocation_period: 'test-period',
  allocated_value: 0,
  currency: 'XAF',
  assumptions: {},
  evidence_refs: [],
  status: 'to_validate'
};

assert.strictEqual(
  validateCostAllocation(allocation),
  allocation
);

expectInvalid(
  () =>
    validateCostAllocation({
      ...allocation,
      offer_id: 'unknown_offer'
    }),
  'unknown offer must reject'
);

assert.ok(
  R5_CONTRACT_ENUMS.source_type.includes(
    'technical_fixture'
  ),
  'technical_fixture must remain explicitly representable'
);

/*
 * The smoke contains synthetic zeros only.
 * It intentionally contains no real/private ICARE price,
 * cost, supplier quote or business assumption.
 */

console.log(
  'FINROOM_R5_CONTRACT_FOUNDATION_SMOKE=PASS'
);
