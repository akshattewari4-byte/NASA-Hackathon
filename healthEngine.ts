import type {
  BaselineComparisonRow,
  HealthAssessment,
  HealthReading,
  PersonalBaseline,
  SeverityLevel,
  SeverityLabel,
  ThreeStateStatus,
} from '../src/types/astrocare.ts';

function severityLabelFromLevel(level: SeverityLevel): SeverityLabel {
  switch (level) {
    case 4:
      return 'LEVEL 4 — CRITICAL / EMERGENCY';
    case 3:
      return 'LEVEL 3 — HIGH RISK';
    case 2:
      return 'LEVEL 2 — MODERATE RISK';
    default:
      return 'LEVEL 1 — LOW RISK';
  }
}

export function evaluateAstronautHealth(
  reading: HealthReading,
  baseline: PersonalBaseline,
  previousReading?: HealthReading
): HealthAssessment {
  const indicators: string[] = [];
  const actions: string[] = [];
  const comparisons: BaselineComparisonRow[] = [];

  let rawSeverityLevel = 1;
  let emergencyReason: string | undefined;

  const promote = (lvl: SeverityLevel) => {
    if (lvl > rawSeverityLevel) rawSeverityLevel = lvl;
  };

  const trendOf = (curr: number, prev: number | undefined, eps: number): 'STABLE' | 'RISING' | 'FALLING' => {
    if (prev === undefined) return 'STABLE';
    if (curr - prev > eps) return 'RISING';
    if (prev - curr > eps) return 'FALLING';
    return 'STABLE';
  };

  // 1. SpO2 (Critical if <= 90%, High if <= 93%, Moderate if drop >= 2% from baseline or < 95%)
  const spo2Delta = reading.spo2Pct - baseline.spo2Pct;
  let spo2Risk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  let spo2Act = 'Continue standard cabin O2 monitoring';
  if (reading.spo2Pct <= 90) {
    spo2Risk = 'CRITICAL';
    promote(4);
    emergencyReason = `Critical hypoxia detected: SpO2 dropped to ${reading.spo2Pct.toFixed(1)}% (personal baseline ${baseline.spo2Pct.toFixed(1)}%).`;
    indicators.push(`SpO2 ${reading.spo2Pct.toFixed(1)}% (Critical threshold <= 90%)`);
    spo2Act = 'Don supplemental O2 mask immediately & execute Emergency Medical Protocol';
    actions.push('Initiate supplemental oxygen immediately and check cabin O2 supply.');
  } else if (reading.spo2Pct <= 93 || spo2Delta <= -4) {
    spo2Risk = 'HIGH';
    promote(3);
    indicators.push(`SpO2 ${reading.spo2Pct.toFixed(1)}% (${spo2Delta.toFixed(1)}% below baseline)`);
    spo2Act = 'Rest, verify cabin O2/CO2 scrubber, contact Flight Surgeon';
    actions.push('Verify cabin oxygen partial pressure and halt strenuous activity.');
  } else if (spo2Delta <= -2 || reading.spo2Pct < 95.5) {
    spo2Risk = 'MODERATE';
    promote(2);
    indicators.push(`SpO2 slightly below baseline (${reading.spo2Pct.toFixed(1)}% vs ${baseline.spo2Pct.toFixed(1)}%)`);
    spo2Act = 'Repeat pulse oximetry in 30 min';
    actions.push('Recheck SpO2 at rest in 30 minutes and verify cabin ventilation.');
  }
  comparisons.push({
    parameter: 'Blood Oxygen (SpO2)',
    unit: '%',
    baseline: baseline.spo2Pct,
    current: reading.spo2Pct,
    deltaLabel: `${spo2Delta >= 0 ? '+' : ''}${spo2Delta.toFixed(1)}%`,
    trend: trendOf(reading.spo2Pct, previousReading?.spo2Pct, 0.4),
    risk: spo2Risk,
    recommendedAction: spo2Act,
  });

  // 2. Heart Rate
  const hrDelta = reading.heartRateBpm - baseline.heartRateBpm;
  let hrRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  let hrAct = 'Nominal resting cardiac load';
  if (reading.heartRateBpm >= 135 || reading.heartRateBpm <= 40) {
    hrRisk = 'CRITICAL';
    promote(4);
    emergencyReason = emergencyReason ?? `Critical cardiac rate anomaly: ${Math.round(reading.heartRateBpm)} BPM (baseline ${Math.round(baseline.heartRateBpm)} BPM).`;
    indicators.push(`Heart Rate ${Math.round(reading.heartRateBpm)} BPM (Critical)`);
    hrAct = 'Immediate ECG strip + Emergency Cardiac Protocol';
    actions.push('Stop all physical activity, obtain ECG rhythm capture, and alert Earth Flight Surgeon.');
  } else if (reading.heartRateBpm >= 112 || Math.abs(hrDelta) >= 32) {
    hrRisk = 'HIGH';
    promote(3);
    indicators.push(`Heart Rate ${Math.round(reading.heartRateBpm)} BPM (+${Math.round(hrDelta)} vs baseline)`);
    hrAct = 'Seated rest, Lead-II ECG check, notify Flight Surgeon';
    actions.push('Rest in neutral microgravity posture and transmit Lead-II ECG to medical station.');
  } else if (Math.abs(hrDelta) >= 16) {
    hrRisk = 'MODERATE';
    promote(2);
    indicators.push(`Heart Rate shifted (${Math.round(reading.heartRateBpm)} vs ${Math.round(baseline.heartRateBpm)} BPM)`);
    hrAct = 'Rest 15 min & recheck pulse';
    actions.push('Rest 15 minutes and recheck heart rate and blood pressure.');
  }
  comparisons.push({
    parameter: 'Heart Rate',
    unit: 'BPM',
    baseline: baseline.heartRateBpm,
    current: reading.heartRateBpm,
    deltaLabel: `${hrDelta >= 0 ? '+' : ''}${Math.round(hrDelta)} BPM`,
    trend: trendOf(reading.heartRateBpm, previousReading?.heartRateBpm, 3),
    risk: hrRisk,
    recommendedAction: hrAct,
  });

  // 3. Blood Pressure
  const sbpDelta = reading.systolicBp - baseline.systolicBp;
  let bpRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  let bpAct = 'Continue routine BP checks';
  if (reading.systolicBp >= 180 || reading.systolicBp <= 75) {
    bpRisk = 'CRITICAL';
    promote(4);
    emergencyReason = emergencyReason ?? `Critical blood pressure crisis: ${Math.round(reading.systolicBp)}/${Math.round(reading.diastolicBp)} mmHg.`;
    indicators.push(`Blood Pressure ${Math.round(reading.systolicBp)}/${Math.round(reading.diastolicBp)} mmHg (Critical)`);
    bpAct = 'Emergency Medical Protocol & Earth Notification';
    actions.push('Follow acute hemodynamic emergency checklist and contact Earth medical team immediately.');
  } else if (reading.systolicBp >= 150 || reading.systolicBp <= 88) {
    bpRisk = 'HIGH';
    promote(3);
    indicators.push(`Blood Pressure ${Math.round(reading.systolicBp)}/${Math.round(reading.diastolicBp)} mmHg`);
    bpAct = 'Repeat BP x2 & consult Flight Surgeon';
    actions.push('Repeat blood pressure reading in 10 minutes and notify medical support.');
  } else if (Math.abs(sbpDelta) >= 15) {
    bpRisk = 'MODERATE';
    promote(2);
    indicators.push(`Systolic BP shifted ${sbpDelta >= 0 ? '+' : ''}${Math.round(sbpDelta)} mmHg`);
    bpAct = 'Monitor BP in 2 hours';
  }
  comparisons.push({
    parameter: 'Blood Pressure (Sys/Dia)',
    unit: 'mmHg',
    baseline: baseline.systolicBp,
    current: reading.systolicBp,
    deltaLabel: `${sbpDelta >= 0 ? '+' : ''}${Math.round(sbpDelta)} mmHg`,
    trend: trendOf(reading.systolicBp, previousReading?.systolicBp, 3),
    risk: bpRisk,
    recommendedAction: bpAct,
  });

  // 4. Body Temperature
  const tempDelta = reading.bodyTempC - baseline.bodyTempC;
  let tempRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  let tempAct = 'Thermoregulation nominal';
  if (reading.bodyTempC >= 39.5 || reading.bodyTempC <= 34.5) {
    tempRisk = 'CRITICAL';
    promote(4);
    emergencyReason = emergencyReason ?? `Critical core temperature deviation (${reading.bodyTempC.toFixed(1)} °C).`;
    indicators.push(`Core Temp ${reading.bodyTempC.toFixed(1)} °C (Critical)`);
    tempAct = 'Emergency thermal/sepsis protocol';
  } else if (reading.bodyTempC >= 38.2) {
    tempRisk = 'HIGH';
    promote(3);
    indicators.push(`Elevated Temperature ${reading.bodyTempC.toFixed(1)} °C (+${tempDelta.toFixed(1)} °C)`);
    tempAct = 'Crew isolation check & Flight Surgeon eval';
    actions.push('Implement crew droplet precautions and contact medical station for febrile evaluation.');
  } else if (tempDelta >= 0.7) {
    tempRisk = 'MODERATE';
    promote(2);
    indicators.push(`Temperature rising (+${tempDelta.toFixed(1)} °C above baseline)`);
    tempAct = 'Recheck temperature in 2 hours';
  }
  comparisons.push({
    parameter: 'Body Temperature',
    unit: '°C',
    baseline: baseline.bodyTempC,
    current: reading.bodyTempC,
    deltaLabel: `${tempDelta >= 0 ? '+' : ''}${tempDelta.toFixed(2)} °C`,
    trend: trendOf(reading.bodyTempC, previousReading?.bodyTempC, 0.15),
    risk: tempRisk,
    recommendedAction: tempAct,
  });

  // 5. Cabin CO2 (Hypercapnia Risk)
  const co2Delta = reading.cabinCo2Mmhg - baseline.cabinCo2Mmhg;
  let co2Risk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  let co2Act = 'CDRA scrubber nominal';
  if (reading.cabinCo2Mmhg >= 6.5) {
    co2Risk = 'CRITICAL';
    promote(4);
    emergencyReason = emergencyReason ?? `Critical cabin ppCO2 level (${reading.cabinCo2Mmhg.toFixed(1)} mmHg) — acute hypercapnia hazard.`;
    indicators.push(`Cabin ppCO2 ${reading.cabinCo2Mmhg.toFixed(1)} mmHg (Critical)`);
    co2Act = 'Don emergency breathing mask & activate backup LiOH';
    actions.push('Switch to emergency air loop / backup LiOH scrubbers immediately.');
  } else if (reading.cabinCo2Mmhg >= 4.2) {
    co2Risk = 'HIGH';
    promote(3);
    indicators.push(`Cabin ppCO2 elevated (${reading.cabinCo2Mmhg.toFixed(1)} mmHg)`);
    co2Act = 'Inspect CDRA scrubber & halt intense exercise';
    actions.push('Verify CDRA CO2 scrubber status and suspend ARED/CEVIS exercise.');
  } else if (reading.cabinCo2Mmhg >= 3.2) {
    co2Risk = 'MODERATE';
    promote(2);
    indicators.push(`Cabin ppCO2 drifting upward (${reading.cabinCo2Mmhg.toFixed(1)} mmHg)`);
    co2Act = 'Check cabin airflow & recheck in 1h';
  }
  comparisons.push({
    parameter: 'Cabin CO2 Partial Pressure',
    unit: 'mmHg',
    baseline: baseline.cabinCo2Mmhg,
    current: reading.cabinCo2Mmhg,
    deltaLabel: `${co2Delta >= 0 ? '+' : ''}${co2Delta.toFixed(2)} mmHg`,
    trend: trendOf(reading.cabinCo2Mmhg, previousReading?.cabinCo2Mmhg, 0.2),
    risk: co2Risk,
    recommendedAction: co2Act,
  });

  // 6. Radiation Dose
  const radDelta = reading.radiationMsvDay - baseline.radiationMsvDay;
  let radRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  let radAct = 'Nominal galactic cosmic ray background';
  if (reading.radiationMsvDay >= 10.0) {
    radRisk = 'CRITICAL';
    promote(4);
    emergencyReason = emergencyReason ?? `Critical Solar Particle Event radiation surge (${reading.radiationMsvDay.toFixed(2)} mSv/day).`;
    indicators.push(`Radiation ${reading.radiationMsvDay.toFixed(2)} mSv/day (Critical SPE)`);
    radAct = 'Immediate storm shelter relocation (NASA-MED-02)';
    actions.push('Move immediately to shielded radiation storm shelter and notify Mission Control.');
  } else if (reading.radiationMsvDay >= 2.5) {
    radRisk = 'HIGH';
    promote(3);
    indicators.push(`Radiation elevated (${reading.radiationMsvDay.toFixed(2)} mSv/day)`);
    radAct = 'Enter shielded module & monitor dosimetry';
    actions.push('Relocate to highest-shielding habitat bay and monitor active dosimeter.');
  } else if (reading.radiationMsvDay >= 1.1) {
    radRisk = 'MODERATE';
    promote(2);
    indicators.push(`Mild solar flux rise (${reading.radiationMsvDay.toFixed(2)} mSv/day)`);
    radAct = 'Log dosimetry every 2h';
  }
  comparisons.push({
    parameter: 'Radiation Exposure',
    unit: 'mSv/d',
    baseline: baseline.radiationMsvDay,
    current: reading.radiationMsvDay,
    deltaLabel: `${radDelta >= 0 ? '+' : ''}${radDelta.toFixed(2)} mSv/d`,
    trend: trendOf(reading.radiationMsvDay, previousReading?.radiationMsvDay, 0.1),
    risk: radRisk,
    recommendedAction: radAct,
  });

  // 7. Sleep & Stress (Behavioral / Isolation)
  const sleepDelta = reading.sleepHours - baseline.sleepHours;
  let sleepRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  let sleepAct = 'Protected sleep schedule on target';
  if (reading.sleepHours < 4.5) {
    sleepRisk = 'HIGH';
    promote(3);
    indicators.push(`Severe sleep restriction (${reading.sleepHours.toFixed(1)}h vs ${baseline.sleepHours.toFixed(1)}h baseline)`);
    sleepAct = 'Defer safety-critical tasks & follow NASA-MED-04';
    actions.push('Schedule protected recovery sleep window and defer precision EVA/robotics tasks.');
  } else if (sleepDelta <= -1.2) {
    sleepRisk = 'MODERATE';
    promote(2);
    indicators.push(`Sleep below personal baseline (${reading.sleepHours.toFixed(1)}h vs ${baseline.sleepHours.toFixed(1)}h)`);
    sleepAct = 'Follow circadian sleep & light hygiene protocol';
    actions.push('Follow approved sleep/recovery protocol and recheck tomorrow morning.');
  }
  comparisons.push({
    parameter: 'Sleep Duration',
    unit: 'hrs',
    baseline: baseline.sleepHours,
    current: reading.sleepHours,
    deltaLabel: `${sleepDelta >= 0 ? '+' : ''}${sleepDelta.toFixed(1)} hrs`,
    trend: trendOf(reading.sleepHours, previousReading?.sleepHours, 0.3),
    risk: sleepRisk,
    recommendedAction: sleepAct,
  });

  // 8. Bone & Muscle / Activity
  const boneDelta = reading.boneMuscleIndex - baseline.boneMuscleIndex;
  let boneRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  let boneAct = 'ARED resistive load & nutrition on track';
  if (reading.boneMuscleIndex < 78 || reading.activityMins < 35) {
    boneRisk = 'MODERATE';
    promote(2);
    indicators.push(`Bone/Muscle index or ARED activity below baseline (${reading.boneMuscleIndex.toFixed(0)}%, ${Math.round(reading.activityMins)} min)`);
    boneAct = 'Schedule ARED loading & Vitamin D check (if medically cleared)';
    actions.push('Review ARED resistive exercise compliance when clinically cleared.');
  }
  comparisons.push({
    parameter: 'Bone & Muscle Index',
    unit: 'idx',
    baseline: baseline.boneMuscleIndex,
    current: reading.boneMuscleIndex,
    deltaLabel: `${boneDelta >= 0 ? '+' : ''}${boneDelta.toFixed(1)}`,
    trend: trendOf(reading.boneMuscleIndex, previousReading?.boneMuscleIndex, 0.5),
    risk: boneRisk,
    recommendedAction: boneAct,
  });

  // 9. Immune & Mood
  const immuneDelta = reading.immuneScore - baseline.immuneScore;
  if (reading.immuneScore < 76 || reading.moodScore < 65 || reading.stressIndex > 65) {
    promote(2);
    if (reading.stressIndex > 65) {
      indicators.push(`Elevated stress index (${Math.round(reading.stressIndex)}/100)`);
      actions.push('Perform paced breathing decompression and schedule crew behavioral check-in.');
    }
    if (reading.immuneScore < 76) {
      indicators.push(`Immune readiness reduced (${Math.round(reading.immuneScore)} vs ${Math.round(baseline.immuneScore)})`);
    }
  }
  comparisons.push({
    parameter: 'Immune Readiness',
    unit: 'pts',
    baseline: baseline.immuneScore,
    current: reading.immuneScore,
    deltaLabel: `${immuneDelta >= 0 ? '+' : ''}${immuneDelta.toFixed(1)}`,
    trend: trendOf(reading.immuneScore, previousReading?.immuneScore, 1.0),
    risk: reading.immuneScore < 76 ? 'MODERATE' : 'LOW',
    recommendedAction: reading.immuneScore < 76 ? 'Monitor temperature & symptoms daily' : 'Nominal immune markers',
  });

  if (reading.symptomsNote && /chest|dizzy|faint|breath|pain|severe/i.test(reading.symptomsNote)) {
    promote(3);
    indicators.push(`Self-reported symptom flag: "${reading.symptomsNote}"`);
    actions.push('Prioritize direct consultation with Crew Medical Officer and Earth Flight Surgeon.');
  }

  const severityLevel: SeverityLevel =
    rawSeverityLevel >= 4 ? 4 : rawSeverityLevel === 3 ? 3 : rawSeverityLevel === 2 ? 2 : 1;

  let status: ThreeStateStatus = 'NORMAL';
  if (severityLevel >= 3) status = 'NEEDS ATTENTION';
  else if (severityLevel === 2) status = 'CHANGING';

  if (actions.length === 0) {
    actions.push('Continue standard mission schedule, scheduled ARED exercise, and routine daily telemetry check.');
  }

  const monitoringInterval =
    severityLevel === 4
      ? 'Continuous telemetry — emergency reassessment every 2 minutes'
      : severityLevel === 3
      ? 'Recheck within 15–30 minutes'
      : severityLevel === 2
      ? 'Monitor over the next 2–6 hours / follow-up tomorrow morning'
      : 'Next routine daily health check in 24 hours';

  const whenToEscalate =
    severityLevel === 4
      ? 'Immediate emergency protocol active — notify Earth Medical Station now.'
      : severityLevel === 3
      ? 'Escalate to Emergency Pathway immediately if SpO2 <= 90%, HR >= 135 BPM, or chest/neurological symptoms develop.'
      : severityLevel === 2
      ? 'Contact Flight Surgeon if deviation persists > 24 hours or worsens by another 10%.'
      : 'Contact medical support if any symptom or vital sign moves outside personal baseline.';

  const summary =
    severityLevel === 4
      ? emergencyReason || 'Critical physiological or environmental threshold breached. Immediate emergency action required.'
      : severityLevel === 3
      ? `High-risk deviation detected across ${indicators.length} indicator(s). Prioritize clinical evaluation and Earth medical station notification.`
      : severityLevel === 2
      ? `Early drift from personal baseline detected (${indicators.length} indicator(s)). Follow approved preventive protocol and scheduled recheck.`
      : 'All monitored physiological, behavioral, and cabin parameters remain within personal mission baseline.';

  const complementaryAllowed = severityLevel <= 2;
  const complementaryNote =
    severityLevel === 1
      ? 'Optional wellness support (clearly distinct from medical treatment): paced pranayama/box breathing, warm hydration, and gentle mobility stretching.'
      : severityLevel === 2
      ? 'Optional non-interfering supportive wellness (only alongside medical monitoring): structured rest, hydration, and calm breathwork. Do not delay medical evaluation.'
      : undefined;

  return {
    astronautId: reading.astronautId,
    status,
    severityLevel,
    severityLabel: severityLabelFromLevel(severityLevel),
    emergencyTriggered: severityLevel === 4,
    emergencyReason,
    summary,
    mainIndicators: indicators.length ? indicators : ['All 15 physiological and environmental modules nominal'],
    recommendedActions: Array.from(new Set(actions)),
    monitoringInterval,
    whenToEscalate,
    earthMedicalSupportRequired: severityLevel >= 3,
    comparisons,
    responseTimeline: {
      detectedAt: reading.recordedAt,
      durationLabel: severityLevel === 1 ? 'Baseline stable' : severityLevel === 2 ? 'Early / persistent drift' : 'Acute active event',
      severityLabel: severityLevel >= 4 ? 'Critical' : severityLevel >= 2 ? 'Attention' : 'Normal',
      responseWindow:
        severityLevel === 4
          ? 'Escalate immediately'
          : severityLevel === 3
          ? 'Recheck now & notify Earth'
          : severityLevel === 2
          ? 'Monitor over the next several hours'
          : 'Follow the daily protocol',
      nextCheck: monitoringInterval,
      escalation: whenToEscalate,
    },
    complementaryAllowed,
    complementaryNote,
    evaluatedAt: new Date().toISOString(),
  };
}
