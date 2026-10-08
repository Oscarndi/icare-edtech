'use strict';

/*
 * ICARE Financial Strategy Room
 *
 * IMPORTANT SECURITY BOUNDARY
 * ---------------------------
 * This module contains only:
 *   - schema validation
 *   - formulas
 *   - scenario computation
 *
 * Real/private financial values MUST NOT be committed here.
 * They are supplied at runtime through FINROOM_MODEL_JSON.
 */

const REQUIRED_STATUS = new Set([
  'achieved',
  'current_assumption',
  'to_validate',
  'deferred'
]);

function fail(message) {
  throw new Error(`FINROOM_MODEL_INVALID: ${message}`);
}

function finiteNumber(value, path, options = {}) {
  const {
    min = 0,
    max = Number.MAX_SAFE_INTEGER
  } = options;

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    fail(path);
  }

  return value;
}

function positiveInteger(value, path) {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    fail(path);
  }

  return value;
}

function nonEmptyString(value, path, maxLength = 100) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    fail(path);
  }

  return value;
}

function validateStatus(value, path) {
  if (!REQUIRED_STATUS.has(value)) {
    fail(path);
  }

  return value;
}

function validateModel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('root');
  }

  const {
    metadata,
    school,
    hardware,
    home,
    operating_costs: operatingCosts
  } = raw;

  if (!metadata || typeof metadata !== 'object') {
    fail('metadata');
  }

  if (!school || typeof school !== 'object') {
    fail('school');
  }

  if (!hardware || typeof hardware !== 'object') {
    fail('hardware');
  }

  if (!home || typeof home !== 'object') {
    fail('home');
  }

  if (!operatingCosts || typeof operatingCosts !== 'object') {
    fail('operating_costs');
  }

  nonEmptyString(metadata.model_version, 'metadata.model_version');
  nonEmptyString(metadata.currency, 'metadata.currency', 16);
  validateStatus(metadata.status, 'metadata.status');
  nonEmptyString(metadata.updated_at, 'metadata.updated_at', 64);

  finiteNumber(
    school.active_student_monthly_fee,
    'school.active_student_monthly_fee'
  );

  finiteNumber(
    school.class_monthly_support_fee,
    'school.class_monthly_support_fee'
  );

  finiteNumber(
    school.teacher_incentive_per_student_subject,
    'school.teacher_incentive_per_student_subject'
  );

  positiveInteger(
    school.reference_subject_count,
    'school.reference_subject_count'
  );

  positiveInteger(
    school.reference_class_capacity,
    'school.reference_class_capacity'
  );

  finiteNumber(
    hardware.box_budget_per_class,
    'hardware.box_budget_per_class'
  );

  finiteNumber(
    hardware.tablet_unit_cost,
    'hardware.tablet_unit_cost'
  );

  finiteNumber(
    hardware.tablet_monthly_rental,
    'hardware.tablet_monthly_rental'
  );

  finiteNumber(
    home.learner_monthly_price,
    'home.learner_monthly_price'
  );

  finiteNumber(
    home.school_to_home_conversion_rate,
    'home.school_to_home_conversion_rate',
    { min: 0, max: 1 }
  );

  finiteNumber(
    home.teacher_cost_per_student_subject,
    'home.teacher_cost_per_student_subject'
  );

  /*
   * Decision B:
   * Home teacher cost is explicitly PER LEARNER,
   * PER MONTH, PER SUBJECT.
   *
   * No monetary value is hardcoded here.
   */
  if (
    home.teacher_cost_unit !==
    'per_student_per_month_per_subject'
  ) {
    fail('home.teacher_cost_unit');
  }

  finiteNumber(
    operatingCosts.current_fixed_monthly,
    'operating_costs.current_fixed_monthly'
  );

  finiteNumber(
    operatingCosts.expanded_fixed_monthly,
    'operating_costs.expanded_fixed_monthly'
  );

  return raw;
}

function loadModelFromEnvironment() {
  const encoded = process.env.FINROOM_MODEL_JSON;

  if (
    typeof encoded !== 'string' ||
    encoded.trim().length === 0
  ) {
    throw new Error(
      'FINROOM_MODEL_JSON is missing or invalid'
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(encoded);
  } catch {
    throw new Error(
      'FINROOM_MODEL_JSON is missing or invalid'
    );
  }

  return validateModel(parsed);
}

function roundMoney(value) {
  return Math.round(value);
}

function computeScenario(model, activeStudents, deviceMode) {
  validateModel(model);
  positiveInteger(activeStudents, 'active_students');

  if (
    deviceMode !== 'school_owned' &&
    deviceMode !== 'icare_supplied'
  ) {
    fail('device_mode');
  }

  const subjects =
    model.school.reference_subject_count;

  const classesRequired = Math.ceil(
    activeStudents /
      model.school.reference_class_capacity
  );

  const baseSchoolRevenue =
    activeStudents *
      model.school.active_student_monthly_fee +
    classesRequired *
      model.school.class_monthly_support_fee;

  const schoolTeacherIncentives =
    activeStudents *
    model.school.teacher_incentive_per_student_subject *
    subjects;

  const tabletRentalRevenue =
    deviceMode === 'icare_supplied'
      ? activeStudents *
        model.hardware.tablet_monthly_rental
      : 0;

  const schoolRevenue =
    baseSchoolRevenue + tabletRentalRevenue;

  const schoolContribution =
    schoolRevenue - schoolTeacherIncentives;

  const boxCapex =
    classesRequired *
    model.hardware.box_budget_per_class;

  const tabletCapex =
    deviceMode === 'icare_supplied'
      ? activeStudents *
        model.hardware.tablet_unit_cost
      : 0;

  const totalInitialCapex =
    boxCapex + tabletCapex;

  const homeLearners =
    activeStudents *
    model.home.school_to_home_conversion_rate;

  const homeRevenue =
    homeLearners *
    model.home.learner_monthly_price;

  const homeTeacherCost =
    homeLearners *
    model.home.teacher_cost_per_student_subject *
    subjects;

  const homeContribution =
    homeRevenue - homeTeacherCost;

  const combinedContribution =
    schoolContribution + homeContribution;

  const simpleCapexCoverageMonths =
    schoolContribution > 0
      ? totalInitialCapex / schoolContribution
      : null;

  return {
    active_students: activeStudents,
    device_mode: deviceMode,
    classes_required: classesRequired,

    monthly: {
      school_revenue: roundMoney(schoolRevenue),
      school_teacher_incentives:
        roundMoney(schoolTeacherIncentives),
      school_contribution:
        roundMoney(schoolContribution),

      home_learners:
        Number(homeLearners.toFixed(2)),
      home_revenue:
        roundMoney(homeRevenue),
      home_teacher_cost:
        roundMoney(homeTeacherCost),
      home_contribution:
        roundMoney(homeContribution),

      combined_contribution:
        roundMoney(combinedContribution)
    },

    capex: {
      box: roundMoney(boxCapex),
      tablets: roundMoney(tabletCapex),
      total_initial:
        roundMoney(totalInitialCapex)
    },

    indicators: {
      simple_capex_coverage_months:
        simpleCapexCoverageMonths === null
          ? null
          : Number(
              simpleCapexCoverageMonths.toFixed(2)
            )
    }
  };
}

function contributionForStudents(
  model,
  activeStudents,
  deviceMode,
  includeHome
) {
  const scenario = computeScenario(
    model,
    activeStudents,
    deviceMode
  );

  return includeHome
    ? scenario.monthly.combined_contribution
    : scenario.monthly.school_contribution;
}

function findBreakEvenStudents(
  model,
  fixedMonthlyCost,
  {
    deviceMode = 'school_owned',
    includeHome = false,
    maxStudents = 100000
  } = {}
) {
  validateModel(model);

  finiteNumber(
    fixedMonthlyCost,
    'fixed_monthly_cost'
  );

  positiveInteger(
    maxStudents,
    'max_students'
  );

  if (fixedMonthlyCost === 0) {
    return 0;
  }

  /*
   * Exact integer search is deliberate:
   * classes_required uses ceil(), so contribution is stepwise.
   */
  for (
    let students = 1;
    students <= maxStudents;
    students += 1
  ) {
    const contribution =
      contributionForStudents(
        model,
        students,
        deviceMode,
        includeHome
      );

    if (contribution >= fixedMonthlyCost) {
      return students;
    }
  }

  return null;
}


/*
 * Server-authoritative operating break-even graph.
 *
 * This graph is a modeled simulation, not a forecast.
 * CAPEX and cumulative recovery are deliberately excluded.
 * Exact break-even is computed from the canonical integer
 * search rather than inferred from visual interpolation.
 */
function computeBreakEvenGraph(
  model,
  overrides = {},
  options = {}
) {
  const validatedModel = validateModel(model);
  const modelBefore = JSON.stringify(validatedModel);

  const input =
    validateSimulationOverrides(overrides);

  if (
    input.active_students !== undefined
  ) {
    fail(
      'break_even_graph_overrides.active_students'
    );
  }

  const deviceMode =
    input.device_mode || 'school_owned';

  const homeEnabled =
    input.home_enabled === undefined
      ? true
      : input.home_enabled;

  const costStructure =
    input.cost_structure || 'current';

  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    fail('break_even_graph_options');
  }

  const allowedOptions = new Set([
    'min_active_students',
    'max_active_students',
    'point_count',
    'progressive_month',
    'progressive_horizon_months',
    'progressive_cost_plan'
  ]);

  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      fail(
        'break_even_graph_options.' + key
      );
    }
  }

  const hasProgressiveMonth =
    options.progressive_month !== undefined;

  const hasProgressiveHorizon =
    options.progressive_horizon_months !== undefined;

  const hasProgressivePlan =
    options.progressive_cost_plan !== undefined;

  let progressiveMonth = null;
  let progressiveHorizonMonths = null;

  if (costStructure === 'progressive') {
    if (!hasProgressiveMonth) {
      fail(
        'break_even_graph_options.progressive_month'
      );
    }

    if (!hasProgressiveHorizon) {
      fail(
        'break_even_graph_options.progressive_horizon_months'
      );
    }

    if (!hasProgressivePlan) {
      fail(
        'break_even_graph_options.progressive_cost_plan'
      );
    }

    positiveInteger(
      options.progressive_month,
      'break_even_graph_options.progressive_month'
    );

    progressiveMonth =
      options.progressive_month;

    if (
      ![12, 24, 36].includes(
        options.progressive_horizon_months
      )
    ) {
      fail(
        'break_even_graph_options.progressive_horizon_months'
      );
    }

    progressiveHorizonMonths =
      options.progressive_horizon_months;

    if (
      progressiveMonth >
      progressiveHorizonMonths
    ) {
      fail(
        'break_even_graph_options.progressive_month'
      );
    }
  } else if (
    hasProgressiveMonth ||
    hasProgressiveHorizon ||
    hasProgressivePlan
  ) {
    fail(
      'break_even_graph_options.progressive_requires_progressive_cost_structure'
    );
  }

  const minActiveStudents =
    options.min_active_students === undefined
      ? 1
      : positiveInteger(
          options.min_active_students,
          'break_even_graph_options.min_active_students'
        );

  const maxActiveStudents =
    options.max_active_students === undefined
      ? 5000
      : positiveInteger(
          options.max_active_students,
          'break_even_graph_options.max_active_students'
        );

  if (maxActiveStudents < minActiveStudents) {
    fail(
      'break_even_graph_options.max_active_students'
    );
  }

  const pointCount =
    options.point_count === undefined
      ? 61
      : positiveInteger(
          options.point_count,
          'break_even_graph_options.point_count'
        );

  /*
   * Bound graph payload and calculation work server-side.
   * This is a technical transport bound, not a financial
   * assumption.
   */
  if (pointCount > 201) {
    fail(
      'break_even_graph_options.point_count'
    );
  }

  const simulationModel =
    cloneModelForSimulation(validatedModel);

  if (
    input.home_conversion_rate !== undefined
  ) {
    simulationModel.home
      .school_to_home_conversion_rate =
        input.home_conversion_rate;
  }

  if (!homeEnabled) {
    simulationModel.home
      .school_to_home_conversion_rate = 0;
  }

  let progressiveCostContext = null;

  let modeledOperatingCosts;

  if (costStructure === 'progressive') {
    const progressiveCosts =
      computeProgressiveOperatingCosts(
        simulationModel,
        options.progressive_cost_plan,
        progressiveHorizonMonths
      );

    const selectedMonth =
      progressiveCosts.months[
        progressiveMonth - 1
      ];

    progressiveCostContext = {
      month: selectedMonth.month,
      base_structure:
        progressiveCosts.base_structure,
      base_monthly:
        selectedMonth.base_monthly,
      event_delta:
        selectedMonth.event_delta,
      total_monthly:
        selectedMonth.total_monthly,
      active_event_ids:
        [...selectedMonth.active_event_ids]
    };

    modeledOperatingCosts =
      selectedMonth.total_monthly;
  } else {
    modeledOperatingCosts =
      costStructure === 'expanded'
        ? simulationModel.operating_costs
            .expanded_fixed_monthly
        : simulationModel.operating_costs
            .current_fixed_monthly;
  }

  const exactBreakEvenStudents =
    findBreakEvenStudents(
      simulationModel,
      modeledOperatingCosts,
      {
        deviceMode,
        includeHome: homeEnabled,
        maxStudents: maxActiveStudents
      }
    );

  const xValues = [];

  if (pointCount === 1) {
    xValues.push(minActiveStudents);
  } else {
    const span =
      maxActiveStudents - minActiveStudents;

    for (
      let index = 0;
      index < pointCount;
      index += 1
    ) {
      const x =
        minActiveStudents +
        Math.round(
          (span * index) /
          (pointCount - 1)
        );

      if (
        xValues.length === 0 ||
        xValues[xValues.length - 1] !== x
      ) {
        xValues.push(x);
      }
    }
  }

  /*
   * If the requested point count exceeds the number of
   * distinct integer X values, fill the missing integer
   * positions without duplicating points.
   */
  if (
    xValues.length < pointCount &&
    xValues.length <
      maxActiveStudents -
        minActiveStudents + 1
  ) {
    const existing = new Set(xValues);

    for (
      let x = minActiveStudents;
      x <= maxActiveStudents &&
      xValues.length < pointCount;
      x += 1
    ) {
      if (!existing.has(x)) {
        xValues.push(x);
        existing.add(x);
      }
    }

    xValues.sort((a, b) => a - b);
  }

  const points =
    xValues.map(activeStudents => {
      const scenario =
        computeScenario(
          simulationModel,
          activeStudents,
          deviceMode
        );

      const contribution =
        homeEnabled
          ? scenario.monthly
              .combined_contribution
          : scenario.monthly
              .school_contribution;

      const gap =
        roundMoney(
          contribution -
          modeledOperatingCosts
        );

      return {
        active_students: activeStudents,
        combined_contribution:
          contribution,
        modeled_operating_costs:
          roundMoney(
            modeledOperatingCosts
          ),
        monthly_coverage_gap: gap,
        monthly_break_even: gap >= 0
      };
    });

  let breakEven;

  if (exactBreakEvenStudents === null) {
    breakEven = {
      active_students: null,
      combined_contribution: null,
      modeled_operating_costs:
        roundMoney(modeledOperatingCosts),
      monthly_coverage_gap: null,
      within_requested_range: false
    };
  } else {
    const exactScenario =
      computeScenario(
        simulationModel,
        exactBreakEvenStudents,
        deviceMode
      );

    const exactContribution =
      homeEnabled
        ? exactScenario.monthly
            .combined_contribution
        : exactScenario.monthly
            .school_contribution;

    breakEven = {
      active_students:
        exactBreakEvenStudents,
      combined_contribution:
        exactContribution,
      modeled_operating_costs:
        roundMoney(modeledOperatingCosts),
      monthly_coverage_gap:
        roundMoney(
          exactContribution -
          modeledOperatingCosts
        ),
      within_requested_range:
        exactBreakEvenStudents >=
          minActiveStudents &&
        exactBreakEvenStudents <=
          maxActiveStudents
    };
  }

  if (
    JSON.stringify(validatedModel) !==
    modelBefore
  ) {
    throw new Error(
      'FINROOM_MODEL_MUTATED_DURING_BREAK_EVEN_GRAPH'
    );
  }

  return {
    kind: 'break_even_graph',
    authority: 'server',
    official_model_mutated: false,

    semantics: {
      result_status: 'simulation',
      graph_is_forecast: false,
      contribution_is_net_margin: false,
      monthly_break_even_is_cumulative_recovery:
        false,
      capex_included_in_operating_break_even:
        false,
      ...(
        costStructure === 'progressive'
          ? {
              progressive_break_even_is_month_specific:
                true
            }
          : {}
      )
    },

    inputs: {
      device_mode: deviceMode,
      home_enabled: homeEnabled,
      home_conversion_rate:
        simulationModel.home
          .school_to_home_conversion_rate,
      cost_structure: costStructure,
      ...(
        costStructure === 'progressive'
          ? {
              progressive_month:
                progressiveMonth,
              progressive_horizon_months:
                progressiveHorizonMonths
            }
          : {}
      ),
      min_active_students:
        minActiveStudents,
      max_active_students:
        maxActiveStudents,
      point_count: points.length
    },

    ...(
      costStructure === 'progressive'
        ? {
            progressive_cost_context:
              progressiveCostContext
          }
        : {}
    ),

    break_even: breakEven,
    points
  };
}

function buildFinancialPresentation(model) {
  validateModel(model);

  const scenarioSizes = [60, 300, 600];
  const scenarios = [];

  for (const activeStudents of scenarioSizes) {
    scenarios.push(
      computeScenario(
        model,
        activeStudents,
        'school_owned'
      )
    );

    scenarios.push(
      computeScenario(
        model,
        activeStudents,
        'icare_supplied'
      )
    );
  }

  const currentFixed =
    model.operating_costs.current_fixed_monthly;

  const expandedFixed =
    model.operating_costs.expanded_fixed_monthly;

  return {
    metadata: {
      model_version: model.metadata.model_version,
      currency: model.metadata.currency,
      status: model.metadata.status,
      updated_at: model.metadata.updated_at
    },

    semantics: {
      home_teacher_cost_unit:
        'per_student_per_month_per_subject',
      minibox_included: false,
      roi_status: 'modeled_scenario_only',
      irr_status: 'deferred'
    },

    scenarios,

    break_even: {
      current_school_owned_school_only:
        findBreakEvenStudents(
          model,
          currentFixed,
          {
            deviceMode: 'school_owned',
            includeHome: false
          }
        ),

      current_school_owned_with_home:
        findBreakEvenStudents(
          model,
          currentFixed,
          {
            deviceMode: 'school_owned',
            includeHome: true
          }
        ),

      expanded_school_owned_school_only:
        findBreakEvenStudents(
          model,
          expandedFixed,
          {
            deviceMode: 'school_owned',
            includeHome: false
          }
        ),

      expanded_school_owned_with_home:
        findBreakEvenStudents(
          model,
          expandedFixed,
          {
            deviceMode: 'school_owned',
            includeHome: true
          }
        )
    }
  };
}


/*
 * Interactive financial simulation foundation.
 *
 * This layer never mutates the official private model.
 * Overrides are ephemeral and exist only for one calculation.
 *
 * Growth sensitivities are not forecasts.
 * Contribution is not net margin.
 * CAPEX coverage is not payback.
 */
