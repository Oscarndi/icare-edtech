'use strict';

const assert = require('assert');

const {
  validateFieldObservation,
  validateFieldEvidenceSet,
  buildFieldCalibrationRevision,
  applyRevisionToSimulationOverrides
} = require('../api/_finroom-model');

let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function throws(fn, message) {
  assert.throws(fn, message);
  checks += 1;
}

const observationA = {
  metric_id: 'home_conversion_rate',
  observed_value: 0.31,
  sample_size: 101,
  observation_period: 'synthetic-period-a',
  recorded_at: '2099-01-01T00:00:00Z',
  source: 'synthetic-pilot-a',
  notes: 'Synthetic field evidence only.'
};

const observationB = {
  metric_id: 'home_conversion_rate',
  observed_value: 0.34,
  sample_size: 203,
  observation_period: 'synthetic-period-b',
  recorded_at: '2099-02-01T00:00:00Z',
  source: 'synthetic-pilot-b',
  notes: 'Synthetic second observation.'
};

const validated =
  validateFieldObservation(
    observationA
  );

check(
  validated.metric_id ===
    'home_conversion_rate',
  'metric preserved'
);

check(
  validated.observed_value === 0.31,
  'value preserved'
);

check(
  validated.sample_size === 101,
  'sample preserved'
);

check(
  validated.source === 'synthetic-pilot-a',
  'observation source preserved'
);

check(
  !Object.prototype.hasOwnProperty.call(
    validated,
    'status'
  ),
  'observation has no assumption maturity status'
);

const evidence =
  validateFieldEvidenceSet([
    observationA,
    observationB
  ]);

check(
  evidence.length === 2,
  'evidence set'
);

const revision =
  buildFieldCalibrationRevision({
    metric_id: 'home_conversion_rate',
    previous_value: 0.25,
    proposed_value: 0.32,
    previous_status: 'current_assumption',
    proposed_status: 'current_assumption',
    evidence: [
      observationA,
      observationB
    ],
    decision_note:
      'Synthetic reviewed revision.',
    revision_date: '2099-03-01'
  });

check(
  revision.kind ===
    'field_calibration_revision',
  'revision kind'
);

check(
  revision.previous.value === 0.25,
  'previous value'
);

check(
  revision.proposed.value === 0.32,
  'proposed value'
);

check(
  revision.evidence.length === 2,
  'revision evidence'
);

check(
  revision.authority
    .evidence_is_observation === true,
  'evidence semantic'
);

check(
  revision.authority
    .revision_is_proposal === true,
  'proposal semantic'
);

check(
  revision.authority
    .automatic_model_mutation === false,
  'no automatic mutation'
);

check(
  revision.authority
    .automatic_model_persistence === false,
  'no automatic persistence'
);

check(
  revision.authority
    .human_review_required === true,
  'human review required'
);

const originalOverrides = {
  initial_active_students: 22
};

const originalBefore =
  JSON.stringify(originalOverrides);

const simulated =
  applyRevisionToSimulationOverrides(
    originalOverrides,
    revision,
    {
      home_conversion_rate:
        'home_conversion_rate'
    }
  );

check(
  simulated.home_conversion_rate === 0.32,
  'revision applied to simulation copy'
);

check(
  simulated.initial_active_students === 22,
  'existing override retained'
);

check(
  JSON.stringify(originalOverrides) ===
    originalBefore,
  'original overrides unchanged'
);

throws(
  () => validateFieldObservation({
    ...observationA,
    source: ''
  }),
  'empty source rejected'
);

throws(
  () => {
    const withoutSource = {
      ...observationA
    };
    delete withoutSource.source;
    return validateFieldObservation(
      withoutSource
    );
  },
  'missing source rejected'
);

throws(
  () => validateFieldObservation({
    ...observationA,
    status: 'achieved'
  }),
  'observation assumption status rejected'
);

throws(
  () => validateFieldObservation({
    ...observationA,
    sample_size: 0
  }),
  'zero sample rejected'
);

throws(
  () => validateFieldObservation({
    ...observationA,
    metric_id: ''
  }),
  'empty metric rejected'
);

throws(
  () => validateFieldEvidenceSet([]),
  'empty evidence rejected'
);

throws(
  () => buildFieldCalibrationRevision({
    metric_id: 'home_conversion_rate',
    previous_value: 0.25,
    proposed_value: 0.32,
    evidence: [
      {
        ...observationA,
        metric_id: 'different_metric'
      }
    ],
    decision_note: 'Synthetic.',
    revision_date: '2099-03-01'
  }),
  'mismatched evidence rejected'
);

throws(
  () => buildFieldCalibrationRevision({
    metric_id: 'home_conversion_rate',
    previous_value: 0.25,
    proposed_value: 0.32,
    previous_status: 'invalid',
    evidence: [observationA],
    decision_note: 'Synthetic.',
    revision_date: '2099-03-01'
  }),
  'invalid status rejected'
);

throws(
  () => applyRevisionToSimulationOverrides(
    {},
    revision,
    {}
  ),
  'missing mapping rejected'
);

console.log(
  'FINROOM_FIELD_CALIBRATION_SMOKE=PASS'
);
console.log(
  'FIELD_CALIBRATION_CHECKS=' + checks
);
