import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAstronautHealth } from '../server/healthEngine.ts';
import { analyzeDiseaseRisks } from '../server/diseaseEngine.ts';
import { initDatabase } from '../server/db.ts';
import { getFullAstronautProfiles } from '../server/monitorEngine.ts';
import { analyzePredictiveHealth, buildDigitalTwinPayload } from '../server/predictiveEngine.ts';
import { screenPreMissionReport, submitPreMissionReport } from '../server/preMissionEngine.ts';
import type { HealthReading, PersonalBaseline } from '../src/types/astrocare.ts';

initDatabase();

const baseline: PersonalBaseline = {
  astronautId: 1,
  heartRateBpm: 64,
  systolicBp: 116,
  diastolicBp: 74,
  spo2Pct: 98.5,
  bodyTempC: 36.7,
  respiratoryRate: 14,
  sleepHours: 7.2,
  stressIndex: 24,
  moodScore: 84,
  activityMins: 95,
  boneMuscleIndex: 94,
  immuneScore: 92,
  radiationMsvDay: 0.42,
  cabinO2Pct: 20.9,
  cabinCo2Mmhg: 2.2,
  cabinTempC: 21.8,
  cabinHumidityPct: 44,
  cabinPressureKpa: 101.2,
};

const nominalReading: HealthReading = {
  ...baseline,
  recordedAt: new Date().toISOString(),
  source: 'SIMULATION',
  ecgRhythm: 'Normal Sinus Rhythm',
  ecgStMv: 0.02,
  isSimulated: true,
};

test('Nominal reading returns LEVEL 1 LOW RISK and NORMAL', () => {
  const res = evaluateAstronautHealth(nominalReading, baseline);
  assert.equal(res.status, 'NORMAL');
  assert.equal(res.severityLevel, 1);
  assert.equal(res.emergencyTriggered, false);
});

test('Mild sleep restriction triggers LEVEL 2 MODERATE RISK and CHANGING', () => {
  const res = evaluateAstronautHealth({ ...nominalReading, sleepHours: 5.5 }, baseline);
  assert.equal(res.status, 'CHANGING');
  assert.equal(res.severityLevel, 2);
  assert.equal(res.complementaryAllowed, true);
});

test('Critical hypoxia triggers LEVEL 4 CRITICAL EMERGENCY and suppresses complementary remedies', () => {
  const res = evaluateAstronautHealth({ ...nominalReading, spo2Pct: 88.5, heartRateBpm: 138 }, baseline);
  assert.equal(res.status, 'NEEDS ATTENTION');
  assert.equal(res.severityLevel, 4);
  assert.equal(res.emergencyTriggered, true);
  assert.equal(res.complementaryAllowed, false);
  assert.equal(res.earthMedicalSupportRequired, true);
});

test('Disease screening flags hypercapnia and contraindicates exercise', () => {
  const risks = analyzeDiseaseRisks({ ...nominalReading, cabinCo2Mmhg: 5.1, spo2Pct: 93.2 }, baseline);
  assert.ok(risks.some((r) => r.id === 'hypercapnia-hypoxia'));
  const hyper = risks.find((r) => r.id === 'hypercapnia-hypoxia')!;
  assert.equal(hyper.severity, 'HIGH');
  assert.ok(hyper.recoveryMeasures.contraindications.length > 0);
});

test('Predictive health engine & Digital Twin enforce non-diagnostic disclaimers and supporting evidence', () => {
  const crew = getFullAstronautProfiles()[0];
  assert.ok(crew, 'Seeded astronaut must exist');
  const stressedAstronaut = {
    ...crew,
    latestReading: {
      ...crew.latestReading,
      heartRateBpm: crew.baseline.heartRateBpm + 26,
      spo2Pct: 91.5,
      sleepHours: 4.5,
      stressIndex: 74,
    },
  };
  const pred = analyzePredictiveHealth(stressedAstronaut);
  assert.ok(pred.disclaimer.toLowerCase().includes('does not issue medical diagnoses'));
  assert.ok(pred.warnings.length >= 2);
  assert.ok(pred.warnings.some((w) => w.domain === 'Fatigue & Circadian'));
  assert.ok(pred.warnings.every((w) => w.supportingData.length > 0));

  const twin = buildDigitalTwinPayload(crew.id);
  assert.ok(twin, 'Digital twin payload must build for seeded astronaut');
  assert.ok(twin.provenanceNote.toLowerCase().includes('prototype'));
  assert.ok(twin.provenanceNote.toLowerCase().includes('not a clinically validated'));
});

test('Pre-mission medical screening enforces consent and flags out-of-envelope preflight findings', () => {
  const baseInput = {
    candidateName: 'Dr. Test Candidate',
    callSign: 'CAND-99',
    age: 34,
    bloodType: 'O+',
    targetMission: 'Artemis Analog',
    missionRole: 'Payload Specialist',
    missionDurationDays: 90,
    evaPlanned: true,
    restingHrBpm: 62,
    systolicBp: 118,
    diastolicBp: 76,
    spo2Pct: 98.5,
    ecgSummary: 'Normal Sinus Rhythm',
    exerciseClearance: 'CLEARED' as const,
    nearVisionDiopter: 0.0,
    vestibularEntStatus: 'CLEARED' as const,
    boneDensityZScore: 0.3,
    labPanelStatus: 'NOMINAL' as const,
    immunizationsCurrent: true,
    allergiesText: 'NKDA',
    medicationsText: 'None',
    medicalHistorySummary: 'All pre-flight labs nominal.',
    consentToStore: false,
    consentToShareFlightSurgeon: true,
  };

  assert.throws(() => submitPreMissionReport(baseInput), /permission/i);

  const nominal = screenPreMissionReport({ ...baseInput, consentToStore: true });
  assert.equal(nominal.screeningResult, 'NOMINAL_PREFLIGHT');
  assert.equal(nominal.screeningFlags.length, 0);

  const flagged = screenPreMissionReport({
    ...baseInput,
    consentToStore: true,
    systolicBp: 164,
    boneDensityZScore: -2.2,
    exerciseClearance: 'NOT_CLEARED',
  });
  assert.equal(flagged.screeningResult, 'HOLD_RECOMMENDED');
  assert.ok(flagged.screeningFlags.length >= 3);
});