function validateSimulationOverrides(overrides = {}) {
  if (
    overrides === null ||
    typeof overrides !== 'object' ||
    Array.isArray(overrides)
  ) {
    fail('simulation_overrides');
  }

  const allowed = new Set([
    'active_students',
    'device_mode',
    'home_enabled',
    'home_conversion_rate',
    'cost_structure'
  ]);

  for (const key of Object.keys(overrides)) {
    if (!allowed.has(key)) {
      fail('simulation_overrides.' + key);
    }
  }

  const result = {};

  if (overrides.active_students !== undefined) {
    positiveInteger(
      overrides.active_students,
      'simulation_overrides.active_students'
    );

    result.active_students =
      overrides.active_students;
  }

  if (overrides.device_mode !== undefined) {
    if (
      overrides.device_mode !== 'school_owned' &&
      overrides.device_mode !== 'icare_supplied'
    ) {
      fail('simulation_overrides.device_mode');
    }

    result.device_mode =
      overrides.device_mode;
  }

  if (overrides.home_enabled !== undefined) {
    if (
      typeof overrides.home_enabled !== 'boolean'
    ) {
      fail('simulation_overrides.home_enabled');
    }

    result.home_enabled =
      overrides.home_enabled;
  }

  if (
    overrides.home_conversion_rate !== undefined
  ) {
    finiteNumber(
      overrides.home_conversion_rate,
      'simulation_overrides.home_conversion_rate',
      {
        min: 0,
        max: 1
      }
    );

    result.home_conversion_rate =
      overrides.home_conversion_rate;
  }

  if (overrides.cost_structure !== undefined) {
    if (
      overrides.cost_structure !== 'current' &&
      overrides.cost_structure !== 'progressive' &&
      overrides.cost_structure !== 'expanded'
    ) {
      fail('simulation_overrides.cost_structure');
    }

    result.cost_structure =
      overrides.cost_structure;
  }

  return result;
}

function cloneModelForSimulation(model) {
  return {
    ...model,

    school: {
      ...model.school
    },

    hardware: {
      ...model.hardware
    },

    home: {
      ...model.home
    },

    operating_costs: {
      ...model.operating_costs
    },

    metadata: {
      ...model.metadata
    }
  };
}

function computeInteractiveSimulation(
  model,
  overrides = {}
) {
  /*
   * Validate the authoritative model first.
   * The function returns the validated model object;
   * calculation continues from that validated authority.
   */
  const validatedModel = validateModel(model);

  const input =
    validateSimulationOverrides(overrides);

  const simulationModel =
    cloneModelForSimulation(validatedModel);

  if (
    input.home_conversion_rate !== undefined
  ) {
    simulationModel.home
      .school_to_home_conversion_rate =
        input.home_conversion_rate;
  }

  const activeStudents =
    input.active_students === undefined
      ? 60
      : input.active_students;

  const deviceMode =
    input.device_mode || 'school_owned';

  const homeEnabled =
    input.home_enabled === undefined
      ? true
      : input.home_enabled;

  const costStructure =
    input.cost_structure || 'current';

  if (!homeEnabled) {
    simulationModel.home
      .school_to_home_conversion_rate = 0;
  }

  const scenario =
    computeScenario(
      simulationModel,
      activeStudents,
      deviceMode
    );

  let fixedOperatingCosts;

  if (costStructure === 'current') {
    fixedOperatingCosts =
      simulationModel.operating_costs
        .current_fixed_monthly;
  } else if (costStructure === 'expanded') {
    fixedOperatingCosts =
      simulationModel.operating_costs
        .expanded_fixed_monthly;
  } else {
    /*
     * Progressive costs require the trajectory engine.
     * At foundation stage they are intentionally unresolved.
     */
    fixedOperatingCosts = null;
  }

  const contributionForCoverage =
    homeEnabled
      ? scenario.monthly.combined_contribution
      : scenario.monthly.school_contribution;

  const monthlyCoverageGap =
    fixedOperatingCosts === null
      ? null
      : roundMoney(
          contributionForCoverage -
          fixedOperatingCosts
        );

  return {
    kind: 'financial_simulation',
    authority: 'server',
    official_model_mutated: false,

    semantics: {
      result_status: 'simulation',
      growth_is_forecast: false,
      contribution_is_net_margin: false,
      capex_coverage_is_payback: false
    },

    inputs: {
      active_students: activeStudents,
      device_mode: deviceMode,
      home_enabled: homeEnabled,
      home_conversion_rate:
        simulationModel.home
          .school_to_home_conversion_rate,
      cost_structure: costStructure
    },

    scenario,

    operating_costs: {
      fixed_monthly:
        fixedOperatingCosts,
      progressive_status:
        costStructure === 'progressive'
          ? 'deferred_to_trajectory_engine'
          : 'not_applicable'
    },

    coverage: {
      contribution_for_coverage:
        contributionForCoverage,
      monthly_coverage_gap:
        monthlyCoverageGap,
      monthly_break_even:
        monthlyCoverageGap === null
          ? null
          : monthlyCoverageGap >= 0
    }
  };
}


/*
 * Financial trajectory engine.
 *
 * This is a scenario/sensitivity engine, not a forecast.
 * It does not mutate the official private model.
 *
 * Monthly operating break-even and cumulative recovery are
 * deliberately separate concepts.
 */
function validateTrajectoryOptions(options = {}) {
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    fail('trajectory_options');
  }

  const allowed = new Set([
    'horizon_months',
    'initial_active_students',
    'growth_mode',
    'monthly_growth_rate',
    'manual_monthly_path',
    'device_mode',
    'home_enabled',
    'home_conversion_rate',
    'cost_structure',
    'progressive_cost_plan'
  ]);

  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      fail('trajectory_options.' + key);
    }
  }

  const result = {
    horizon_months: 12,
    initial_active_students: 60,
    growth_mode: 'constant_students',
    monthly_growth_rate: 0,
    device_mode: 'school_owned',
    home_enabled: true,
    cost_structure: 'current'
  };

  if (options.horizon_months !== undefined) {
    if (
      ![12, 24, 36].includes(
        options.horizon_months
      )
    ) {
      fail('trajectory_options.horizon_months');
    }

    result.horizon_months =
      options.horizon_months;
  }

  if (
    options.initial_active_students !== undefined
  ) {
    positiveInteger(
      options.initial_active_students,
      'trajectory_options.initial_active_students'
    );

    result.initial_active_students =
      options.initial_active_students;
  }

  if (options.growth_mode !== undefined) {
    if (
      options.growth_mode !== 'constant_students' &&
      options.growth_mode !== 'modeled_growth_rate' &&
      options.growth_mode !== 'manual_monthly_path'
    ) {
      fail('trajectory_options.growth_mode');
    }

    result.growth_mode =
      options.growth_mode;
  }

  if (
    options.monthly_growth_rate !== undefined
  ) {
    finiteNumber(
      options.monthly_growth_rate,
      'trajectory_options.monthly_growth_rate',
      {
        min: -0.99,
        max: 10
      }
    );

    result.monthly_growth_rate =
      options.monthly_growth_rate;
  }

  if (options.manual_monthly_path !== undefined) {
    if (!Array.isArray(options.manual_monthly_path)) {
      fail('trajectory_options.manual_monthly_path');
    }

    if (
      options.manual_monthly_path.length !==
      result.horizon_months
    ) {
      fail(
        'trajectory_options.manual_monthly_path_length'
      );
    }

    for (
      let index = 0;
      index < options.manual_monthly_path.length;
      index += 1
    ) {
      positiveInteger(
        options.manual_monthly_path[index],
        'trajectory_options.manual_monthly_path[' +
          index +
          ']'
      );
    }

    result.manual_monthly_path =
      [...options.manual_monthly_path];
  }

  if (options.device_mode !== undefined) {
    if (
      options.device_mode !== 'school_owned' &&
      options.device_mode !== 'icare_supplied'
    ) {
      fail('trajectory_options.device_mode');
    }

    result.device_mode =
      options.device_mode;
  }

  if (options.home_enabled !== undefined) {
    if (
      typeof options.home_enabled !== 'boolean'
    ) {
      fail('trajectory_options.home_enabled');
    }

    result.home_enabled =
      options.home_enabled;
  }

  if (
    options.home_conversion_rate !== undefined
  ) {
    finiteNumber(
      options.home_conversion_rate,
      'trajectory_options.home_conversion_rate',
      {
        min: 0,
        max: 1
      }
    );

    result.home_conversion_rate =
      options.home_conversion_rate;
  }

  if (options.cost_structure !== undefined) {
    if (
      options.cost_structure !== 'current' &&
      options.cost_structure !== 'expanded' &&
      options.cost_structure !== 'progressive'
    ) {
      fail('trajectory_options.cost_structure');
    }

    result.cost_structure =
      options.cost_structure;
  }

  if (
    result.growth_mode === 'constant_students' &&
    result.monthly_growth_rate !== 0
  ) {
    fail(
      'trajectory_options.monthly_growth_rate_requires_modeled_growth_rate'
    );
  }

  if (result.growth_mode === 'manual_monthly_path') {
    if (result.manual_monthly_path === undefined) {
      fail(
        'trajectory_options.manual_monthly_path_required'
      );
    }

    if (result.monthly_growth_rate !== 0) {
      fail(
        'trajectory_options.manual_monthly_path_growth_rate'
      );
    }

    if (
      result.manual_monthly_path[0] !==
      result.initial_active_students
    ) {
      fail(
        'trajectory_options.manual_monthly_path_initial_mismatch'
      );
    }
  } else if (
    result.manual_monthly_path !== undefined
  ) {
    fail(
      'trajectory_options.manual_monthly_path_requires_manual_mode'
    );
  }

  if (
    options.progressive_cost_plan !== undefined
  ) {
    result.progressive_cost_plan =
      options.progressive_cost_plan;
  }

  if (
    result.cost_structure === 'progressive' &&
    result.progressive_cost_plan === undefined
  ) {
    fail(
      'trajectory_options.progressive_cost_plan'
    );
  }

  if (
    result.cost_structure !== 'progressive' &&
    result.progressive_cost_plan !== undefined
  ) {
    fail(
      'trajectory_options.progressive_cost_plan_requires_progressive'
    );
  }

  return result;
}

function activeStudentsForTrajectoryMonth(
  initialActiveStudents,
  month,
  growthMode,
  monthlyGrowthRate,
  manualMonthlyPath
) {
  if (growthMode === 'constant_students') {
    return initialActiveStudents;
  }

  if (growthMode === 'manual_monthly_path') {
    return manualMonthlyPath[month - 1];
  }

  /*
   * Month 1 is the initial state.
   * Growth is applied from month 2 onward.
   *
   * Student counts are discrete operational quantities,
   * therefore each month's modeled population is rounded
   * to the nearest whole learner with a floor of 1.
   */
  return Math.max(
    1,
    Math.round(
      initialActiveStudents *
      Math.pow(
        1 + monthlyGrowthRate,
        month - 1
      )
    )
  );
}


function validateProgressiveCostPlan(
  plan,
  horizonMonths
) {
  if (
    plan === undefined ||
    plan === null ||
    typeof plan !== 'object' ||
    Array.isArray(plan)
  ) {
    fail('progressive_cost_plan');
  }

  const allowed = new Set([
    'base_structure',
    'events'
  ]);

  for (const key of Object.keys(plan)) {
    if (!allowed.has(key)) {
      fail('progressive_cost_plan.' + key);
    }
  }

  const baseStructure =
    plan.base_structure === undefined
      ? 'current'
      : plan.base_structure;

  if (
    baseStructure !== 'current' &&
    baseStructure !== 'expanded'
  ) {
    fail('progressive_cost_plan.base_structure');
  }

  if (!Array.isArray(plan.events)) {
    fail('progressive_cost_plan.events');
  }

  const events = plan.events.map(
    (event, index) => {
      const path =
        'progressive_cost_plan.events.' +
        index;

      if (
        event === null ||
        typeof event !== 'object' ||
        Array.isArray(event)
      ) {
        fail(path);
      }

      const eventAllowed = new Set([
        'id',
        'kind',
        'start_month',
        'monthly_delta',
        'headcount_delta',
        'monthly_unit_cost',
        'status'
      ]);

      for (const key of Object.keys(event)) {
        if (!eventAllowed.has(key)) {
          fail(path + '.' + key);
        }
      }

      nonEmptyString(
        event.id,
        path + '.id'
      );

      if (
        event.kind !== 'cost_change' &&
        event.kind !== 'hiring'
      ) {
        fail(path + '.kind');
      }

      positiveInteger(
        event.start_month,
        path + '.start_month'
      );

      if (
        event.start_month >
        horizonMonths
      ) {
        fail(path + '.start_month');
      }

      const status =
        event.status === undefined
          ? 'to_validate'
          : event.status;

      if (
        status !== 'achieved' &&
        status !== 'current_assumption' &&
        status !== 'to_validate' &&
        status !== 'deferred'
      ) {
        fail(path + '.status');
      }

      let monthlyDelta;

      if (event.kind === 'cost_change') {
        finiteNumber(
          event.monthly_delta,
          path + '.monthly_delta'
        );

        monthlyDelta =
          event.monthly_delta;
      } else {
        positiveInteger(
          event.headcount_delta,
          path + '.headcount_delta'
        );

        finiteNumber(
          event.monthly_unit_cost,
          path + '.monthly_unit_cost',
          { min: 0 }
        );

        monthlyDelta =
          roundMoney(
            event.headcount_delta *
            event.monthly_unit_cost
          );
      }

      return {
        id: event.id,
        kind: event.kind,
        start_month: event.start_month,
        monthly_delta: monthlyDelta,
        status
      };
    }
  );

  const ids = new Set();

  for (const event of events) {
    if (ids.has(event.id)) {
      fail(
        'progressive_cost_plan.duplicate_event_id'
      );
    }

    ids.add(event.id);
  }

  return {
    base_structure: baseStructure,
    events
  };
}

function computeProgressiveOperatingCosts(
  model,
  plan,
  horizonMonths
) {
  const validatedModel = validateModel(model);

  positiveInteger(
    horizonMonths,
    'progressive_cost_horizon'
  );

  const validatedPlan =
    validateProgressiveCostPlan(
      plan,
      horizonMonths
    );

  const baseMonthly =
    validatedPlan.base_structure ===
      'expanded'
      ? validatedModel.operating_costs
          .expanded_fixed_monthly
      : validatedModel.operating_costs
          .current_fixed_monthly;

  const months = [];

  for (
    let month = 1;
    month <= horizonMonths;
    month += 1
  ) {
    const activeEvents =
      validatedPlan.events.filter(
        event =>
          event.start_month <= month
      );

    const eventDelta =
      roundMoney(
        activeEvents.reduce(
          (sum, event) =>
            sum + event.monthly_delta,
          0
        )
      );

    months.push({
      month,
      base_monthly: baseMonthly,
      event_delta: eventDelta,
      total_monthly:
        roundMoney(
          baseMonthly + eventDelta
        ),
      active_event_ids:
        activeEvents.map(
          event => event.id
        )
    });
  }

  return {
    kind: 'progressive_operating_costs',
    authority: 'server',

    semantics: {
      recruitment_creates_revenue: false,
      cost_plan_is_forecast: false,
      unvalidated_events_may_be_simulated:
        true
    },

    base_structure:
      validatedPlan.base_structure,

    events:
      validatedPlan.events,

    months
  };
}

function computeFinancialTrajectory(
  model,
  options = {}
) {
  const validatedModel = validateModel(model);
  const input = validateTrajectoryOptions(options);

  const modelBefore =
    JSON.stringify(validatedModel);

  const simulationModel =
    cloneModelForSimulation(validatedModel);

  if (
    input.home_conversion_rate !== undefined
  ) {
    simulationModel.home
      .school_to_home_conversion_rate =
        input.home_conversion_rate;
  }

  if (!input.home_enabled) {
    simulationModel.home
      .school_to_home_conversion_rate = 0;
  }

  const progressiveCosts =
    input.cost_structure === 'progressive'
      ? computeProgressiveOperatingCosts(
          simulationModel,
          input.progressive_cost_plan,
          input.horizon_months
        )
      : null;

  const fixedOperatingCosts =
    input.cost_structure === 'expanded'
      ? simulationModel.operating_costs
          .expanded_fixed_monthly
      : input.cost_structure === 'current'
        ? simulationModel.operating_costs
            .current_fixed_monthly
        : null;

  const months = [];

  let cumulativeOperatingGap = 0;
  let cumulativeCapex = 0;

  let previousClasses = 0;
  let previousStudentsWithIcareTablets = 0;

  let monthlyBreakEvenMonth = null;
  let cumulativeRecoveryMonth = null;

  for (
    let month = 1;
    month <= input.horizon_months;
    month += 1
  ) {
    const activeStudents =
      activeStudentsForTrajectoryMonth(
        input.initial_active_students,
        month,
        input.growth_mode,
        input.monthly_growth_rate,
        input.manual_monthly_path
      );

    const scenario =
      computeScenario(
        simulationModel,
        activeStudents,
        input.device_mode
      );

    /*
     * CAPEX is incremental:
     * - additional Box CAPEX only when class requirement rises;
     * - additional tablet CAPEX only when ICARE-supplied
     *   active learner count rises.
     *
     * Contraction does not create negative CAPEX or resale value.
     */
    const newClasses = Math.max(
      0,
      scenario.classes_required -
      previousClasses
    );

    const boxCapex =
      roundMoney(
        newClasses *
        simulationModel.hardware
          .box_budget_per_class
      );

    let tabletCapex = 0;

    if (input.device_mode === 'icare_supplied') {
      const newTabletStudents = Math.max(
        0,
        activeStudents -
        previousStudentsWithIcareTablets
      );

      tabletCapex =
        roundMoney(
          newTabletStudents *
          simulationModel.hardware
            .tablet_unit_cost
        );

      previousStudentsWithIcareTablets =
        Math.max(
          previousStudentsWithIcareTablets,
          activeStudents
        );
    }

    const hardwareCapex =
      roundMoney(
        boxCapex + tabletCapex
      );

    cumulativeCapex =
      roundMoney(
        cumulativeCapex +
        hardwareCapex
      );

    previousClasses =
      Math.max(
        previousClasses,
        scenario.classes_required
      );

    const contributionForCoverage =
      input.home_enabled
        ? scenario.monthly
            .combined_contribution
        : scenario.monthly
            .school_contribution;

    const monthlyOperatingCosts =
      progressiveCosts
        ? progressiveCosts.months[
            month - 1
          ].total_monthly
        : fixedOperatingCosts;

    const monthlyCoverageGap =
      roundMoney(
        contributionForCoverage -
        monthlyOperatingCosts
      );

    cumulativeOperatingGap =
      roundMoney(
        cumulativeOperatingGap +
        monthlyCoverageGap
      );

    /*
     * Cumulative recovery includes hardware CAPEX incurred
     * up to that month.
     */
    const cumulativeCoverageGap =
      roundMoney(
        cumulativeOperatingGap -
        cumulativeCapex
      );

    const monthlyBreakEven =
      monthlyCoverageGap >= 0;

    if (
      monthlyBreakEvenMonth === null &&
      monthlyBreakEven
    ) {
      monthlyBreakEvenMonth = month;
    }

    if (
      cumulativeRecoveryMonth === null &&
      cumulativeCoverageGap >= 0
    ) {
      cumulativeRecoveryMonth = month;
    }

    months.push({
      month,
      active_students: activeStudents,
      classes_required:
        scenario.classes_required,

      school_revenue:
        scenario.monthly.school_revenue,
      home_revenue:
        input.home_enabled
          ? scenario.monthly.home_revenue
          : 0,
      total_revenue:
        roundMoney(
          scenario.monthly.school_revenue +
          (
            input.home_enabled
              ? scenario.monthly.home_revenue
              : 0
          )
        ),

      school_teacher_incentives:
        scenario.monthly
          .school_teacher_incentives,

      home_teacher_cost:
        input.home_enabled
          ? scenario.monthly.home_teacher_cost
          : 0,

      school_contribution:
        scenario.monthly.school_contribution,

      home_contribution:
        input.home_enabled
          ? scenario.monthly.home_contribution
          : 0,

      combined_contribution:
        contributionForCoverage,

      fixed_operating_costs:
        monthlyOperatingCosts,

      progressive_cost_event_delta:
        progressiveCosts
          ? progressiveCosts.months[
              month - 1
            ].event_delta
          : 0,

      progressive_cost_active_event_ids:
        progressiveCosts
          ? progressiveCosts.months[
              month - 1
            ].active_event_ids
          : [],

      modeled_variable_costs: null,

      monthly_coverage_gap:
        monthlyCoverageGap,

      cumulative_operating_gap:
        cumulativeOperatingGap,

      hardware_capex:
        hardwareCapex,

      cumulative_capex:
        cumulativeCapex,

      cumulative_coverage_gap:
        cumulativeCoverageGap,

      monthly_break_even:
        monthlyBreakEven
    });
  }

  if (
    JSON.stringify(validatedModel) !==
    modelBefore
  ) {
    throw new Error(
      'FINROOM_MODEL_MUTATED_DURING_TRAJECTORY'
    );
  }

  return {
    kind: 'financial_trajectory',
    authority: 'server',
    official_model_mutated: false,

    semantics: {
      result_status: 'simulation',
      trajectory_is_forecast: false,
      growth_is_sensitivity:
        input.growth_mode ===
          'modeled_growth_rate',
      recruitment_creates_revenue: false,
      progressive_cost_plan_is_forecast: false,
      contribution_is_net_margin: false,
      monthly_break_even_is_cumulative_recovery:
        false,
      device_lifecycle_costs_complete: false
    },

    inputs: {
      horizon_months:
        input.horizon_months,
      initial_active_students:
        input.initial_active_students,
      growth_mode:
        input.growth_mode,
      monthly_growth_rate:
        input.monthly_growth_rate,
      manual_monthly_path:
        input.manual_monthly_path === undefined
          ? null
          : [...input.manual_monthly_path],
      device_mode:
        input.device_mode,
      home_enabled:
        input.home_enabled,
      home_conversion_rate:
        simulationModel.home
          .school_to_home_conversion_rate,
      cost_structure:
        input.cost_structure,
      progressive_cost_plan:
        progressiveCosts
          ? {
              base_structure:
                progressiveCosts
                  .base_structure,
              events:
                progressiveCosts.events
            }
          : null
    },

    summary: {
      horizon_months:
        input.horizon_months,

      monthly_break_even_month:
        monthlyBreakEvenMonth,

      cumulative_recovery_month:
        cumulativeRecoveryMonth,

      ending_active_students:
        months.length
          ? months[months.length - 1]
              .active_students
          : null,

      ending_monthly_coverage_gap:
        months.length
          ? months[months.length - 1]
              .monthly_coverage_gap
          : null,

      ending_cumulative_coverage_gap:
        months.length
          ? months[months.length - 1]
              .cumulative_coverage_gap
          : null
    },

    months
  };
}


/*
 * Multi-scenario sensitivity analysis.
 *
 * Scenarios are user/model assumptions, not forecasts.
 * No scenario is labelled best, worst, realistic or likely.
 * The engine reports differences; it does not choose a scenario.
 */
function validateSensitivityScenarios(scenarios) {
  if (
    !Array.isArray(scenarios) ||
    scenarios.length < 2 ||
    scenarios.length > 12
  ) {
    fail('sensitivity_scenarios');
  }

  const ids = new Set();

  return scenarios.map((scenario, index) => {
    const path =
      'sensitivity_scenarios.' + index;

    if (
      scenario === null ||
      typeof scenario !== 'object' ||
      Array.isArray(scenario)
    ) {
      fail(path);
    }

    const allowed = new Set([
      'id',
      'label',
      'options'
    ]);

    for (const key of Object.keys(scenario)) {
      if (!allowed.has(key)) {
        fail(path + '.' + key);
      }
    }

    nonEmptyString(
      scenario.id,
      path + '.id'
    );

    nonEmptyString(
      scenario.label,
      path + '.label'
    );

    if (ids.has(scenario.id)) {
      fail('sensitivity_scenarios.duplicate_id');
    }

    ids.add(scenario.id);

    if (
      scenario.options === null ||
      typeof scenario.options !== 'object' ||
      Array.isArray(scenario.options)
    ) {
      fail(path + '.options');
    }

    /*
     * Complete validation is delegated to
     * computeFinancialTrajectory.
     */
    return {
      id: scenario.id,
      label: scenario.label,
      options: scenario.options
    };
  });
}

function trajectoryTotals(trajectory) {
  const totals = trajectory.months.reduce(
    (acc, month) => {
      acc.school_revenue +=
        month.school_revenue;

      acc.home_revenue +=
        month.home_revenue;

      acc.total_revenue +=
        month.total_revenue;

      acc.school_teacher_incentives +=
        month.school_teacher_incentives;

      acc.home_teacher_cost +=
        month.home_teacher_cost;

      acc.school_contribution +=
        month.school_contribution;

      acc.home_contribution +=
        month.home_contribution;

      acc.combined_contribution +=
        month.combined_contribution;

      acc.operating_costs +=
        month.fixed_operating_costs;

      acc.hardware_capex +=
        month.hardware_capex;

      return acc;
    },
    {
      school_revenue: 0,
      home_revenue: 0,
      total_revenue: 0,
      school_teacher_incentives: 0,
      home_teacher_cost: 0,
      school_contribution: 0,
      home_contribution: 0,
      combined_contribution: 0,
      operating_costs: 0,
      hardware_capex: 0
    }
  );

  for (const key of Object.keys(totals)) {
    totals[key] =
      roundMoney(totals[key]);
  }

  return totals;
}

function computeSensitivityAnalysis(
  model,
  scenarios
) {
  const validatedModel = validateModel(model);
  const validatedScenarios =
    validateSensitivityScenarios(scenarios);

  const modelBefore =
    JSON.stringify(validatedModel);

  const results =
    validatedScenarios.map(scenario => {
      const trajectory =
        computeFinancialTrajectory(
          validatedModel,
          scenario.options
        );

      return {
        id: scenario.id,
        label: scenario.label,

        semantics: {
          scenario_is_forecast: false,
          scenario_probability_assigned: false,
          scenario_ranked: false
        },

        inputs: trajectory.inputs,

        totals:
          trajectoryTotals(trajectory),

        summary: {
          ...trajectory.summary
        },

        trajectory
      };
    });

  if (
    JSON.stringify(validatedModel) !==
    modelBefore
  ) {
    throw new Error(
      'FINROOM_MODEL_MUTATED_DURING_SENSITIVITY'
    );
  }

  const baseline = results[0];

  const comparisons =
    results.map(result => ({
      id: result.id,
      label: result.label,
      relative_to_scenario_id:
        baseline.id,

      delta_total_revenue:
        roundMoney(
          result.totals.total_revenue -
          baseline.totals.total_revenue
        ),

      delta_combined_contribution:
        roundMoney(
          result.totals.combined_contribution -
          baseline.totals.combined_contribution
        ),

      delta_operating_costs:
        roundMoney(
          result.totals.operating_costs -
          baseline.totals.operating_costs
        ),

      delta_hardware_capex:
        roundMoney(
          result.totals.hardware_capex -
          baseline.totals.hardware_capex
        ),

      delta_ending_monthly_coverage_gap:
        roundMoney(
          result.summary
            .ending_monthly_coverage_gap -
          baseline.summary
            .ending_monthly_coverage_gap
        ),

      delta_ending_cumulative_coverage_gap:
        roundMoney(
          result.summary
            .ending_cumulative_coverage_gap -
          baseline.summary
            .ending_cumulative_coverage_gap
        )
    }));

  return {
    kind: 'financial_sensitivity_analysis',
    authority: 'server',
    official_model_mutated: false,

    semantics: {
      analysis_is_forecast: false,
      probabilities_assigned: false,
      ranking_performed: false,
      baseline_is_reference_not_recommendation:
        true,
      field_evidence_may_inform_proposed_revisions:
        true,
      assumption_revisions_require_human_review:
        true,
      field_evidence_automatically_replaces_assumptions:
        false
    },

    baseline_scenario_id:
      baseline.id,

    scenario_count:
      results.length,

    results,
    comparisons
  };
}


/*
 * Field calibration contract.
 *
 * Observations are evidence records.
 * Revisions are explicit proposals.
 * Neither operation mutates the official model.
 *
 * Persistence, approval workflow and official-model replacement
 * belong to later integration gates.
 */
function validateAssumptionStatus(
  status,
  path
) {
  const allowed = new Set([
    'achieved',
    'current_assumption',
    'to_validate',
    'deferred'
  ]);

  if (!allowed.has(status)) {
    fail(path);
  }

  return status;
}

function validateFieldObservation(
  observation
) {
  if (
    observation === null ||
    typeof observation !== 'object' ||
    Array.isArray(observation)
  ) {
    fail('field_observation');
  }

  const allowed = new Set([
    'metric_id',
    'observed_value',
    'sample_size',
    'observation_period',
    'recorded_at',
    'source',
    'notes'
  ]);

  for (const key of Object.keys(observation)) {
    if (!allowed.has(key)) {
      fail('field_observation.' + key);
    }
  }

  nonEmptyString(
    observation.metric_id,
    'field_observation.metric_id'
  );

  finiteNumber(
    observation.observed_value,
    'field_observation.observed_value'
  );

  positiveInteger(
    observation.sample_size,
    'field_observation.sample_size'
  );

  nonEmptyString(
    observation.observation_period,
    'field_observation.observation_period'
  );

  nonEmptyString(
    observation.recorded_at,
    'field_observation.recorded_at'
  );

  nonEmptyString(
    observation.source,
    'field_observation.source'
  );

  if (
    observation.notes !== undefined &&
    typeof observation.notes !== 'string'
  ) {
    fail('field_observation.notes');
  }

  return {
    metric_id: observation.metric_id,
    observed_value:
      observation.observed_value,
    sample_size:
      observation.sample_size,
    observation_period:
      observation.observation_period,
    recorded_at:
      observation.recorded_at,
    source:
      observation.source,
    notes:
      observation.notes === undefined
        ? ''
        : observation.notes
  };
}

function validateFieldEvidenceSet(
  evidence
) {
  if (
    !Array.isArray(evidence) ||
    evidence.length < 1 ||
    evidence.length > 100
  ) {
    fail('field_evidence');
  }

  return evidence.map(
    observation =>
      validateFieldObservation(observation)
  );
}

function buildFieldCalibrationRevision(
  {
    metric_id,
    previous_value,
    proposed_value,
    previous_status = 'current_assumption',
    proposed_status = 'current_assumption',
    evidence,
    decision_note,
    revision_date
  } = {}
) {
  nonEmptyString(
    metric_id,
    'field_revision.metric_id'
  );

  finiteNumber(
    previous_value,
    'field_revision.previous_value'
  );

  finiteNumber(
    proposed_value,
    'field_revision.proposed_value'
  );

  validateAssumptionStatus(
    previous_status,
    'field_revision.previous_status'
  );

  validateAssumptionStatus(
    proposed_status,
    'field_revision.proposed_status'
  );

  const validatedEvidence =
    validateFieldEvidenceSet(evidence);

  nonEmptyString(
    decision_note,
    'field_revision.decision_note'
  );

  nonEmptyString(
    revision_date,
    'field_revision.revision_date'
  );

  for (
    const observation of validatedEvidence
  ) {
    if (
      observation.metric_id !== metric_id
    ) {
      fail(
        'field_revision.evidence_metric_mismatch'
      );
    }
  }

  return {
    kind: 'field_calibration_revision',

    authority: {
      evidence_is_observation: true,
      revision_is_proposal: true,
      automatic_model_mutation: false,
      automatic_model_persistence: false,
      human_review_required: true
    },

    metric_id,

    previous: {
      value: previous_value,
      status: previous_status
    },

    proposed: {
      value: proposed_value,
      status: proposed_status
    },

    evidence: validatedEvidence,

    decision_note,
    revision_date
  };
}

function applyRevisionToSimulationOverrides(
  overrides,
  revision,
  mapping
) {
  if (
    overrides === null ||
    typeof overrides !== 'object' ||
    Array.isArray(overrides)
  ) {
    fail('simulation_overrides');
  }

  if (
    revision === null ||
    typeof revision !== 'object' ||
    revision.kind !==
      'field_calibration_revision'
  ) {
    fail('field_revision');
  }

  if (
    mapping === null ||
    typeof mapping !== 'object' ||
    Array.isArray(mapping)
  ) {
    fail('field_revision_mapping');
  }

  const target =
    mapping[revision.metric_id];

  nonEmptyString(
    target,
    'field_revision_mapping.target'
  );

  /*
   * Only an ephemeral simulation object is produced.
   * The official model is never modified here.
   */
  return {
    ...overrides,
    [target]: revision.proposed.value
  };
}


/* R5 CONTRACT FOUNDATION — BEGIN
 *
 * Contract-only foundation for Pricing Rationale / Unit Economics.
 *
 * IMPORTANT:
 * - no real/private ICARE monetary values are defined here;
 * - no pricing arithmetic is implemented here;
 * - no legacy R4F calculation semantics are changed here.
 */

const R5_ASSUMPTION_STATUS = new Set([
  'achieved',
  'current_assumption',
  'to_validate',
  'deferred'
]);

const R5_CONFIDENCE = new Set([
  'low',
  'medium',
  'high'
]);

const R5_SOURCE_TYPE = new Set([
  'internal_estimate',
  'supplier_quote',
  'supplier_catalog',
  'invoice',
  'internal_purchase_record',
  'fabrication_estimate',
  'fabrication_actual',
  'payroll_policy',
  'statutory_source',
  'market_reference',
  'competitor_reference',
  'customer_interview',
  'pilot_observation',
  'contract',
  'management_target',
  'logistics_quote',
  'customs_or_statutory_source',
  'installation_estimate',
  'installation_actual',
  'technical_fixture'
]);

const R5_COST_CLASS = new Set([
  'manufacturing_cost',
  'installation_cost',
  'hardware_capex',
  'teacher_variable_cost',
  'fixed_operating_cost',
  'maintenance_cost',
  'support_cost',
  'infrastructure_cost',
  'distribution_cost',
  'customer_acquisition_cost',
  'tax_cost',
  'compliance_cost',
  'risk_reserve',
  'financing_cost',
  'amortization'
]);

const R5_OFFER_ID = new Set([
  'school_b2b2c',
  'home_saas',
  'tablet_rental',
  'tablet_provision',
  'box',
  'support_maintenance'
]);

const R5_PRICING_DECISION_STATUS =
  new Set([
    'proposed',
    'approved',
    'rejected',
    'superseded'
  ]);

const R5_TECHNICAL_COST_ORIGIN =
  new Set([
    'purchased_component',
    'fabricated_component',
    'fabricated_submodule',
    'fabricated_module',
    'assembly',
    'integration',
    'provisioning',
    'shipping',
    'customs',
    'installation',
    'deployment',
    'replacement',
    'repair',
    'other_declared'
  ]);

const R5_PROCUREMENT_OR_FABRICATION_MODE =
  new Set([
    'purchased',
    'fabricated',
    'assembled',
    'mixed',
    'externally_provided',
    'unknown_to_validate'
  ]);

const R5_LEGACY_RECONCILIATION_CLASS =
  new Set([
    'not_in_legacy',
    'fully_in_legacy',
    'partially_in_legacy',
    'legacy_represents_different_scope',
    'unknown_requires_validation'
  ]);

const R5_LEGACY_RECONCILIATION_ACTION =
  new Set([
    'include_new',
    'exclude_duplicate',
    'include_incremental_only',
    'retain_legacy_only',
    'replace_after_validated_migration',
    'manual_review_required'
  ]);

const R5_ALLOCATION_BASIS =
  new Set([
    'per_learner',
    'per_class',
    'per_device',
    'per_school',
    'per_month',
    'per_year',
    'usage_based',
    'equal_share',
    'management_policy',
    'direct_attribution',
    'custom_documented'
  ]);

const R5_TECHNICAL_COST_COMPLETENESS =
  new Set([
    'complete_for_declared_scope',
    'partial_known_gaps',
    'preliminary_estimate',
    'unavailable'
  ]);

const R5_ECONOMIC_COST_COMPLETENESS =
  new Set([
    'complete_for_declared_scope',
    'partial_known_gaps',
    'incomplete_required_costs',
    'unavailable'
  ]);

const R5_CONTRACT_ENUMS = Object.freeze({
  assumption_status:
    Object.freeze([...R5_ASSUMPTION_STATUS]),
  confidence:
    Object.freeze([...R5_CONFIDENCE]),
  source_type:
    Object.freeze([...R5_SOURCE_TYPE]),
  cost_class:
    Object.freeze([...R5_COST_CLASS]),
  offer_id:
    Object.freeze([...R5_OFFER_ID]),
  pricing_decision_status:
    Object.freeze([...R5_PRICING_DECISION_STATUS]),
  technical_cost_origin:
    Object.freeze([...R5_TECHNICAL_COST_ORIGIN]),
  procurement_or_fabrication_mode:
    Object.freeze([
      ...R5_PROCUREMENT_OR_FABRICATION_MODE
    ]),
  legacy_reconciliation_class:
    Object.freeze([
      ...R5_LEGACY_RECONCILIATION_CLASS
    ]),
  legacy_reconciliation_action:
    Object.freeze([
      ...R5_LEGACY_RECONCILIATION_ACTION
    ]),
  allocation_basis:
    Object.freeze([...R5_ALLOCATION_BASIS]),
  technical_cost_completeness:
    Object.freeze([
      ...R5_TECHNICAL_COST_COMPLETENESS
    ]),
  economic_cost_completeness:
    Object.freeze([
      ...R5_ECONOMIC_COST_COMPLETENESS
    ])
});

function validatePlainObject(
  value,
  path
) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    fail(path);
  }

  return value;
}

function validateArray(
  value,
  path
) {
  if (!Array.isArray(value)) {
    fail(path);
  }

  return value;
}

function validateOptionalString(
  value,
  path,
  maxLength = 1000
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    fail(path);
  }

  if (value.length > maxLength) {
    fail(path);
  }

  return value;
}

function validateBoolean(
  value,
  path
) {
  if (typeof value !== 'boolean') {
    fail(path);
  }

  return value;
}

function validateEnumValue(
  value,
  allowed,
  path
) {
  if (!allowed.has(value)) {
    fail(path);
  }

  return value;
}

function validateR5AssumptionStatus(
  value,
  path = 'assumption_status'
) {
  return validateEnumValue(
    value,
    R5_ASSUMPTION_STATUS,
    path
  );
}

function validateR5Confidence(
  value,
  path = 'confidence'
) {
  return validateEnumValue(
    value,
    R5_CONFIDENCE,
    path
  );
}

function validateR5SourceType(
  value,
  path = 'source_type'
) {
  return validateEnumValue(
    value,
    R5_SOURCE_TYPE,
    path
  );
}

function validateR5CostClass(
  value,
  path = 'cost_class'
) {
  return validateEnumValue(
    value,
    R5_COST_CLASS,
    path
  );
}

function validateR5OfferId(
  value,
  path = 'offer_id'
) {
  return validateEnumValue(
    value,
    R5_OFFER_ID,
    path
  );
}

function validateR5PricingDecisionStatus(
  value,
  path = 'pricing_decision_status'
) {
  return validateEnumValue(
    value,
    R5_PRICING_DECISION_STATUS,
    path
  );
}

function validateR5TechnicalCostOrigin(
  value,
  path = 'cost_origin'
) {
  return validateEnumValue(
    value,
    R5_TECHNICAL_COST_ORIGIN,
    path
  );
}

function validateR5ProcurementMode(
  value,
  path =
    'procurement_or_fabrication_mode'
) {
  return validateEnumValue(
    value,
    R5_PROCUREMENT_OR_FABRICATION_MODE,
    path
  );
}

function validateR5LegacyReconciliationClass(
  value,
  path = 'classification'
) {
  return validateEnumValue(
    value,
    R5_LEGACY_RECONCILIATION_CLASS,
    path
  );
}

function validateR5LegacyReconciliationAction(
  value,
  path = 'reconciliation_action'
) {
  return validateEnumValue(
    value,
    R5_LEGACY_RECONCILIATION_ACTION,
    path
  );
}

function validateR5AllocationBasis(
  value,
  path = 'allocation_basis'
) {
  return validateEnumValue(
    value,
    R5_ALLOCATION_BASIS,
    path
  );
}

function validateR5TechnicalCostCompleteness(
  value,
  path = 'technical_cost_completeness'
) {
  return validateEnumValue(
    value,
    R5_TECHNICAL_COST_COMPLETENESS,
    path
  );
}

function validateR5EconomicCostCompleteness(
  value,
  path = 'economic_cost_completeness'
) {
  return validateEnumValue(
    value,
    R5_ECONOMIC_COST_COMPLETENESS,
    path
  );
}

function validateCanonicalMonetaryValue(
  raw,
  path = 'monetary_value'
) {
  validatePlainObject(raw, path);

  finiteNumber(
    raw.value,
    path + '.value'
  );

  nonEmptyString(
    raw.currency,
    path + '.currency',
    16
  );

  nonEmptyString(
    raw.unit,
    path + '.unit'
  );

  nonEmptyString(
    raw.scope,
    path + '.scope'
  );

  nonEmptyString(
    raw.provenance,
    path + '.provenance',
    500
  );

  validateR5SourceType(
    raw.source_type,
    path + '.source_type'
  );

  validateR5AssumptionStatus(
    raw.assumption_status,
    path + '.assumption_status'
  );

  nonEmptyString(
    raw.effective_date,
    path + '.effective_date',
    64
  );

  validateR5Confidence(
    raw.confidence,
    path + '.confidence'
  );

  validateArray(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

function validateTechnicalComponent(
  raw,
  path = 'technical_component'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.component_id,
    path + '.component_id'
  );

  nonEmptyString(
    raw.name,
    path + '.name'
  );

  finiteNumber(
    raw.quantity,
    path + '.quantity',
    {
      min: Number.EPSILON
    }
  );

  nonEmptyString(
    raw.unit_of_measure,
    path + '.unit_of_measure'
  );

  validateR5ProcurementMode(
    raw.procurement_or_fabrication_mode,
    path +
      '.procurement_or_fabrication_mode'
  );

  nonEmptyString(
    raw.technical_reference,
    path + '.technical_reference',
    500
  );

  nonEmptyString(
    raw.lifecycle_class,
    path + '.lifecycle_class'
  );

  validateArray(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

function validateTechnicalSubmodule(
  raw,
  path = 'technical_submodule'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.submodule_id,
    path + '.submodule_id'
  );

  nonEmptyString(
    raw.name,
    path + '.name'
  );

  finiteNumber(
    raw.quantity,
    path + '.quantity',
    {
      min: Number.EPSILON
    }
  );

  validateArray(
    raw.components,
    path + '.components'
  ).forEach(
    (component, index) =>
      validateTechnicalComponent(
        component,
        path + '.components[' + index + ']'
      )
  );

  validateArray(
    raw.submodule_cost_items,
    path + '.submodule_cost_items'
  );

  validateArray(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

function validateTechnicalModule(
  raw,
  path = 'technical_module'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.module_id,
    path + '.module_id'
  );

  nonEmptyString(
    raw.name,
    path + '.name'
  );

  finiteNumber(
    raw.quantity,
    path + '.quantity',
    {
      min: Number.EPSILON
    }
  );

  validateArray(
    raw.submodules,
    path + '.submodules'
  ).forEach(
    (submodule, index) =>
      validateTechnicalSubmodule(
        submodule,
        path + '.submodules[' + index + ']'
      )
  );

  validateArray(
    raw.components,
    path + '.components'
  ).forEach(
    (component, index) =>
      validateTechnicalComponent(
        component,
        path + '.components[' + index + ']'
      )
  );

  validateArray(
    raw.module_cost_items,
    path + '.module_cost_items'
  );

  validateArray(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

function validateTechnicalProductConfiguration(
  raw,
  path = 'technical_product_configuration'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.configuration_id,
    path + '.configuration_id'
  );

  nonEmptyString(
    raw.product_id,
    path + '.product_id'
  );

  nonEmptyString(
    raw.product_version,
    path + '.product_version'
  );

  nonEmptyString(
    raw.configuration_name,
    path + '.configuration_name'
  );

  /*
   * Technical maturity remains a distinct axis.
   * B1 validates presence only; it does not merge
   * TechRoom maturity with FinRoom assumption status.
   */
  nonEmptyString(
    raw.maturity_status,
    path + '.maturity_status'
  );

  nonEmptyString(
    raw.effective_date,
    path + '.effective_date',
    64
  );

  validateArray(
    raw.modules,
    path + '.modules'
  ).forEach(
    (moduleItem, index) =>
      validateTechnicalModule(
        moduleItem,
        path + '.modules[' + index + ']'
      )
  );

  validateArray(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

function validateTechnicalCostItem(
  raw,
  path = 'technical_cost_item'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.cost_item_id,
    path + '.cost_item_id'
  );

  nonEmptyString(
    raw.technical_ref,
    path + '.technical_ref'
  );

  nonEmptyString(
    raw.configuration_id,
    path + '.configuration_id'
  );

  validateR5TechnicalCostOrigin(
    raw.cost_origin,
    path + '.cost_origin'
  );

  validateR5CostClass(
    raw.cost_class,
    path + '.cost_class'
  );

  finiteNumber(
    raw.quantity,
    path + '.quantity'
  );

  validateCanonicalMonetaryValue(
    raw.unit_cost,
    path + '.unit_cost'
  );

  validateR5ProcurementMode(
    raw.procurement_or_fabrication_mode,
    path +
      '.procurement_or_fabrication_mode'
  );

  validateR5SourceType(
    raw.source_type,
    path + '.source_type'
  );

  nonEmptyString(
    raw.provenance,
    path + '.provenance',
    500
  );

  nonEmptyString(
    raw.effective_date,
    path + '.effective_date',
    64
  );

  validateR5AssumptionStatus(
    raw.assumption_status,
    path + '.assumption_status'
  );

  validateR5Confidence(
    raw.confidence,
    path + '.confidence'
  );

  validateArray(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  validateBoolean(
    raw.included_in_legacy_cost,
    path + '.included_in_legacy_cost'
  );

  for (
    const [key, maxLength] of [
      ['module_id', 100],
      ['submodule_id', 100],
      ['component_id', 100],
      ['supplier_or_source_ref', 500],
      ['legacy_cost_ref', 500]
    ]
  ) {
    if (raw[key] !== undefined) {
      nonEmptyString(
        raw[key],
        path + '.' + key,
        maxLength
      );
    }
  }

  if (raw.lifecycle_months !== undefined) {
    finiteNumber(
      raw.lifecycle_months,
      path + '.lifecycle_months'
    );
  }

  if (raw.replacement_rate !== undefined) {
    finiteNumber(
      raw.replacement_rate,
      path + '.replacement_rate',
      { min: 0, max: 1 }
    );
  }

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

function validateTechnicalCostBasisHandoff(
  raw,
  path = 'technical_cost_basis_handoff'
) {
  validatePlainObject(raw, path);

  for (
    const key of [
      'handoff_id',
      'configuration_id',
      'configuration_version',
      'technical_cost_basis_id'
    ]
  ) {
    nonEmptyString(
      raw[key],
      path + '.' + key
    );
  }

  nonEmptyString(
    raw.currency,
    path + '.currency',
    16
  );

  nonEmptyString(
    raw.effective_date,
    path + '.effective_date',
    64
  );

  finiteNumber(
    raw.total_direct_cost,
    path + '.total_direct_cost'
  );

  finiteNumber(
    raw.landed_cost,
    path + '.landed_cost'
  );

  finiteNumber(
    raw.deployed_cost,
    path + '.deployed_cost'
  );

  if (
    raw.lifecycle_assumptions === null ||
    typeof raw.lifecycle_assumptions !==
      'object'
  ) {
    fail(
      path + '.lifecycle_assumptions'
    );
  }

  validateArray(
    raw.unresolved_cost_items,
    path + '.unresolved_cost_items'
  );

  validateArray(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  nonEmptyString(
    raw.maturity_status,
    path + '.maturity_status'
  );

  nonEmptyString(
    raw.disclosure_class,
    path + '.disclosure_class'
  );

  return raw;
}

function validateLegacyCostReconciliation(
  raw,
  path = 'legacy_cost_reconciliation'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.reconciliation_id,
    path + '.reconciliation_id'
  );

  nonEmptyString(
    raw.model_version,
    path + '.model_version'
  );

  nonEmptyString(
    raw.technical_cost_ref,
    path + '.technical_cost_ref'
  );

  nonEmptyString(
    raw.legacy_cost_ref,
    path + '.legacy_cost_ref'
  );

  validateR5LegacyReconciliationClass(
    raw.classification,
    path + '.classification'
  );

  validateR5LegacyReconciliationAction(
    raw.reconciliation_action,
    path + '.reconciliation_action'
  );

  if (raw.overlap_amount !== undefined) {
    finiteNumber(
      raw.overlap_amount,
      path + '.overlap_amount'
    );
  }

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

function validateCostAllocation(
  raw,
  path = 'cost_allocation'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.allocation_id,
    path + '.allocation_id'
  );

  nonEmptyString(
    raw.source_cost_ref,
    path + '.source_cost_ref'
  );

  validateR5OfferId(
    raw.offer_id,
    path + '.offer_id'
  );

  nonEmptyString(
    raw.segment_id,
    path + '.segment_id'
  );

  validateR5AllocationBasis(
    raw.allocation_basis,
    path + '.allocation_basis'
  );

  nonEmptyString(
    raw.allocation_driver,
    path + '.allocation_driver'
  );

  nonEmptyString(
    raw.allocation_period,
    path + '.allocation_period'
  );

  finiteNumber(
    raw.allocated_value,
    path + '.allocated_value'
  );

  nonEmptyString(
    raw.currency,
    path + '.currency',
    16
  );

  if (
    raw.assumptions === null ||
    typeof raw.assumptions !== 'object'
  ) {
    fail(path + '.assumptions');
  }

  validateArray(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  nonEmptyString(
    raw.status,
    path + '.status'
  );

  return raw;
}


/* R5 B2 REFERENCE-ONLY COST RECONCILIATION — BEGIN
 *
 * Reference-only refinement.
 *
 * IMPORTANT:
 * - technical_ref is opaque external identity;
 * - no TechRoom hierarchy is asserted here;
 * - no real/private ICARE monetary values are defined here;
 * - no pricing arithmetic is implemented here;
 * - B1 validators remain backward-compatible.
 */

const R5_REFERENCE_TECHNICAL_REF_TYPE = new Set([
  'opaque_reference',
  'product',
  'configuration',
  'module',
  'submodule',
  'component',
  'assembly',
  'device',
  'service',
  'other_declared'
]);

const R5_COST_COVERAGE_STATUS = new Set([
  'included',
  'excluded',
  'unknown'
]);

const R5_COST_COVERAGE_KEYS = Object.freeze([
  'material',
  'component',
  'fabrication',
  'assembly',
  'integration',
  'provisioning',
  'freight',
  'customs',
  'tax',
  'installation',
  'deployment',
  'packaging',
  'testing',
  'warranty'
]);

const R5_REFERENCE_COST_ENUMS = Object.freeze({
  technical_ref_type:
    Object.freeze([...R5_REFERENCE_TECHNICAL_REF_TYPE]),
  cost_coverage_status:
    Object.freeze([...R5_COST_COVERAGE_STATUS]),
  cost_coverage_keys:
    R5_COST_COVERAGE_KEYS
});

function validateReferenceEnum(
  value,
  allowed,
  path
) {
  nonEmptyString(value, path);

  if (!allowed.has(value)) {
    fail(path);
  }

  return value;
}

function validateR5ReferenceTechnicalRefType(
  value,
  path = 'technical_ref_type'
) {
  return validateReferenceEnum(
    value,
    R5_REFERENCE_TECHNICAL_REF_TYPE,
    path
  );
}

function validateR5CostCoverageStatus(
  value,
  path = 'cost_coverage_status'
) {
  return validateReferenceEnum(
    value,
    R5_COST_COVERAGE_STATUS,
    path
  );
}

function validateReferenceCostCoverage(
  raw,
  path = 'cost_coverage'
) {
  validatePlainObject(raw, path);

  for (const key of R5_COST_COVERAGE_KEYS) {
    validateR5CostCoverageStatus(
      raw[key],
      path + '.' + key
    );
  }

  if (!Array.isArray(raw.other_declared)) {
    fail(path + '.other_declared');
  }

  raw.other_declared.forEach(
    (entry, index) => {
      const itemPath =
        path +
        '.other_declared[' +
        index +
        ']';

      validatePlainObject(
        entry,
        itemPath
      );

      nonEmptyString(
        entry.label,
        itemPath + '.label',
        160
      );

      validateR5CostCoverageStatus(
        entry.status,
        itemPath + '.status'
      );
    }
  );

  return raw;
}

function validateReferenceTechnicalCostEvidence(
  raw,
  path = 'reference_technical_cost_evidence'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.cost_item_id,
    path + '.cost_item_id',
    160
  );

  nonEmptyString(
    raw.technical_ref,
    path + '.technical_ref',
    500
  );

  validateR5ReferenceTechnicalRefType(
    raw.technical_ref_type,
    path + '.technical_ref_type'
  );

  nonEmptyString(
    raw.technical_scope,
    path + '.technical_scope',
    160
  );

  nonEmptyString(
    raw.technical_label,
    path + '.technical_label',
    240
  );

  finiteNumber(
    raw.quantity,
    path + '.quantity',
    { min: 0 }
  );

  nonEmptyString(
    raw.unit_of_measure,
    path + '.unit_of_measure',
    80
  );

  validateR5ProcurementMode(
    raw.procurement_or_fabrication_mode,
    path +
      '.procurement_or_fabrication_mode'
  );

  validateR5TechnicalCostOrigin(
    raw.cost_origin,
    path + '.cost_origin'
  );

  validateR5CostClass(
    raw.cost_class,
    path + '.cost_class'
  );

  validateCanonicalMonetaryValue(
    raw.unit_cost,
    path + '.unit_cost'
  );

  validateReferenceCostCoverage(
    raw.cost_coverage,
    path + '.cost_coverage'
  );

  nonEmptyString(
    raw.provenance,
    path + '.provenance',
    500
  );

  validateR5SourceType(
    raw.source_type,
    path + '.source_type'
  );

  validateR5AssumptionStatus(
    raw.assumption_status,
    path + '.assumption_status'
  );

  nonEmptyString(
    raw.effective_date,
    path + '.effective_date',
    64
  );

  validateR5Confidence(
    raw.confidence,
    path + '.confidence'
  );

  if (!Array.isArray(raw.evidence_refs)) {
    fail(path + '.evidence_refs');
  }

  raw.evidence_refs.forEach(
    (ref, index) => {
      nonEmptyString(
        ref,
        path +
          '.evidence_refs[' +
          index +
          ']',
        500
      );
    }
  );

  nonEmptyString(
    raw.legacy_cost_ref,
    path + '.legacy_cost_ref',
    500
  );

  validateR5LegacyReconciliationClass(
    raw.reconciliation_classification,
    path +
      '.reconciliation_classification'
  );

  validateR5LegacyReconciliationAction(
    raw.reconciliation_action,
    path + '.reconciliation_action'
  );

  validateR5TechnicalCostCompleteness(
    raw.completeness_status,
    path + '.completeness_status'
  );

  nonEmptyString(
    raw.notes,
    path + '.notes',
    1000
  );

  if (
    raw.reconciliation_classification ===
      'not_in_legacy' &&
    raw.legacy_cost_ref !== 'legacy:none'
  ) {
    fail(path + '.legacy_cost_ref');
  }

  if (
    raw.reconciliation_classification ===
      'not_in_legacy' &&
    raw.reconciliation_action !==
      'include_new'
  ) {
    fail(path + '.reconciliation_action');
  }

  if (
    raw.reconciliation_classification ===
      'fully_in_legacy' &&
    ![
      'exclude_duplicate',
      'retain_legacy_only'
    ].includes(raw.reconciliation_action)
  ) {
    fail(path + '.reconciliation_action');
  }

  if (
    raw.reconciliation_classification ===
      'partially_in_legacy' &&
    ![
      'include_incremental_only',
      'manual_review_required'
    ].includes(raw.reconciliation_action)
  ) {
    fail(path + '.reconciliation_action');
  }

  if (
    raw.reconciliation_classification ===
      'unknown_requires_validation' &&
    raw.reconciliation_action !==
      'manual_review_required'
  ) {
    fail(path + '.reconciliation_action');
  }

  for (
    const [key, maxLength] of [
      ['scope_version', 160],
      ['parent_cost_item_ref', 160],
      ['overlap_group_ref', 160],
      ['supplier_or_source_ref', 500]
    ]
  ) {
    if (raw[key] !== undefined) {
      nonEmptyString(
        raw[key],
        path + '.' + key,
        maxLength
      );
    }
  }

  if (
    raw.incremental_to_parent !==
    undefined
  ) {
    validateBoolean(
      raw.incremental_to_parent,
      path + '.incremental_to_parent'
    );
  }

  if (
    raw.supplemental_charge_type !==
    undefined
  ) {
    nonEmptyString(
      raw.supplemental_charge_type,
      path +
        '.supplemental_charge_type',
      80
    );

    if (
      !R5_COST_COVERAGE_KEYS.includes(
        raw.supplemental_charge_type
      )
    ) {
      fail(
        path +
          '.supplemental_charge_type'
      );
    }
  }

  if (
    raw.public_exposure !==
    undefined
  ) {
    validateBoolean(
      raw.public_exposure,
      path + '.public_exposure'
    );
  }

  if (
    raw.source_type ===
      'technical_fixture' &&
    raw.public_exposure === true
  ) {
    fail(path + '.public_exposure');
  }

  return raw;
}

function referenceTechnicalCostIdentityKey(
  raw
) {
  /*
   * Descriptive technical identity only.
   *
   * IMPORTANT:
   * technical identity is NOT economic-line identity.
   * Multiple legitimate economic cost lines may concern the
   * same technical reference/date/scope.
   */
  return [
    raw.technical_ref,
    raw.effective_date,
    raw.technical_scope,
    raw.scope_version || ''
  ].join('|');
}

function referenceCostCoverageHasUnknown(
  raw
) {
  for (const key of R5_COST_COVERAGE_KEYS) {
    if (raw[key] === 'unknown') {
      return true;
    }
  }

  for (const entry of raw.other_declared) {
    if (entry.status === 'unknown') {
      return true;
    }
  }

  return false;
}

function validateReferenceTechnicalCostEvidenceSet(
  raw,
  options = {},
  path = 'reference_technical_cost_evidence_set'
) {
  if (!Array.isArray(raw)) {
    fail(path);
  }

  validatePlainObject(
    options,
    path + '.options'
  );

  const finalAggregate =
    options.final_aggregate === true;

  const byId = new Map();

  raw.forEach(
    (item, index) => {
      const itemPath =
        path +
        '[' +
        index +
        ']';

      validateReferenceTechnicalCostEvidence(
        item,
        itemPath
      );

      if (
        byId.has(item.cost_item_id)
      ) {
        fail(
          itemPath + '.cost_item_id'
        );
      }

      byId.set(
        item.cost_item_id,
        item
      );

      if (
        finalAggregate &&
        item.reconciliation_classification ===
          'unknown_requires_validation'
      ) {
        fail(
          itemPath +
            '.reconciliation_classification'
        );
      }

      if (
        finalAggregate &&
        item.reconciliation_action ===
          'manual_review_required'
      ) {
        fail(
          itemPath +
            '.reconciliation_action'
        );
      }

      const contributesToFinalAggregate =
        [
          'include_new',
          'include_incremental_only'
        ].includes(
          item.reconciliation_action
        );

      if (
        finalAggregate &&
        contributesToFinalAggregate &&
        item.completeness_status !==
          'complete_for_declared_scope'
      ) {
        fail(
          itemPath +
            '.completeness_status'
        );
      }

      if (
        finalAggregate &&
        contributesToFinalAggregate &&
        referenceCostCoverageHasUnknown(
          item.cost_coverage
        )
      ) {
        fail(
          itemPath +
            '.cost_coverage'
        );
      }

      if (
        finalAggregate &&
        item.source_type ===
          'technical_fixture'
      ) {
        fail(
          itemPath + '.source_type'
        );
      }
    }
  );

  raw.forEach(
    (item, index) => {
      if (
        item.parent_cost_item_ref ===
        undefined
      ) {
        return;
      }

      const parent =
        byId.get(
          item.parent_cost_item_ref
        );

      if (!parent) {
        return;
      }

      if (
        item.incremental_to_parent !==
        true
      ) {
        fail(
          path +
            '[' +
            index +
            '].parent_cost_item_ref'
        );
      }
    }
  );

  const byOverlapGroup = new Map();

  raw.forEach(
    item => {
      if (
        item.overlap_group_ref ===
        undefined
      ) {
        return;
      }

      if (
        !byOverlapGroup.has(
          item.overlap_group_ref
        )
      ) {
        byOverlapGroup.set(
          item.overlap_group_ref,
          []
        );
      }

      byOverlapGroup
        .get(item.overlap_group_ref)
        .push(item);
    }
  );

  for (
    const groupItems of
      byOverlapGroup.values()
  ) {
    for (
      const supplemental of
        groupItems
    ) {
      const chargeType =
        supplemental
          .supplemental_charge_type;

      if (!chargeType) {
        continue;
      }

      for (
        const candidate of
          groupItems
      ) {
        if (
          candidate === supplemental
        ) {
          continue;
        }

        if (
          candidate.cost_coverage[
            chargeType
          ] === 'included'
        ) {
          fail(
            path +
              '.overlap_group_ref'
          );
        }
      }
    }
  }

  return raw;
}

/* R5 B2 REFERENCE-ONLY COST RECONCILIATION — END */

/* R5 B3.1 ECONOMIC CORRIDOR CONTRACT — BEGIN
 *
 * Contract + validator foundation only.
 *
 * Canonical intended relation:
 *
 *   ECONOMIC_FLOOR
 *     <= STRATEGIC_TARGET
 *     <= AFFORDABILITY_CEILING
 *
 * IMPORTANT:
 * - no official ICARE price recommendation is defined here;
 * - no real/private ICARE monetary values are defined here;
 * - no willingness-to-pay claim is created here;
 * - no corridor result/status arithmetic is authoritative yet;
 * - no browser pricing authority is created here;
 * - no TechRoom/BOM authority is inferred here;
 * - no FX conversion is implemented here.
 *
 * TechRoom → FinRoom boundary:
 * - TechRoom owns technical change/reason/characteristics;
 * - FinRoom may reference an authorized configuration/change;
 * - detailed technical characteristics are not owned here;
 * - a technical change does not silently mutate the official
 *   financial model.
 */

const R5_ECONOMIC_CORRIDOR_STATUS = new Set([
  'valid_corridor',
  'below_economic_floor',
  'above_affordability_ceiling',
  'no_affordability_evidence',
  'incomplete_cost_basis',
  'conflicting_evidence',
  'manual_review_required'
]);

const R5_PRICING_POLICY = new Set([
  'penetration',
  'market_alignment',
  'value_based',
  'premium',
  'skimming',
  'cost_plus',
  'subsidized',
  'cross_subsidized',
  'custom_documented'
]);

const R5_ECONOMIC_FLOOR_COST_LEVEL = new Set([
  'direct_technical_cost',
  'landed_deployed_technical_cost',
  'total_service_cost',
  'full_economic_cost'
]);

const R5_AFFORDABILITY_EVIDENCE_STATUS =
  new Set([
    'preliminary_estimate',
    'to_validate',
    'observed',
    'validated_for_declared_scope',
    'unavailable'
  ]);

const R5_B3_SCENARIO = new Set([
  'current',
  'expanded'
]);

/*
 * Sources that cannot establish an internal economic floor.
 */
const R5_B3_FLOOR_DISALLOWED_SOURCE_TYPE =
  new Set([
    'market_reference',
    'competitor_reference',
    'customer_interview',
    'pilot_observation',
    'management_target',
    'technical_fixture'
  ]);

/*
 * Sources that may inform affordability.
 *
 * This does NOT imply willingness-to-pay validation.
 */
const R5_B3_AFFORDABILITY_SOURCE_TYPE =
  new Set([
    'statutory_source',
    'market_reference',
    'competitor_reference',
    'customer_interview',
    'pilot_observation',
    'contract'
  ]);

const R5_B3_CORRIDOR_ENUMS = Object.freeze({
  corridor_status:
    Object.freeze([
      ...R5_ECONOMIC_CORRIDOR_STATUS
    ]),
  pricing_policy:
    Object.freeze([
      ...R5_PRICING_POLICY
    ]),
  economic_floor_cost_level:
    Object.freeze([
      ...R5_ECONOMIC_FLOOR_COST_LEVEL
    ]),
  affordability_evidence_status:
    Object.freeze([
      ...R5_AFFORDABILITY_EVIDENCE_STATUS
    ]),
  scenario:
    Object.freeze([
      ...R5_B3_SCENARIO
    ])
});

function validateB3EnumValue(
  value,
  allowed,
  path
) {
  if (
    typeof value !== 'string' ||
    !allowed.has(value)
  ) {
    fail(path);
  }

  return value;
}

function validateEconomicCorridorStatus(
  value,
  path = 'economic_corridor_status'
) {
  return validateB3EnumValue(
    value,
    R5_ECONOMIC_CORRIDOR_STATUS,
    path
  );
}

function validateR5PricingPolicy(
  value,
  path = 'pricing_policy'
) {
  return validateB3EnumValue(
    value,
    R5_PRICING_POLICY,
    path
  );
}

function validateEconomicFloorCostLevel(
  value,
  path = 'economic_floor.cost_level'
) {
  return validateB3EnumValue(
    value,
    R5_ECONOMIC_FLOOR_COST_LEVEL,
    path
  );
}

function validateAffordabilityEvidenceStatus(
  value,
  path =
    'affordability_ceiling.evidence_status'
) {
  return validateB3EnumValue(
    value,
    R5_AFFORDABILITY_EVIDENCE_STATUS,
    path
  );
}

function validateB3Scenario(
  value,
  path = 'scenario_id'
) {
  return validateB3EnumValue(
    value,
    R5_B3_SCENARIO,
    path
  );
}

function validateB3EvidenceRefs(
  raw,
  path
) {
  return validateArray(
    raw,
    path
  ).map((ref, index) => {
    nonEmptyString(
      ref,
      path + '[' + index + ']',
      500
    );

    return ref;
  });
}

function validateB3NonNegativeNumber(
  value,
  path
) {
  finiteNumber(value, path);

  if (value < 0) {
    fail(path);
  }

  return value;
}

function rejectB3ShadowCurrency(
  raw,
  path
) {
  /*
   * B3.1 has one corridor-level currency authority.
   * Nested currency creates an undeclared FX seam.
   */
  if (raw.currency !== undefined) {
    fail(path + '.currency');
  }
}

function validateEconomicFloor(
  raw,
  path = 'economic_floor'
) {
  validatePlainObject(raw, path);

  validateB3NonNegativeNumber(
    raw.value,
    path + '.value'
  );

  validateEconomicFloorCostLevel(
    raw.cost_level,
    path + '.cost_level'
  );

  nonEmptyString(
    raw.cost_basis_ref,
    path + '.cost_basis_ref',
    500
  );

  validateR5EconomicCostCompleteness(
    raw.completeness_status,
    path + '.completeness_status'
  );

  if (
    raw.completeness_status === 'unavailable'
  ) {
    fail(path + '.completeness_status');
  }

  nonEmptyString(
    raw.provenance,
    path + '.provenance',
    500
  );

  validateR5SourceType(
    raw.source_type,
    path + '.source_type'
  );

  if (
    R5_B3_FLOOR_DISALLOWED_SOURCE_TYPE.has(
      raw.source_type
    )
  ) {
    fail(path + '.source_type');
  }

  validateR5Confidence(
    raw.confidence,
    path + '.confidence'
  );

  validateB3EvidenceRefs(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  rejectB3ShadowCurrency(raw, path);

  return raw;
}

function validateStrategicTarget(
  raw,
  path = 'strategic_target'
) {
  validatePlainObject(raw, path);

  validateB3NonNegativeNumber(
    raw.value,
    path + '.value'
  );

  validateR5PricingPolicy(
    raw.pricing_policy,
    path + '.pricing_policy'
  );

  nonEmptyString(
    raw.rationale,
    path + '.rationale',
    1000
  );

  nonEmptyString(
    raw.provenance,
    path + '.provenance',
    500
  );

  validateR5SourceType(
    raw.source_type,
    path + '.source_type'
  );

  if (raw.source_type === 'technical_fixture') {
    fail(path + '.source_type');
  }

  validateR5AssumptionStatus(
    raw.assumption_status,
    path + '.assumption_status'
  );

  validateR5Confidence(
    raw.confidence,
    path + '.confidence'
  );

  validateB3EvidenceRefs(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  rejectB3ShadowCurrency(raw, path);

  return raw;
}

function validateAffordabilityCeiling(
  raw,
  path = 'affordability_ceiling'
) {
  validatePlainObject(raw, path);

  validateAffordabilityEvidenceStatus(
    raw.evidence_status,
    path + '.evidence_status'
  );

  nonEmptyString(
    raw.provenance,
    path + '.provenance',
    500
  );

  validateB3EvidenceRefs(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  rejectB3ShadowCurrency(raw, path);

  if (
    raw.evidence_status === 'unavailable'
  ) {
    /*
     * Missing evidence is not zero and is not infinity.
     */
    if (raw.value !== null) {
      fail(path + '.value');
    }

    if (raw.source_type !== null) {
      fail(path + '.source_type');
    }

    if (raw.confidence !== null) {
      fail(path + '.confidence');
    }

    return raw;
  }

  if (raw.value === null) {
    fail(path + '.value');
  }

  validateB3NonNegativeNumber(
    raw.value,
    path + '.value'
  );

  validateR5SourceType(
    raw.source_type,
    path + '.source_type'
  );

  if (
    !R5_B3_AFFORDABILITY_SOURCE_TYPE.has(
      raw.source_type
    )
  ) {
    fail(path + '.source_type');
  }

  validateR5Confidence(
    raw.confidence,
    path + '.confidence'
  );

  /*
   * Competitor pricing is context only.
   * It cannot alone establish validated affordability.
   */
  if (
    raw.source_type ===
      'competitor_reference' &&
    raw.evidence_status ===
      'validated_for_declared_scope'
  ) {
    fail(path + '.evidence_status');
  }

  if (
    raw.evidence_status ===
      'validated_for_declared_scope' &&
    raw.evidence_refs.length === 0
  ) {
    fail(path + '.evidence_refs');
  }

  return raw;
}

function validateSubsidyPolicy(
  raw,
  path = 'subsidy_policy'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.status,
    path + '.status'
  );

  validateR5PricingPolicy(
    raw.type,
    path + '.type'
  );

  if (
    raw.type !== 'subsidized' &&
    raw.type !== 'cross_subsidized' &&
    raw.type !== 'custom_documented'
  ) {
    fail(path + '.type');
  }

  if (typeof raw.amount_or_rule === 'number') {
    validateB3NonNegativeNumber(
      raw.amount_or_rule,
      path + '.amount_or_rule'
    );
  } else {
    nonEmptyString(
      raw.amount_or_rule,
      path + '.amount_or_rule',
      1000
    );
  }

  nonEmptyString(
    raw.source_ref,
    path + '.source_ref',
    500
  );

  return raw;
}

function validateEconomicCorridorInput(
  raw,
  path = 'economic_corridor_input'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.corridor_id,
    path + '.corridor_id'
  );

  validateR5OfferId(
    raw.offer_id,
    path + '.offer_id'
  );

  nonEmptyString(
    raw.segment_id,
    path + '.segment_id'
  );

  validateB3Scenario(
    raw.scenario_id,
    path + '.scenario_id'
  );

  nonEmptyString(
    raw.currency,
    path + '.currency',
    16
  );

  nonEmptyString(
    raw.price_unit,
    path + '.price_unit'
  );

  nonEmptyString(
    raw.effective_date,
    path + '.effective_date',
    64
  );

  /*
   * Optional TechRoom/financial-version traceability.
   *
   * These are opaque references only. Their presence does not
   * make FinRoom authoritative over technical characteristics.
   */
  for (const key of [
    'configuration_ref',
    'technical_change_ref',
    'scenario_ref',
    'market_scope',
    'geography'
  ]) {
    if (raw[key] !== undefined) {
      nonEmptyString(
        raw[key],
        path + '.' + key,
        500
      );
    }
  }

  validateEconomicFloor(
    raw.economic_floor,
    path + '.economic_floor'
  );

  validateStrategicTarget(
    raw.strategic_target,
    path + '.strategic_target'
  );

  validateAffordabilityCeiling(
    raw.affordability_ceiling,
    path + '.affordability_ceiling'
  );

  if (
    raw.subsidy_policy !== null &&
    raw.subsidy_policy !== undefined
  ) {
    validateSubsidyPolicy(
      raw.subsidy_policy,
      path + '.subsidy_policy'
    );
  }

  /*
   * Below-floor target may only exist with explicit
   * subsidy/cross-subsidy documentation.
   *
   * This does not change the mathematical economic floor.
   */
  if (
    raw.strategic_target.value <
    raw.economic_floor.value
  ) {
    if (
      raw.subsidy_policy === null ||
      raw.subsidy_policy === undefined
    ) {
      fail(path + '.subsidy_policy');
    }
  }

  /*
   * Caller cannot self-declare the final corridor result.
   * A later server-side evaluator owns that classification.
   */
  if (raw.status !== undefined) {
    fail(path + '.status');
  }

  /*
   * B3.1 does not implement FX.
   */
  for (const key of [
    'fx_rate',
    'fx_policy',
    'currency_conversion',
    'converted_currency'
  ]) {
    if (raw[key] !== undefined) {
      fail(path + '.' + key);
    }
  }

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

/* R5 B3.1 ECONOMIC CORRIDOR CONTRACT — END */

/* R5 B3.2 FLOOR ELIGIBILITY — BEGIN
 *
 * Determines whether an already supplied / calculated cost basis
 * is eligible to serve as:
 * - a final floor for a declared economic purpose; or
 * - a labelled analytical lower bound.
 *
 * This block DOES NOT:
 * - aggregate real ICARE costs;
 * - retrieve suppliers;
 * - expose endpoints/UI;
 * - synchronize TechRoom automatically;
 * - perform FX or unit conversion;
 * - calculate strategic target or affordability;
 * - recommend a price;
 * - implement B3.5 corridor classification.
 */

const R5_FLOOR_ELIGIBILITY_STATUS = new Set([
  'eligible_final',
  'eligible_lower_bound',
  'incomplete_required_costs',
  'unresolved_reconciliation',
  'unresolved_cost_coverage',
  'missing_allocation_basis',
  'scope_mismatch',
  'unit_mismatch',
  'currency_mismatch',
  'effective_date_missing',
  'conflicting_evidence',
  'manual_review_required'
]);

const R5_FLOOR_PURPOSE = new Set([
  'direct_technical_analysis',
  'deployed_asset_analysis',
  'service_sustainability',
  'full_economic_sustainability'
]);

const R5_FLOOR_RECONCILIATION_STATUS = new Set([
  'resolved',
  'not_required',
  'unresolved',
  'conflicting'
]);

const R5_FLOOR_COVERAGE_STATUS = new Set([
  'resolved',
  'not_applicable',
  'unknown_contributing',
  'conflicting'
]);

const R5_FLOOR_ALLOCATION_STATUS = new Set([
  'not_required',
  'complete',
  'incomplete',
  'unresolved'
]);

const R5_FLOOR_LEVEL_RANK = Object.freeze({
  direct_technical_cost: 1,
  landed_deployed_technical_cost: 2,
  total_service_cost: 3,
  full_economic_cost: 4
});

const R5_FLOOR_PURPOSE_MINIMUM_RANK = Object.freeze({
  direct_technical_analysis: 1,
  deployed_asset_analysis: 2,
  service_sustainability: 3,
  full_economic_sustainability: 4
});

const R5_FLOOR_STATUS_PRECEDENCE = Object.freeze([
  'conflicting_evidence',
  'currency_mismatch',
  'unit_mismatch',
  'scope_mismatch',
  'effective_date_missing',
  'unresolved_reconciliation',
  'unresolved_cost_coverage',
  'missing_allocation_basis',
  'incomplete_required_costs',
  'eligible_final',
  'eligible_lower_bound'
]);

const R5_B3_2_ENUMS = Object.freeze({
  eligibility_status:
    Object.freeze([...R5_FLOOR_ELIGIBILITY_STATUS]),
  floor_purpose:
    Object.freeze([...R5_FLOOR_PURPOSE]),
  reconciliation_status:
    Object.freeze([...R5_FLOOR_RECONCILIATION_STATUS]),
  coverage_status:
    Object.freeze([...R5_FLOOR_COVERAGE_STATUS]),
  allocation_status:
    Object.freeze([...R5_FLOOR_ALLOCATION_STATUS]),
  status_precedence:
    R5_FLOOR_STATUS_PRECEDENCE
});

function validateFloorEligibilityStatus(
  value,
  path = 'eligibility_status'
) {
  return validateB3EnumValue(
    value,
    R5_FLOOR_ELIGIBILITY_STATUS,
    path
  );
}

function validateFloorPurpose(
  value,
  path = 'floor_purpose'
) {
  return validateB3EnumValue(
    value,
    R5_FLOOR_PURPOSE,
    path
  );
}

function validateFloorReconciliationStatus(
  value,
  path = 'reconciliation_status'
) {
  return validateB3EnumValue(
    value,
    R5_FLOOR_RECONCILIATION_STATUS,
    path
  );
}

function validateFloorCoverageStatus(
  value,
  path = 'coverage_status'
) {
  return validateB3EnumValue(
    value,
    R5_FLOOR_COVERAGE_STATUS,
    path
  );
}

function validateFloorAllocationStatus(
  value,
  path = 'allocation.status'
) {
  return validateB3EnumValue(
    value,
    R5_FLOOR_ALLOCATION_STATUS,
    path
  );
}

function validateFloorBasisDimensions(
  raw,
  path
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.currency,
    path + '.currency',
    16
  );

  nonEmptyString(
    raw.unit,
    path + '.unit',
    200
  );

  nonEmptyString(
    raw.scope_ref,
    path + '.scope_ref',
    500
  );

  /*
   * Only effective_date is nullable in B3.2,
   * because effective_date_missing is a frozen
   * evaluator state.
   */
  if (raw.effective_date !== null) {
    nonEmptyString(
      raw.effective_date,
      path + '.effective_date',
      64
    );
  }

  return raw;
}

function validateFloorRequiredContext(
  raw,
  path = 'required_context'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.currency,
    path + '.currency',
    16
  );

  nonEmptyString(
    raw.unit,
    path + '.unit',
    200
  );

  nonEmptyString(
    raw.scope_ref,
    path + '.scope_ref',
    500
  );

  validateFloorPurpose(
    raw.floor_purpose,
    path + '.floor_purpose'
  );

  return raw;
}

function validateFloorAllocation(
  raw,
  path = 'allocation'
) {
  validatePlainObject(raw, path);

  validateBoolean(
    raw.required,
    path + '.required'
  );

  validateFloorAllocationStatus(
    raw.status,
    path + '.status'
  );

  const optionalStrings = [
    'basis',
    'driver',
    'lifecycle_or_period',
    'utilization_or_capacity'
  ];

  for (const key of optionalStrings) {
    if (raw[key] !== null) {
      nonEmptyString(
        raw[key],
        path + '.' + key,
        500
      );
    }
  }

  /*
   * If basis is declared, it must reuse the
   * existing canonical allocation vocabulary.
   */
  if (raw.basis !== null) {
    validateR5AllocationBasis(
      raw.basis,
      path + '.basis'
    );
  }

  validateB3EvidenceRefs(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  return raw;
}

function validateFloorEligibilityInput(
  raw,
  path = 'floor_eligibility_input'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.floor_basis_id,
    path + '.floor_basis_id',
    500
  );

  validateR5OfferId(
    raw.offer_id,
    path + '.offer_id'
  );

  nonEmptyString(
    raw.segment_id,
    path + '.segment_id',
    500
  );

  validateB3Scenario(
    raw.scenario_id,
    path + '.scenario_id'
  );

  validateEconomicFloorCostLevel(
    raw.requested_cost_level,
    path + '.requested_cost_level'
  );

  nonEmptyString(
    raw.cost_basis_ref,
    path + '.cost_basis_ref',
    500
  );

  for (const key of [
    'configuration_ref',
    'technical_change_ref'
  ]) {
    if (
      raw[key] !== null &&
      raw[key] !== undefined
    ) {
      nonEmptyString(
        raw[key],
        path + '.' + key,
        500
      );
    }
  }

  validateFloorBasisDimensions(
    raw.actual_basis,
    path + '.actual_basis'
  );

  validateFloorRequiredContext(
    raw.required_context,
    path + '.required_context'
  );

  validateR5EconomicCostCompleteness(
    raw.completeness_status,
    path + '.completeness_status'
  );

  validateFloorReconciliationStatus(
    raw.reconciliation_status,
    path + '.reconciliation_status'
  );

  validateFloorCoverageStatus(
    raw.coverage_status,
    path + '.coverage_status'
  );

  validateFloorAllocation(
    raw.allocation,
    path + '.allocation'
  );

  nonEmptyString(
    raw.provenance,
    path + '.provenance',
    500
  );

  validateR5SourceType(
    raw.source_type,
    path + '.source_type'
  );

  validateR5Confidence(
    raw.confidence,
    path + '.confidence'
  );

  validateB3EvidenceRefs(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

function floorPurposeSatisfied(
  requestedCostLevel,
  floorPurpose
) {
  const actualRank =
    R5_FLOOR_LEVEL_RANK[requestedCostLevel];

  const requiredRank =
    R5_FLOOR_PURPOSE_MINIMUM_RANK[floorPurpose];

  return actualRank >= requiredRank;
}

function evaluateFloorEligibility(
  raw,
  path = 'floor_eligibility_input'
) {
  validateFloorEligibilityInput(raw, path);

  const blockingReasons = [];
  const diagnostics = [];

  const addBlock = (
    status,
    code,
    message
  ) => {
    blockingReasons.push({
      status,
      code
    });

    diagnostics.push({
      severity: 'blocking',
      code,
      message
    });
  };

  /*
   * Evidence conflict has highest precedence.
   */
  if (
    raw.reconciliation_status === 'conflicting' ||
    raw.coverage_status === 'conflicting' ||
    raw.source_type === 'technical_fixture'
  ) {
    addBlock(
      'conflicting_evidence',
      raw.source_type === 'technical_fixture'
        ? 'TECHNICAL_FIXTURE_NOT_OFFICIAL_ECONOMIC_EVIDENCE'
        : 'CONFLICTING_ECONOMIC_EVIDENCE',
      raw.source_type === 'technical_fixture'
        ? 'Technical fixture evidence cannot qualify as an official economic floor.'
        : 'One or more economic evidence dimensions conflict.'
    );
  }

  if (
    raw.actual_basis.currency !==
    raw.required_context.currency
  ) {
    addBlock(
      'currency_mismatch',
      'CURRENCY_MISMATCH',
      'Actual basis currency differs from required context currency.'
    );
  }

  if (
    raw.actual_basis.unit !==
    raw.required_context.unit
  ) {
    addBlock(
      'unit_mismatch',
      'UNIT_MISMATCH',
      'Actual basis unit differs from required context unit.'
    );
  }

  if (
    raw.actual_basis.scope_ref !==
    raw.required_context.scope_ref
  ) {
    addBlock(
      'scope_mismatch',
      'SCOPE_MISMATCH',
      'Actual basis scope differs from required context scope.'
    );
  }

  if (raw.actual_basis.effective_date === null) {
    addBlock(
      'effective_date_missing',
      'EFFECTIVE_DATE_MISSING',
      'Actual cost basis has no effective date.'
    );
  }

  if (raw.reconciliation_status === 'unresolved') {
    addBlock(
      'unresolved_reconciliation',
      'UNRESOLVED_RECONCILIATION',
      'Applicable reconciliation remains unresolved.'
    );
  }

  if (
    raw.coverage_status === 'unknown_contributing'
  ) {
    addBlock(
      'unresolved_cost_coverage',
      'UNKNOWN_CONTRIBUTING_COST_COVERAGE',
      'At least one contributing cost coverage dimension remains unknown.'
    );
  }

  /*
   * Allocation readiness is evaluated economically,
   * rather than rejected structurally.
   */
  if (raw.allocation.required) {
    if (
      raw.allocation.status !== 'complete' ||
      raw.allocation.basis === null ||
      raw.allocation.driver === null ||
      raw.allocation.lifecycle_or_period === null
    ) {
      addBlock(
        'missing_allocation_basis',
        raw.allocation.status === 'unresolved'
          ? 'REQUIRED_ALLOCATION_UNRESOLVED'
          : 'REQUIRED_ALLOCATION_INCOMPLETE',
        raw.allocation.status === 'unresolved'
          ? 'Required recurring/lifecycle allocation remains unresolved.'
          : 'Required recurring/lifecycle allocation is incomplete.'
      );
    }
  } else {
    /*
     * Documentary evidence is not allocation mechanics.
     *
     * evidence_refs may explain why allocation is not required
     * and must not, by itself, create an allocation blocker.
     */
    const carriesAllocationMechanics =
      raw.allocation.basis !== null ||
      raw.allocation.driver !== null ||
      raw.allocation.lifecycle_or_period !== null ||
      raw.allocation.utilization_or_capacity !== null;

    if (
      raw.allocation.status !== 'not_required' ||
      carriesAllocationMechanics
    ) {
      addBlock(
        'missing_allocation_basis',
        carriesAllocationMechanics
          ? 'ALLOCATION_NOT_REQUIRED_WITH_MECHANICS'
          : 'ALLOCATION_STATUS_INCONSISTENT',
        carriesAllocationMechanics
          ? 'Allocation is marked not required but still carries allocation mechanics.'
          : 'Allocation is marked not required but carries a non-matching readiness status.'
      );
    }
  }

  if (
    raw.completeness_status !==
    'complete_for_declared_scope'
  ) {
    addBlock(
      'incomplete_required_costs',
      'COST_BASIS_NOT_COMPLETE_FOR_DECLARED_SCOPE',
      'Cost basis is not complete for the declared scope.'
    );
  }

  /*
   * Pick the highest-precedence blocking status.
   */
  let primaryStatus = null;

  for (
    const candidateStatus of
    R5_FLOOR_STATUS_PRECEDENCE
  ) {
    if (
      blockingReasons.some(
        (item) =>
          item.status === candidateStatus
      )
    ) {
      primaryStatus = candidateStatus;
      break;
    }
  }

  if (primaryStatus !== null) {
    return {
      floor_basis_id: raw.floor_basis_id,
      requested_cost_level:
        raw.requested_cost_level,
      eligibility_status: primaryStatus,
      eligible_for_final_floor: false,
      eligible_as_lower_bound: false,
      blocking_reasons: blockingReasons,
      diagnostics,
      cost_basis_ref: raw.cost_basis_ref,
      configuration_ref:
        raw.configuration_ref ?? null,
      technical_change_ref:
        raw.technical_change_ref ?? null,
      evidence_refs:
        [...raw.evidence_refs]
    };
  }

  const purposeSatisfied =
    floorPurposeSatisfied(
      raw.requested_cost_level,
      raw.required_context.floor_purpose
    );

  if (purposeSatisfied) {
    diagnostics.push({
      severity: 'info',
      code: 'ELIGIBLE_FINAL',
      message:
        'Cost basis is sufficiently comprehensive for the declared floor purpose.'
    });

    return {
      floor_basis_id: raw.floor_basis_id,
      requested_cost_level:
        raw.requested_cost_level,
      eligibility_status: 'eligible_final',
      eligible_for_final_floor: true,
      eligible_as_lower_bound: false,
      blocking_reasons: [],
      diagnostics,
      cost_basis_ref: raw.cost_basis_ref,
      configuration_ref:
        raw.configuration_ref ?? null,
      technical_change_ref:
        raw.technical_change_ref ?? null,
      evidence_refs:
        [...raw.evidence_refs]
    };
  }

  diagnostics.push({
    severity: 'info',
    code: 'ELIGIBLE_LOWER_BOUND',
    message:
      'Cost basis is valid evidence but insufficiently comprehensive for the declared floor purpose.'
  });

  return {
    floor_basis_id: raw.floor_basis_id,
    requested_cost_level:
      raw.requested_cost_level,
    eligibility_status: 'eligible_lower_bound',
    eligible_for_final_floor: false,
    eligible_as_lower_bound: true,
    blocking_reasons: [],
    diagnostics,
    cost_basis_ref: raw.cost_basis_ref,
    configuration_ref:
      raw.configuration_ref ?? null,
    technical_change_ref:
      raw.technical_change_ref ?? null,
    evidence_refs:
      [...raw.evidence_refs]
  };
}

/* R5 B3.2 FLOOR ELIGIBILITY — END */

/* R5 B3.3 STRATEGIC TARGET POLICY — BEGIN
 *
 * Determines whether a declared strategic target is economically
 * comparable with an eligible floor and whether a below-floor target
 * has an explicit support policy.
 *
 * This block DOES NOT:
 * - validate willingness-to-pay;
 * - establish affordability;
 * - calculate the full economic corridor;
 * - perform FX or unit conversion;
 * - retrieve real market/customer data;
 * - automatically mutate the official target;
 * - synchronize TechRoom automatically;
 * - expose endpoints or browser arithmetic.
 */

const R5_B3_3_TARGET_ALLOWED_SOURCE_TYPE = new Set([
  'management_target',
  'internal_estimate',
  'market_reference',
  'competitor_reference',
  'customer_interview',
  'pilot_observation',
  'contract',
  'statutory_source'
]);

const R5_TARGET_POLICY_STATUS = new Set([
  'ready_at_or_above_floor',
  'ready_below_floor_with_support',
  'floor_not_final',
  'below_floor_without_support',
  'currency_mismatch',
  'unit_mismatch',
  'scope_mismatch',
  'offer_segment_scenario_mismatch',
  'invalid_target_evidence',
  'manual_review_required'
]);

const R5_TARGET_SUPPORT_TYPE = new Set([
  'subsidy',
  'cross_subsidy',
  'custom_documented_support'
]);

const R5_TARGET_SUPPORT_STATUS = new Set([
  'identified',
  'unresolved',
  'approved',
  'rejected'
]);

const R5_TARGET_RELATION_TO_FLOOR = new Set([
  'above',
  'equal',
  'below',
  'not_comparable'
]);

const R5_TARGET_POLICY_STATUS_PRECEDENCE = Object.freeze([
  'invalid_target_evidence',
  'currency_mismatch',
  'unit_mismatch',
  'scope_mismatch',
  'offer_segment_scenario_mismatch',
  'floor_not_final',
  'below_floor_without_support',
  'manual_review_required',
  'ready_below_floor_with_support',
  'ready_at_or_above_floor'
]);

const R5_B3_3_ENUMS = Object.freeze({
  target_policy_status:
    Object.freeze([...R5_TARGET_POLICY_STATUS]),
  support_type:
    Object.freeze([...R5_TARGET_SUPPORT_TYPE]),
  support_status:
    Object.freeze([...R5_TARGET_SUPPORT_STATUS]),
  relation_to_floor:
    Object.freeze([...R5_TARGET_RELATION_TO_FLOOR]),
  status_precedence:
    R5_TARGET_POLICY_STATUS_PRECEDENCE
});

function validateTargetPolicyStatus(
  value,
  path = 'target_policy_status'
) {
  return validateB3EnumValue(
    value,
    R5_TARGET_POLICY_STATUS,
    path
  );
}

function validateTargetSupportType(
  value,
  path = 'support_policy.type'
) {
  return validateB3EnumValue(
    value,
    R5_TARGET_SUPPORT_TYPE,
    path
  );
}

function validateTargetSupportStatus(
  value,
  path = 'support_policy.status'
) {
  return validateB3EnumValue(
    value,
    R5_TARGET_SUPPORT_STATUS,
    path
  );
}

function validateTargetRelationToFloor(
  value,
  path = 'relation_to_floor'
) {
  return validateB3EnumValue(
    value,
    R5_TARGET_RELATION_TO_FLOOR,
    path
  );
}

function validateB3StringRefs(
  raw,
  path
) {
  validateArray(raw, path);

  raw.forEach((value, index) => {
    nonEmptyString(
      value,
      path + '[' + index + ']',
      500
    );
  });

  return raw;
}

function validateTargetPolicyStrategicTarget(
  raw,
  path = 'strategic_target'
) {
  validatePlainObject(raw, path);

  finiteNumber(
    raw.value,
    path + '.value',
    { min: 0 }
  );

  nonEmptyString(
    raw.currency,
    path + '.currency',
    16
  );

  nonEmptyString(
    raw.unit,
    path + '.unit',
    200
  );

  nonEmptyString(
    raw.scope_ref,
    path + '.scope_ref',
    500
  );

  nonEmptyString(
    raw.effective_date,
    path + '.effective_date',
    64
  );

  validateR5PricingPolicy(
    raw.pricing_policy,
    path + '.pricing_policy'
  );

  nonEmptyString(
    raw.rationale,
    path + '.rationale',
    2000
  );

  nonEmptyString(
    raw.provenance,
    path + '.provenance',
    500
  );

  validateR5SourceType(
    raw.source_type,
    path + '.source_type'
  );

  validateR5AssumptionStatus(
    raw.assumption_status,
    path + '.assumption_status'
  );

  validateR5Confidence(
    raw.confidence,
    path + '.confidence'
  );

  validateB3StringRefs(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  /*
   * Reuse B3.1's strategic-target semantics too.
   * B3.1 accepts a target object without target-local
   * currency/unit/scope/date fields, so pass only its
   * canonical target subset.
   */
  validateStrategicTarget(
    {
      value: raw.value,
      pricing_policy: raw.pricing_policy,
      rationale: raw.rationale,
      provenance: raw.provenance,
      source_type: raw.source_type,
      assumption_status: raw.assumption_status,
      confidence: raw.confidence,
      evidence_refs: raw.evidence_refs
    },
    path
  );

  return raw;
}

function validateTargetPolicyFloorContext(
  raw,
  path = 'floor_context'
) {
  validatePlainObject(raw, path);

  finiteNumber(
    raw.value,
    path + '.value',
    { min: 0 }
  );

  nonEmptyString(
    raw.currency,
    path + '.currency',
    16
  );

  nonEmptyString(
    raw.unit,
    path + '.unit',
    200
  );

  nonEmptyString(
    raw.scope_ref,
    path + '.scope_ref',
    500
  );

  validateEconomicFloorCostLevel(
    raw.floor_cost_level,
    path + '.floor_cost_level'
  );

  nonEmptyString(
    raw.floor_basis_ref,
    path + '.floor_basis_ref',
    500
  );

  validateFloorEligibilityStatus(
    raw.floor_eligibility_status,
    path + '.floor_eligibility_status'
  );

  validateR5OfferId(
    raw.offer_id,
    path + '.offer_id'
  );

  nonEmptyString(
    raw.segment_id,
    path + '.segment_id',
    500
  );

  validateB3Scenario(
    raw.scenario_id,
    path + '.scenario_id'
  );

  validateB3StringRefs(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  return raw;
}

function validateTargetSupportPolicy(
  raw,
  path = 'support_policy'
) {
  validatePlainObject(raw, path);

  validateTargetSupportStatus(
    raw.status,
    path + '.status'
  );

  validateTargetSupportType(
    raw.type,
    path + '.type'
  );

  if (
    typeof raw.amount_or_rule !== 'number' &&
    typeof raw.amount_or_rule !== 'string'
  ) {
    fail(path + '.amount_or_rule');
  }

  if (typeof raw.amount_or_rule === 'number') {
    finiteNumber(
      raw.amount_or_rule,
      path + '.amount_or_rule',
      { min: 0 }
    );
  } else {
    nonEmptyString(
      raw.amount_or_rule,
      path + '.amount_or_rule',
      1000
    );
  }

  if (
    raw.source_ref !== null &&
    raw.source_ref !== undefined
  ) {
    nonEmptyString(
      raw.source_ref,
      path + '.source_ref',
      500
    );
  }

  validateB3StringRefs(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  if (
    (
      raw.status === 'identified' ||
      raw.status === 'approved'
    ) &&
    (
      raw.source_ref === null ||
      raw.source_ref === undefined
    )
  ) {
    fail(path + '.source_ref');
  }

  return raw;
}

function validateTargetPolicyInput(
  raw,
  path = 'target_policy_input'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.target_policy_id,
    path + '.target_policy_id',
    500
  );

  validateR5OfferId(
    raw.offer_id,
    path + '.offer_id'
  );

  nonEmptyString(
    raw.segment_id,
    path + '.segment_id',
    500
  );

  validateB3Scenario(
    raw.scenario_id,
    path + '.scenario_id'
  );

  validateTargetPolicyStrategicTarget(
    raw.strategic_target,
    path + '.strategic_target'
  );

  validateTargetPolicyFloorContext(
    raw.floor_context,
    path + '.floor_context'
  );

  if (
    raw.support_policy !== null &&
    raw.support_policy !== undefined
  ) {
    validateTargetSupportPolicy(
      raw.support_policy,
      path + '.support_policy'
    );
  }

  validateB3StringRefs(
    raw.market_context_refs,
    path + '.market_context_refs'
  );

  validateR5PricingDecisionStatus(
    raw.decision_status,
    path + '.decision_status'
  );

  for (const key of [
    'configuration_ref',
    'technical_change_ref'
  ]) {
    if (
      raw[key] !== null &&
      raw[key] !== undefined
    ) {
      nonEmptyString(
        raw[key],
        path + '.' + key,
        500
      );
    }
  }

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

function targetPolicySupportMatches(
  pricingPolicy,
  supportPolicy
) {
  if (!supportPolicy) {
    return false;
  }

  if (pricingPolicy === 'subsidized') {
    return supportPolicy.type === 'subsidy';
  }

  if (pricingPolicy === 'cross_subsidized') {
    return supportPolicy.type === 'cross_subsidy';
  }

  if (pricingPolicy === 'custom_documented') {
    return (
      supportPolicy.type ===
      'custom_documented_support'
    );
  }

  return false;
}

function targetSupportIsReady(
  supportPolicy
) {
  return Boolean(
    supportPolicy &&
    (
      supportPolicy.status === 'identified' ||
      supportPolicy.status === 'approved'
    ) &&
    supportPolicy.source_ref
  );
}

function evaluateTargetPolicy(
  raw,
  path = 'target_policy_input'
) {
  validateTargetPolicyInput(raw, path);

  const blockers = [];
  const diagnostics = [];

  const addBlock = (
    status,
    code,
    message
  ) => {
    blockers.push({
      status,
      code
    });

    diagnostics.push({
      severity: 'blocking',
      code,
      message
    });
  };

  /*
   * Target-source authority is stricter than the generic
   * R5 source vocabulary.
   *
   * technical_fixture never reaches this evaluator because
   * B3.1 validateStrategicTarget rejects it structurally.
   *
   * Other generic technical/accounting sources remain
   * representable, but cannot by themselves qualify an
   * official strategic target.
   */
  if (
    !R5_B3_3_TARGET_ALLOWED_SOURCE_TYPE.has(
      raw.strategic_target.source_type
    )
  ) {
    addBlock(
      'invalid_target_evidence',
      'SOURCE_NOT_ELIGIBLE_FOR_STRATEGIC_TARGET',
      'Declared source type cannot qualify official strategic-target readiness.'
    );
  }

  const sameCurrency =
    raw.strategic_target.currency ===
    raw.floor_context.currency;

  const sameUnit =
    raw.strategic_target.unit ===
    raw.floor_context.unit;

  const sameScope =
    raw.strategic_target.scope_ref ===
    raw.floor_context.scope_ref;

  const sameOfferSegmentScenario =
    raw.offer_id === raw.floor_context.offer_id &&
    raw.segment_id === raw.floor_context.segment_id &&
    raw.scenario_id === raw.floor_context.scenario_id;

  if (!sameCurrency) {
    addBlock(
      'currency_mismatch',
      'TARGET_FLOOR_CURRENCY_MISMATCH',
      'Strategic target and floor currencies differ.'
    );
  }

  if (!sameUnit) {
    addBlock(
      'unit_mismatch',
      'TARGET_FLOOR_UNIT_MISMATCH',
      'Strategic target and floor units differ.'
    );
  }

  if (!sameScope) {
    addBlock(
      'scope_mismatch',
      'TARGET_FLOOR_SCOPE_MISMATCH',
      'Strategic target and floor scopes differ.'
    );
  }

  if (!sameOfferSegmentScenario) {
    addBlock(
      'offer_segment_scenario_mismatch',
      'TARGET_FLOOR_CONTEXT_MISMATCH',
      'Target and floor offer/segment/scenario dimensions differ.'
    );
  }

  const dimensionsComparable =
    sameCurrency &&
    sameUnit &&
    sameScope &&
    sameOfferSegmentScenario;

  const floorIsFinal =
    raw.floor_context.floor_eligibility_status ===
    'eligible_final';

  if (!floorIsFinal) {
    addBlock(
      'floor_not_final',
      'FLOOR_NOT_FINAL',
      'Target policy cannot establish sustainability because the floor is not eligible_final.'
    );
  }

  let relationToFloor = 'not_comparable';
  let requiredSupportGap = null;
  let subsidyRequired = false;

  if (
    dimensionsComparable &&
    floorIsFinal
  ) {
    if (
      raw.strategic_target.value >
      raw.floor_context.value
    ) {
      relationToFloor = 'above';
    } else if (
      raw.strategic_target.value ===
      raw.floor_context.value
    ) {
      relationToFloor = 'equal';
    } else {
      relationToFloor = 'below';
      subsidyRequired = true;
      requiredSupportGap =
        raw.floor_context.value -
        raw.strategic_target.value;
    }
  }

  if (relationToFloor === 'below') {
    const policyPermitsBelowFloor =
      (
        raw.strategic_target.pricing_policy ===
        'subsidized'
      ) ||
      (
        raw.strategic_target.pricing_policy ===
        'cross_subsidized'
      ) ||
      (
        raw.strategic_target.pricing_policy ===
        'custom_documented'
      );

    const supportMatches =
      targetPolicySupportMatches(
        raw.strategic_target.pricing_policy,
        raw.support_policy
      );

    const supportReady =
      targetSupportIsReady(
        raw.support_policy
      );

    if (
      !policyPermitsBelowFloor ||
      !raw.support_policy ||
      !supportMatches ||
      raw.support_policy.status === 'rejected'
    ) {
      addBlock(
        'below_floor_without_support',
        'BELOW_FLOOR_WITHOUT_VALID_SUPPORT',
        'Below-floor strategic target lacks a valid matching support policy.'
      );
    } else if (
      raw.support_policy.status === 'unresolved'
    ) {
      addBlock(
        'manual_review_required',
        'BELOW_FLOOR_SUPPORT_UNRESOLVED',
        'Below-floor support policy remains unresolved.'
      );
    } else if (!supportReady) {
      addBlock(
        'below_floor_without_support',
        'BELOW_FLOOR_SUPPORT_NOT_READY',
        'Below-floor support policy is not ready.'
      );
    }
  }

  /*
   * Support declarations above/equal floor do not change
   * mathematical floor relation and are not required merely
   * because a pricing policy happens to be named subsidized.
   */
  let primaryStatus = null;

  for (
    const candidateStatus of
    R5_TARGET_POLICY_STATUS_PRECEDENCE
  ) {
    if (
      blockers.some(
        (item) =>
          item.status === candidateStatus
      )
    ) {
      primaryStatus = candidateStatus;
      break;
    }
  }

  if (primaryStatus !== null) {
    return {
      target_policy_id:
        raw.target_policy_id,

      status: primaryStatus,

      target_value:
        raw.strategic_target.value,

      floor_value:
        raw.floor_context.value,

      relation_to_floor:
        relationToFloor,

      subsidy_required:
        subsidyRequired,

      required_support_gap:
        requiredSupportGap,

      ready_for_final_target_policy:
        false,

      blocking_reasons:
        blockers,

      diagnostics,

      floor_basis_ref:
        raw.floor_context.floor_basis_ref,

      configuration_ref:
        raw.configuration_ref ?? null,

      technical_change_ref:
        raw.technical_change_ref ?? null,

      evidence_refs: [
        ...raw.strategic_target.evidence_refs,
        ...raw.floor_context.evidence_refs,
        ...(
          raw.support_policy
            ? raw.support_policy.evidence_refs
            : []
        )
      ],

      market_context_refs: [
        ...raw.market_context_refs
      ]
    };
  }

  if (relationToFloor === 'below') {
    diagnostics.push({
      severity: 'info',
      code:
        'READY_BELOW_FLOOR_WITH_SUPPORT',
      message:
        'Below-floor strategic target has an explicit matching support policy.'
    });

    return {
      target_policy_id:
        raw.target_policy_id,

      status:
        'ready_below_floor_with_support',

      target_value:
        raw.strategic_target.value,

      floor_value:
        raw.floor_context.value,

      relation_to_floor:
        'below',

      subsidy_required:
        true,

      required_support_gap:
        requiredSupportGap,

      ready_for_final_target_policy:
        true,

      blocking_reasons: [],
      diagnostics,

      floor_basis_ref:
        raw.floor_context.floor_basis_ref,

      configuration_ref:
        raw.configuration_ref ?? null,

      technical_change_ref:
        raw.technical_change_ref ?? null,

      evidence_refs: [
        ...raw.strategic_target.evidence_refs,
        ...raw.floor_context.evidence_refs,
        ...raw.support_policy.evidence_refs
      ],

      market_context_refs: [
        ...raw.market_context_refs
      ]
    };
  }

  diagnostics.push({
    severity: 'info',
    code:
      'READY_AT_OR_ABOVE_FLOOR',
    message:
      'Strategic target is comparable with a final floor and is at or above that floor.'
  });

  return {
    target_policy_id:
      raw.target_policy_id,

    status:
      'ready_at_or_above_floor',

    target_value:
      raw.strategic_target.value,

    floor_value:
      raw.floor_context.value,

    relation_to_floor:
      relationToFloor,

    subsidy_required:
      false,

    required_support_gap:
      null,

    ready_for_final_target_policy:
      true,

    blocking_reasons: [],
    diagnostics,

    floor_basis_ref:
      raw.floor_context.floor_basis_ref,

    configuration_ref:
      raw.configuration_ref ?? null,

    technical_change_ref:
      raw.technical_change_ref ?? null,

    evidence_refs: [
      ...raw.strategic_target.evidence_refs,
      ...raw.floor_context.evidence_refs,
      ...(
        raw.support_policy
          ? raw.support_policy.evidence_refs
          : []
      )
    ],

    market_context_refs: [
      ...raw.market_context_refs
    ]
  };
}

/* R5 B3.3 STRATEGIC TARGET POLICY — END */

/* R5 B3.4 AFFORDABILITY EVIDENCE — BEGIN
 *
 * Establishes the maturity/readiness of affordability evidence
 * for one explicitly declared offer/segment/scenario/scope.
 *
 * This block DOES NOT:
 * - validate willingness-to-pay;
 * - validate demand;
 * - compare the strategic target with the ceiling;
 * - compare the economic floor with the ceiling;
 * - calculate the final B3.5 corridor;
 * - perform FX or unit conversion;
 * - load real market/customer data;
 * - mutate an official target or ceiling;
 * - synchronize TechRoom automatically;
 * - expose browser/client arithmetic.
 */

const R5_B3_4_STATUS = new Set([
  'ceiling_unavailable',
  'ceiling_preliminary',
  'ceiling_to_validate',
  'ceiling_observed',
  'ceiling_validated_for_declared_scope',
  'invalid_affordability_evidence',
  'scope_or_dimension_mismatch',
  'manual_review_required'
]);

const R5_B3_4_STATUS_PRECEDENCE = Object.freeze([
  'invalid_affordability_evidence',
  'scope_or_dimension_mismatch',
  'manual_review_required',
  'ceiling_unavailable',
  'ceiling_preliminary',
  'ceiling_to_validate',
  'ceiling_observed',
  'ceiling_validated_for_declared_scope'
]);

const R5_B3_4_ENUMS = Object.freeze({
  affordability_status:
    Object.freeze([...R5_B3_4_STATUS]),

  status_precedence:
    R5_B3_4_STATUS_PRECEDENCE
});

function validateAffordabilityEvidenceResultStatus(
  value,
  path = 'affordability_status'
) {
  return validateB3EnumValue(
    value,
    R5_B3_4_STATUS,
    path
  );
}

function validateB34StringRefs(
  raw,
  path
) {
  validateArray(raw, path);

  raw.forEach((value, index) => {
    nonEmptyString(
      value,
      path + '[' + index + ']',
      500
    );
  });

  return raw;
}

function validateB34NullableString(
  value,
  path,
  max = 500
) {
  if (
    value !== null &&
    value !== undefined
  ) {
    nonEmptyString(
      value,
      path,
      max
    );
  }

  return value;
}

function validateAffordabilityEvidenceInput(
  raw,
  path = 'affordability_evidence_input'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.affordability_basis_id,
    path + '.affordability_basis_id',
    500
  );

  validateR5OfferId(
    raw.offer_id,
    path + '.offer_id'
  );

  nonEmptyString(
    raw.segment_id,
    path + '.segment_id',
    500
  );

  validateB3Scenario(
    raw.scenario_id,
    path + '.scenario_id'
  );

  nonEmptyString(
    raw.currency,
    path + '.currency',
    16
  );

  nonEmptyString(
    raw.unit,
    path + '.unit',
    200
  );

  nonEmptyString(
    raw.scope_ref,
    path + '.scope_ref',
    500
  );

  nonEmptyString(
    raw.effective_date,
    path + '.effective_date',
    64
  );

  validateB34NullableString(
    raw.geography_ref,
    path + '.geography_ref'
  );

  /*
   * Reuse B3.1 affordability authority exactly.
   *
   * This preserves:
   * - unavailable != 0 / infinity;
   * - B3.1 source eligibility;
   * - nonnegative available values;
   * - competitor_reference cannot be validated;
   * - validated evidence needs evidence_refs;
   * - nested/shadow currency rejection.
   */
  validateAffordabilityCeiling(
    raw.affordability_ceiling,
    path + '.affordability_ceiling'
  );

  validateB34StringRefs(
    raw.market_context_refs,
    path + '.market_context_refs'
  );

  validateB34NullableString(
    raw.methodology_ref,
    path + '.methodology_ref'
  );

  validateB34NullableString(
    raw.validation_protocol_ref,
    path + '.validation_protocol_ref'
  );

  validateB34NullableString(
    raw.configuration_ref,
    path + '.configuration_ref'
  );

  validateB34NullableString(
    raw.technical_change_ref,
    path + '.technical_change_ref'
  );

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

function mapAffordabilityEvidenceStatus(
  evidenceStatus
) {
  switch (evidenceStatus) {
    case 'unavailable':
      return 'ceiling_unavailable';

    case 'preliminary_estimate':
      return 'ceiling_preliminary';

    case 'to_validate':
      return 'ceiling_to_validate';

    case 'observed':
      return 'ceiling_observed';

    case 'validated_for_declared_scope':
      return 'ceiling_validated_for_declared_scope';

    default:
      fail(
        'affordability_evidence_input.' +
        'affordability_ceiling.evidence_status'
      );
  }
}

function evaluateAffordabilityEvidence(
  raw,
  path = 'affordability_evidence_input'
) {
  validateAffordabilityEvidenceInput(
    raw,
    path
  );

  const ceiling =
    raw.affordability_ceiling;

  const diagnostics = [];
  const blockingReasons = [];

  /*
   * B3.1 validates the evidence object itself.
   * B3.4 adds governance/readiness requirements.
   *
   * A declared "validated_for_declared_scope" ceiling
   * without a validation protocol must not be silently
   * presented as B3.4-final.
   */
  if (
    ceiling.evidence_status ===
      'validated_for_declared_scope' &&
    (
      raw.validation_protocol_ref === null ||
      raw.validation_protocol_ref === undefined
    )
  ) {
    blockingReasons.push({
      status: 'manual_review_required',
      code:
        'VALIDATED_AFFORDABILITY_PROTOCOL_MISSING'
    });

    diagnostics.push({
      severity: 'blocking',
      code:
        'VALIDATED_AFFORDABILITY_PROTOCOL_MISSING',
      message:
        'Validated affordability requires a declared validation protocol for B3.4 final readiness.'
    });

    return {
      affordability_basis_id:
        raw.affordability_basis_id,

      status:
        'manual_review_required',

      ceiling_available:
        true,

      ceiling_value:
        ceiling.value,

      evidence_status:
        ceiling.evidence_status,

      ready_for_corridor_use:
        false,

      blocking_reasons:
        blockingReasons,

      diagnostics,

      offer_id:
        raw.offer_id,

      segment_id:
        raw.segment_id,

      scenario_id:
        raw.scenario_id,

      currency:
        raw.currency,

      unit:
        raw.unit,

      scope_ref:
        raw.scope_ref,

      effective_date:
        raw.effective_date,

      geography_ref:
        raw.geography_ref ?? null,

      methodology_ref:
        raw.methodology_ref ?? null,

      validation_protocol_ref:
        raw.validation_protocol_ref ?? null,

      configuration_ref:
        raw.configuration_ref ?? null,

      technical_change_ref:
        raw.technical_change_ref ?? null,

      evidence_refs: [
        ...ceiling.evidence_refs
      ],

      market_context_refs: [
        ...raw.market_context_refs
      ]
    };
  }

  const status =
    mapAffordabilityEvidenceStatus(
      ceiling.evidence_status
    );

  const available =
    ceiling.evidence_status !==
    'unavailable';

  /*
   * "ready_for_corridor_use" means the ceiling can be
   * represented downstream with its exact maturity.
   * It does not mean validated demand or WTP.
   */
  const readyForCorridorUse =
    available;

  diagnostics.push({
    severity: 'info',
    code:
      status.toUpperCase(),
    message:
      available
        ? 'Affordability evidence is available at its declared maturity.'
        : 'Affordability evidence is explicitly unavailable.'
  });

  return {
    affordability_basis_id:
      raw.affordability_basis_id,

    status,

    ceiling_available:
      available,

    ceiling_value:
      available
        ? ceiling.value
        : null,

    evidence_status:
      ceiling.evidence_status,

    ready_for_corridor_use:
      readyForCorridorUse,

    blocking_reasons: [],
    diagnostics,

    offer_id:
      raw.offer_id,

    segment_id:
      raw.segment_id,

    scenario_id:
      raw.scenario_id,

    currency:
      raw.currency,

    unit:
      raw.unit,

    scope_ref:
      raw.scope_ref,

    effective_date:
      raw.effective_date,

    geography_ref:
      raw.geography_ref ?? null,

    methodology_ref:
      raw.methodology_ref ?? null,

    validation_protocol_ref:
      raw.validation_protocol_ref ?? null,

    configuration_ref:
      raw.configuration_ref ?? null,

    technical_change_ref:
      raw.technical_change_ref ?? null,

    evidence_refs: [
      ...ceiling.evidence_refs
    ],

    market_context_refs: [
      ...raw.market_context_refs
    ]
  };
}

/* R5 B3.4 AFFORDABILITY EVIDENCE — END */






/* R5 B3.5 FINAL ECONOMIC CORRIDOR — BEGIN */

/*
 * B3.5 composes already-evaluated B3.2/B3.3/B3.4 results.
 *
 * It does not calculate underlying costs, create a target,
 * create affordability evidence, mutate upstream authorities,
 * or perform implicit monetary/dimensional equivalence.
 */

const R5_B3_5_STATUS_PRECEDENCE = Object.freeze([
  'conflicting_evidence',
  'manual_review_required',
  'incomplete_cost_basis',
  'no_affordability_evidence',
  'below_economic_floor',
  'above_affordability_ceiling',
  'valid_corridor'
]);

const R5_B3_5_SUPPORT_TYPE_MAP = Object.freeze({
  subsidy:
    'subsidized',

  cross_subsidy:
    'cross_subsidized',

  custom_documented_support:
    'custom_documented'
});

const R5_B3_5_ENUMS = Object.freeze({
  final_corridor_status:
    Object.freeze([
      'valid_corridor',
      'below_economic_floor',
      'above_affordability_ceiling',
      'no_affordability_evidence',
      'incomplete_cost_basis',
      'conflicting_evidence',
      'manual_review_required'
    ]),

  support_type_mapping:
    R5_B3_5_SUPPORT_TYPE_MAP,

  status_precedence:
    R5_B3_5_STATUS_PRECEDENCE
});

function validateFinalEconomicCorridorStatus(
  value,
  path = 'final_economic_corridor_status'
) {
  validateEconomicCorridorStatus(
    value,
    path
  );

  return value;
}

function validateB35Refs(
  raw,
  path
) {
  validateArray(raw, path);

  raw.forEach((value, index) => {
    nonEmptyString(
      value,
      path + '[' + index + ']',
      500
    );
  });

  return raw;
}

function validateB35NullableString(
  value,
  path
) {
  if (
    value !== null &&
    value !== undefined
  ) {
    nonEmptyString(
      value,
      path,
      500
    );
  }

  return value;
}

function validateB35NonNegativeNumber(
  value,
  path
) {
  finiteNumber(value, path);

  if (value < 0) {
    fail(path);
  }

  return value;
}

function validateB35FloorResult(
  raw,
  path
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.floor_basis_id,
    path + '.floor_basis_id',
    500
  );

  validateEconomicFloorCostLevel(
    raw.requested_cost_level,
    path + '.requested_cost_level'
  );

  validateFloorEligibilityStatus(
    raw.eligibility_status,
    path + '.eligibility_status'
  );

  validateBoolean(
    raw.eligible_for_final_floor,
    path + '.eligible_for_final_floor'
  );

  validateBoolean(
    raw.eligible_as_lower_bound,
    path + '.eligible_as_lower_bound'
  );

  validateArray(
    raw.blocking_reasons,
    path + '.blocking_reasons'
  );

  validateArray(
    raw.diagnostics,
    path + '.diagnostics'
  );

  nonEmptyString(
    raw.cost_basis_ref,
    path + '.cost_basis_ref',
    500
  );

  validateB35NullableString(
    raw.configuration_ref,
    path + '.configuration_ref'
  );

  validateB35NullableString(
    raw.technical_change_ref,
    path + '.technical_change_ref'
  );

  validateB35Refs(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  return raw;
}

function validateB35TargetPolicyResult(
  raw,
  path
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.target_policy_id,
    path + '.target_policy_id',
    500
  );

  validateTargetPolicyStatus(
    raw.status,
    path + '.status'
  );

  validateB35NonNegativeNumber(
    raw.target_value,
    path + '.target_value'
  );

  validateB35NonNegativeNumber(
    raw.floor_value,
    path + '.floor_value'
  );

  validateTargetRelationToFloor(
    raw.relation_to_floor,
    path + '.relation_to_floor'
  );

  validateBoolean(
    raw.subsidy_required,
    path + '.subsidy_required'
  );

  if (raw.required_support_gap !== null) {
    validateB35NonNegativeNumber(
      raw.required_support_gap,
      path + '.required_support_gap'
    );
  }

  validateBoolean(
    raw.ready_for_final_target_policy,
    path + '.ready_for_final_target_policy'
  );

  validateArray(
    raw.blocking_reasons,
    path + '.blocking_reasons'
  );

  validateArray(
    raw.diagnostics,
    path + '.diagnostics'
  );

  nonEmptyString(
    raw.floor_basis_ref,
    path + '.floor_basis_ref',
    500
  );

  validateB35NullableString(
    raw.configuration_ref,
    path + '.configuration_ref'
  );

  validateB35NullableString(
    raw.technical_change_ref,
    path + '.technical_change_ref'
  );

  validateB35Refs(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  validateB35Refs(
    raw.market_context_refs,
    path + '.market_context_refs'
  );

  return raw;
}

function validateB35AffordabilityResult(
  raw,
  path
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.affordability_basis_id,
    path + '.affordability_basis_id',
    500
  );

  validateAffordabilityEvidenceResultStatus(
    raw.status,
    path + '.status'
  );

  validateBoolean(
    raw.ceiling_available,
    path + '.ceiling_available'
  );

  if (raw.ceiling_available) {
    validateB35NonNegativeNumber(
      raw.ceiling_value,
      path + '.ceiling_value'
    );
  } else if (raw.ceiling_value !== null) {
    fail(path + '.ceiling_value');
  }

  validateAffordabilityEvidenceStatus(
    raw.evidence_status,
    path + '.evidence_status'
  );

  validateBoolean(
    raw.ready_for_corridor_use,
    path + '.ready_for_corridor_use'
  );

  validateArray(
    raw.blocking_reasons,
    path + '.blocking_reasons'
  );

  validateArray(
    raw.diagnostics,
    path + '.diagnostics'
  );

  validateR5OfferId(
    raw.offer_id,
    path + '.offer_id'
  );

  nonEmptyString(
    raw.segment_id,
    path + '.segment_id',
    500
  );

  validateB3Scenario(
    raw.scenario_id,
    path + '.scenario_id'
  );

  nonEmptyString(
    raw.currency,
    path + '.currency',
    16
  );

  nonEmptyString(
    raw.unit,
    path + '.unit',
    500
  );

  nonEmptyString(
    raw.scope_ref,
    path + '.scope_ref',
    500
  );

  nonEmptyString(
    raw.effective_date,
    path + '.effective_date',
    64
  );

  validateB35NullableString(
    raw.configuration_ref,
    path + '.configuration_ref'
  );

  validateB35NullableString(
    raw.technical_change_ref,
    path + '.technical_change_ref'
  );

  validateB35Refs(
    raw.evidence_refs,
    path + '.evidence_refs'
  );

  validateB35Refs(
    raw.market_context_refs,
    path + '.market_context_refs'
  );

  return raw;
}

function validateFinalEconomicCorridorInput(
  raw,
  path = 'final_economic_corridor_input'
) {
  validatePlainObject(raw, path);

  nonEmptyString(
    raw.corridor_assessment_id,
    path + '.corridor_assessment_id',
    500
  );

  nonEmptyString(
    raw.floor_basis_id,
    path + '.floor_basis_id',
    500
  );

  nonEmptyString(
    raw.target_policy_id,
    path + '.target_policy_id',
    500
  );

  nonEmptyString(
    raw.affordability_basis_id,
    path + '.affordability_basis_id',
    500
  );

  validateR5OfferId(
    raw.offer_id,
    path + '.offer_id'
  );

  nonEmptyString(
    raw.segment_id,
    path + '.segment_id',
    500
  );

  validateB3Scenario(
    raw.scenario_id,
    path + '.scenario_id'
  );

  nonEmptyString(
    raw.currency,
    path + '.currency',
    16
  );

  nonEmptyString(
    raw.unit,
    path + '.unit',
    500
  );

  nonEmptyString(
    raw.scope_ref,
    path + '.scope_ref',
    500
  );

  nonEmptyString(
    raw.effective_date,
    path + '.effective_date',
    64
  );

  validateB35FloorResult(
    raw.floor_result,
    path + '.floor_result'
  );

  validateB35TargetPolicyResult(
    raw.target_policy_result,
    path + '.target_policy_result'
  );

  validateB35AffordabilityResult(
    raw.affordability_result,
    path + '.affordability_result'
  );

  if (
    raw.support_policy !== null &&
    raw.support_policy !== undefined
  ) {
    validateTargetSupportPolicy(
      raw.support_policy,
      path + '.support_policy'
    );
  }

  validateOptionalString(
    raw.notes,
    path + '.notes'
  );

  return raw;
}

function adaptTargetSupportToSubsidyPolicy(
  raw,
  path = 'support_policy'
) {
  if (
    raw === null ||
    raw === undefined
  ) {
    return {
      status:
        'not_present',

      source_support_policy:
        null,

      subsidy_policy:
        null
    };
  }

  validateTargetSupportPolicy(
    raw,
    path
  );

  const sourceSupportPolicy = {
    status:
      raw.status,

    type:
      raw.type,

    amount_or_rule:
      raw.amount_or_rule,

    source_ref:
      raw.source_ref ?? null,

    evidence_refs: [
      ...raw.evidence_refs
    ]
  };

  /*
   * Only support that is currently eligible to support a
   * below-floor target is adapted into the B3.1 vocabulary.
   *
   * Unresolved/rejected declarations remain preserved but are
   * not silently upgraded.
   */
  if (
    raw.status !== 'identified' &&
    raw.status !== 'approved'
  ) {
    return {
      status:
        raw.status === 'unresolved'
          ? 'not_ready'
          : 'not_applicable',

      source_support_policy:
        sourceSupportPolicy,

      subsidy_policy:
        null
    };
  }

  const mappedType =
    R5_B3_5_SUPPORT_TYPE_MAP[
      raw.type
    ];

  if (!mappedType) {
    fail(path + '.type');
  }

  const subsidyPolicy = {
    status:
      raw.status,

    type:
      mappedType,

    amount_or_rule:
      raw.amount_or_rule,

    source_ref:
      raw.source_ref
  };

  /*
   * This validator proves lexical/structural compatibility.
   * No subsidy amount is derived here.
   */
  validateSubsidyPolicy(
    subsidyPolicy,
    path + '.adapted_subsidy_policy'
  );

  return {
    status:
      'adapted',

    source_support_policy:
      sourceSupportPolicy,

    subsidy_policy:
      subsidyPolicy
  };
}

function uniqueB35Refs(
  ...groups
) {
  return [
    ...new Set(
      groups.flat()
    )
  ];
}

function b35HasStatus(
  raw,
  status
) {
  if (
    raw.status === status ||
    raw.eligibility_status === status
  ) {
    return true;
  }

  if (!Array.isArray(raw.blocking_reasons)) {
    return false;
  }

  return raw.blocking_reasons.some(
    item =>
      item &&
      (
        item.status === status ||
        item.code === status
      )
  );
}

function evaluateFinalEconomicCorridor(
  raw,
  path = 'final_economic_corridor_input'
) {
  validateFinalEconomicCorridorInput(
    raw,
    path
  );

  const floor =
    raw.floor_result;

  const target =
    raw.target_policy_result;

  const affordability =
    raw.affordability_result;

  const support =
    adaptTargetSupportToSubsidyPolicy(
      raw.support_policy,
      path + '.support_policy'
    );

  const diagnostics = [];
  const blockingReasons = [];

  const addBlocking = (
    status,
    code,
    message
  ) => {
    blockingReasons.push({
      status,
      code
    });

    diagnostics.push({
      severity:
        'blocking',
      code,
      message
    });
  };

  const addInfo = (
    code,
    message
  ) => {
    diagnostics.push({
      severity:
        'info',
      code,
      message
    });
  };

  /*
   * Identity links bind the three upstream evaluated artifacts
   * to this explicit comparison envelope.
   */
  const integrationIssues = [];

  if (
    floor.floor_basis_id !==
    raw.floor_basis_id
  ) {
    integrationIssues.push({
      code:
        'FLOOR_BASIS_ID_MISMATCH',
      message:
        'Floor result identity does not match the declared final-corridor floor basis.'
    });
  }

  if (
    target.floor_basis_ref !==
    raw.floor_basis_id
  ) {
    integrationIssues.push({
      code:
        'TARGET_FLOOR_BASIS_REF_MISMATCH',
      message:
        'Target-policy result does not reference the declared floor basis.'
    });
  }

  if (
    target.target_policy_id !==
    raw.target_policy_id
  ) {
    integrationIssues.push({
      code:
        'TARGET_POLICY_ID_MISMATCH',
      message:
        'Target-policy result identity does not match the declared target policy.'
    });
  }

  if (
    affordability.affordability_basis_id !==
    raw.affordability_basis_id
  ) {
    integrationIssues.push({
      code:
        'AFFORDABILITY_BASIS_ID_MISMATCH',
      message:
        'Affordability result identity does not match the declared affordability basis.'
    });
  }

  const dimensionChecks = [
    [
      'offer_id',
      raw.offer_id,
      affordability.offer_id,
      'OFFER_MISMATCH'
    ],
    [
      'segment_id',
      raw.segment_id,
      affordability.segment_id,
      'SEGMENT_MISMATCH'
    ],
    [
      'scenario_id',
      raw.scenario_id,
      affordability.scenario_id,
      'SCENARIO_MISMATCH'
    ],
    [
      'currency',
      raw.currency,
      affordability.currency,
      'CURRENCY_MISMATCH'
    ],
    [
      'unit',
      raw.unit,
      affordability.unit,
      'UNIT_MISMATCH'
    ],
    [
      'scope_ref',
      raw.scope_ref,
      affordability.scope_ref,
      'SCOPE_MISMATCH'
    ],
    [
      'effective_date',
      raw.effective_date,
      affordability.effective_date,
      'EFFECTIVE_DATE_MISMATCH'
    ]
  ];

  for (
    const [
      dimension,
      expected,
      actual,
      code
    ] of dimensionChecks
  ) {
    if (expected !== actual) {
      integrationIssues.push({
        code,
        message:
          'Final-corridor ' +
          dimension +
          ' is not exactly compatible with affordability evidence.'
      });
    }
  }

  const targetDimensionStatuses =
    new Set([
      'currency_mismatch',
      'unit_mismatch',
      'scope_mismatch',
      'offer_segment_scenario_mismatch'
    ]);

  if (
    targetDimensionStatuses.has(
      target.status
    )
  ) {
    integrationIssues.push({
      code:
        'TARGET_POLICY_DIMENSION_MISMATCH',
      message:
        'Target-policy result reports an upstream dimensional/context mismatch.'
    });
  }

  const floorDimensionStatuses =
    new Set([
      'currency_mismatch',
      'unit_mismatch',
      'scope_mismatch',
      'effective_date_missing'
    ]);

  if (
    floorDimensionStatuses.has(
      floor.eligibility_status
    )
  ) {
    integrationIssues.push({
      code:
        'FLOOR_DIMENSION_MISMATCH',
      message:
        'Floor result reports an upstream dimensional/date mismatch.'
    });
  }

  if (
    affordability.status ===
    'scope_or_dimension_mismatch'
  ) {
    integrationIssues.push({
      code:
        'AFFORDABILITY_DIMENSION_MISMATCH',
      message:
        'Affordability result reports an upstream scope or dimension mismatch.'
    });
  }

  /*
   * Precedence 1 — conflicting evidence.
   */
  const upstreamConflict =
    b35HasStatus(
      floor,
      'conflicting_evidence'
    ) ||
    b35HasStatus(
      target,
      'conflicting_evidence'
    ) ||
    b35HasStatus(
      affordability,
      'conflicting_evidence'
    );

  let status = null;

  if (upstreamConflict) {
    status =
      'conflicting_evidence';

    addBlocking(
      status,
      'UPSTREAM_CONFLICTING_EVIDENCE',
      'At least one upstream evaluated authority reports conflicting evidence.'
    );
  }

  /*
   * Precedence 2 — identity or dimension incompatibility.
   */
  if (
    status === null &&
    integrationIssues.length > 0
  ) {
    status =
      'manual_review_required';

    for (const issue of integrationIssues) {
      addBlocking(
        status,
        issue.code,
        issue.message
      );
    }
  }

  /*
   * Precedence 3 — non-final economic floor.
   */
  if (
    status === null &&
    (
      floor.eligibility_status !==
        'eligible_final' ||
      floor.eligible_for_final_floor !==
        true ||
      target.status ===
        'floor_not_final'
    )
  ) {
    status =
      'incomplete_cost_basis';

    addBlocking(
      status,
      'FINAL_FLOOR_NOT_ELIGIBLE',
      'A final economic floor has not been established by the B3.2 authority.'
    );
  }

  /*
   * Precedence 4 — upstream/manual integration states.
   *
   * below_floor_without_support is intentionally not promoted
   * to manual review: the final mathematical classification
   * remains below_economic_floor.
   */
  const targetManualStatuses =
    new Set([
      'invalid_target_evidence',
      'manual_review_required'
    ]);

  const affordabilityManualStatuses =
    new Set([
      'invalid_affordability_evidence',
      'manual_review_required'
    ]);

  const supportNeedsReview =
    support.status ===
    'not_ready';

  const targetNeedsReview =
    targetManualStatuses.has(
      target.status
    ) ||
    (
      target.ready_for_final_target_policy !== true &&
      target.status !==
        'below_floor_without_support'
    );

  const affordabilityNeedsReview =
    affordabilityManualStatuses.has(
      affordability.status
    ) ||
    (
      affordability.ceiling_available === true &&
      affordability.ready_for_corridor_use !== true
    );

  if (
    status === null &&
    (
      supportNeedsReview ||
      targetNeedsReview ||
      affordabilityNeedsReview
    )
  ) {
    status =
      'manual_review_required';

    if (supportNeedsReview) {
      addBlocking(
        status,
        'SUPPORT_POLICY_NOT_READY',
        'Support policy remains unresolved and cannot be upgraded by B3.5.'
      );
    }

    if (targetNeedsReview) {
      addBlocking(
        status,
        'TARGET_POLICY_NOT_FINAL_READY',
        'Strategic-target policy requires upstream review.'
      );
    }

    if (affordabilityNeedsReview) {
      addBlocking(
        status,
        'AFFORDABILITY_NOT_FINAL_COMPARABLE',
        'Affordability evidence requires upstream review before final comparison.'
      );
    }
  }

  const floorValue =
    target.floor_value;

  const targetValue =
    target.target_value;

  const ceilingAvailable =
    affordability.ceiling_available ===
    true;

  const ceilingUsable =
    ceilingAvailable &&
    affordability.ready_for_corridor_use ===
      true;

  const ceilingValue =
    ceilingAvailable
      ? affordability.ceiling_value
      : null;

  /*
   * Precedence 5 — contradictory independently asserted bounds.
   */
  if (
    status === null &&
    ceilingUsable &&
    floorValue > ceilingValue
  ) {
    status =
      'conflicting_evidence';

    addBlocking(
      status,
      'FINAL_FLOOR_ABOVE_AFFORDABILITY_CEILING',
      'The final economic floor exceeds the usable affordability ceiling for the same declared comparison dimensions.'
    );
  }

  /*
   * Precedence 6 — no affordability evidence.
   */
  if (
    status === null &&
    (
      affordability.status ===
        'ceiling_unavailable' ||
      ceilingAvailable === false
    )
  ) {
    status =
      'no_affordability_evidence';

    addInfo(
      'NO_AFFORDABILITY_EVIDENCE',
      'No affordability ceiling is available; absence is not interpreted as an unbounded ceiling.'
    );
  }

  /*
   * Precedence 7 — below floor.
   *
   * Explicit support is preserved but does not change the
   * mathematical corridor status.
   */
  if (
    status === null &&
    targetValue < floorValue
  ) {
    status =
      'below_economic_floor';

    addInfo(
      'BELOW_ECONOMIC_FLOOR',
      'Strategic target is below the final economic floor.'
    );
  }

  /*
   * Precedence 8 — above usable affordability ceiling.
   */
  if (
    status === null &&
    ceilingUsable &&
    targetValue > ceilingValue
  ) {
    status =
      'above_affordability_ceiling';

    addInfo(
      'ABOVE_AFFORDABILITY_CEILING',
      'Strategic target exceeds the usable affordability ceiling.'
    );
  }

  /*
   * Precedence 9 — valid mathematical corridor.
   */
  if (status === null) {
    status =
      'valid_corridor';

    addInfo(
      'VALID_CORRIDOR',
      'Strategic target lies within the declared comparable economic corridor.'
    );
  }

  validateFinalEconomicCorridorStatus(
    status,
    path + '.result.status'
  );

  const floorGap =
    targetValue - floorValue;

  const affordabilityHeadroom =
    ceilingAvailable
      ? ceilingValue - targetValue
      : null;

  const evidenceByAuthority = {
    floor: [
      ...floor.evidence_refs
    ],

    target_policy: [
      ...target.evidence_refs
    ],

    support_policy:
      raw.support_policy
        ? [
            ...raw.support_policy.evidence_refs
          ]
        : [],

    affordability: [
      ...affordability.evidence_refs
    ]
  };

  const marketContextByAuthority = {
    target_policy: [
      ...target.market_context_refs
    ],

    affordability: [
      ...affordability.market_context_refs
    ]
  };

  return {
    corridor_assessment_id:
      raw.corridor_assessment_id,

    status,

    economic_floor: {
      value:
        floorValue,

      floor_basis_id:
        raw.floor_basis_id,

      requested_cost_level:
        floor.requested_cost_level,

      eligibility_status:
        floor.eligibility_status
    },

    strategic_target: {
      value:
        targetValue,

      target_policy_id:
        raw.target_policy_id,

      target_policy_status:
        target.status,

      relation_to_floor:
        target.relation_to_floor
    },

    affordability_ceiling: {
      value:
        ceilingValue,

      available:
        ceilingAvailable,

      usable:
        ceilingUsable,

      affordability_basis_id:
        raw.affordability_basis_id,

      status:
        affordability.status,

      evidence_status:
        affordability.evidence_status
    },

    floor_gap:
      floorGap,

    affordability_headroom:
      affordabilityHeadroom,

    subsidy_required:
      targetValue < floorValue,

    required_support_gap:
      target.required_support_gap,

    support_context: {
      adaptation_status:
        support.status,

      source_support_policy:
        support.source_support_policy,

      subsidy_policy:
        support.subsidy_policy
    },

    comparison_dimensions: {
      offer_id:
        raw.offer_id,

      segment_id:
        raw.segment_id,

      scenario_id:
        raw.scenario_id,

      currency:
        raw.currency,

      unit:
        raw.unit,

      scope_ref:
        raw.scope_ref,

      effective_date:
        raw.effective_date
    },

    blocking_reasons:
      blockingReasons,

    diagnostics,

    evidence_by_authority:
      evidenceByAuthority,

    evidence_refs:
      uniqueB35Refs(
        evidenceByAuthority.floor,
        evidenceByAuthority.target_policy,
        evidenceByAuthority.support_policy,
        evidenceByAuthority.affordability
      ),

    market_context_by_authority:
      marketContextByAuthority,

    market_context_refs:
      uniqueB35Refs(
        marketContextByAuthority.target_policy,
        marketContextByAuthority.affordability
      ),

    configuration_refs: {
      floor:
        floor.configuration_ref ?? null,

      target_policy:
        target.configuration_ref ?? null,

      affordability:
        affordability.configuration_ref ?? null
    },

    technical_change_refs: {
      floor:
        floor.technical_change_ref ?? null,

      target_policy:
        target.technical_change_ref ?? null,

      affordability:
        affordability.technical_change_ref ?? null
    }
  };
}

/* R5 B3.5 FINAL ECONOMIC CORRIDOR — END */

/* R5 CONTRACT FOUNDATION — END */

module.exports = {
  R5_B3_5_ENUMS,
  validateFinalEconomicCorridorStatus,
  validateFinalEconomicCorridorInput,
  adaptTargetSupportToSubsidyPolicy,
  evaluateFinalEconomicCorridor,
  R5_B3_4_ENUMS,
  validateAffordabilityEvidenceResultStatus,
  validateAffordabilityEvidenceInput,
  evaluateAffordabilityEvidence,
  R5_B3_3_ENUMS,
  validateTargetPolicyStatus,
  validateTargetSupportType,
  validateTargetSupportStatus,
  validateTargetRelationToFloor,
  validateTargetPolicyStrategicTarget,
  validateTargetPolicyFloorContext,
  validateTargetSupportPolicy,
  validateTargetPolicyInput,
  evaluateTargetPolicy,
  R5_B3_2_ENUMS,
  validateFloorEligibilityStatus,
  validateFloorPurpose,
  validateFloorReconciliationStatus,
  validateFloorCoverageStatus,
  validateFloorAllocationStatus,
  validateFloorEligibilityInput,
  evaluateFloorEligibility,
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
  validateEconomicCorridorInput,
  R5_REFERENCE_COST_ENUMS,
  validateR5ReferenceTechnicalRefType,
  validateR5CostCoverageStatus,
  validateReferenceCostCoverage,
  validateReferenceTechnicalCostEvidence,
  referenceTechnicalCostIdentityKey,
  validateReferenceTechnicalCostEvidenceSet,
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
  validateCostAllocation,
  validateModel,
  loadModelFromEnvironment,
  computeScenario,
  findBreakEvenStudents,
  computeBreakEvenGraph,
  buildFinancialPresentation,
  validateSimulationOverrides,
  computeInteractiveSimulation,
  validateTrajectoryOptions,
  activeStudentsForTrajectoryMonth,
  validateProgressiveCostPlan,
  computeProgressiveOperatingCosts,
  computeFinancialTrajectory,
  validateSensitivityScenarios,
  trajectoryTotals,
  computeSensitivityAnalysis,
  validateAssumptionStatus,
  validateFieldObservation,
  validateFieldEvidenceSet,
  buildFieldCalibrationRevision,
  applyRevisionToSimulationOverrides
};
