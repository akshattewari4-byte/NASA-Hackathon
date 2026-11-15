import { db } from './db.ts';
import { getFullAstronautProfiles, rowToReading } from './monitorEngine.ts';
import type {
  AstronautProfile,
  DigitalTwinPayload,
  EquipmentUnit,
  ExerciseRecord,
  PredictiveAnalysis,
  PredictiveWarning,
  PrivateMentalCheckIn,
  SleepFatigueRecord,
  VisionHealthRecord,
} from '../src/types/astrocare.ts';

export function getSleepLogsForAstronaut(astronautId: number): SleepFatigueRecord[] {
  const rows = db
    .prepare('SELECT * FROM crew_sleep_logs WHERE astronaut_id = ? ORDER BY logged_at ASC LIMIT 30')
    .all(astronautId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: Number(r.id),
    astronautId: Number(r.astronaut_id),
    loggedAt: String(r.logged_at),
    sleepHours: Number(r.sleep_hours),
    qualityPct: Number(r.quality_pct),
    workloadScore: Number(r.workload_score),
    fatigueIndex: Number(r.fatigue_index),
    workHours: Number(r.work_hours),
    restHours: Number(r.rest_hours),
    note: r.note ? String(r.note) : undefined,
  }));
}

export function getExerciseLogsForAstronaut(astronautId: number): ExerciseRecord[] {
  const rows = db
    .prepare('SELECT * FROM crew_exercise_logs WHERE astronaut_id = ? ORDER BY logged_at ASC LIMIT 30')
    .all(astronautId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: Number(r.id),
    astronautId: Number(r.astronaut_id),
    loggedAt: String(r.logged_at),
    device: String(r.device) as ExerciseRecord['device'],
    exerciseName: String(r.exercise_name),
    durationMin: Number(r.duration_min),
    loadKg: Number(r.load_kg),
    strengthScore: Number(r.strength_score),
    completed: Number(r.completed) === 1,
  }));
}

export function getVisionLogsForAstronaut(astronautId: number): VisionHealthRecord[] {
  const rows = db
    .prepare('SELECT * FROM crew_vision_logs WHERE astronaut_id = ? ORDER BY recorded_at ASC LIMIT 20')
    .all(astronautId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: Number(r.id),
    astronautId: Number(r.astronaut_id),
    recordedAt: String(r.recorded_at),
    visualAcuityLeft: String(r.visual_acuity_left),
    visualAcuityRight: String(r.visual_acuity_right),
    nearShiftDiopter: Number(r.near_shift_diopter),
    symptoms: JSON.parse(String(r.symptoms_json || '[]')) as string[],
    warningTriggered: Number(r.warning_triggered) === 1,
    clinicianRecommendation: String(r.clinician_recommendation),
  }));
}

export function getPrivateMentalCheckIns(astronautId: number): PrivateMentalCheckIn[] {
  const rows = db
    .prepare('SELECT * FROM crew_mental_checkins WHERE astronaut_id = ? ORDER BY recorded_at ASC LIMIT 30')
    .all(astronautId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: Number(r.id),
    astronautId: Number(r.astronaut_id),
    recordedAt: String(r.recorded_at),
    moodScore: Number(r.mood_score),
    stressLevel: Number(r.stress_level),
    workloadRating: Number(r.workload_rating),
    sleepHours: Number(r.sleep_hours),
    privateNote: String(r.private_note),
    isPrivate: Number(r.is_private) === 1,
  }));
}

export function getEquipmentUnits(): EquipmentUnit[] {
  const rows = db
    .prepare('SELECT * FROM equipment_units ORDER BY id ASC')
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: Number(r.id),
    unitCode: String(r.unit_code),
    name: String(r.name),
    subsystem: String(r.subsystem) as EquipmentUnit['subsystem'],
    temperatureC: Number(Number(r.temperature_c).toFixed(1)),
    vibrationMmS: Number(Number(r.vibration_mm_s).toFixed(2)),
    batteryHealthPct: Number(Number(r.battery_health_pct).toFixed(1)),
    sensorReliabilityPct: Number(Number(r.sensor_reliability_pct).toFixed(1)),
    faultCount: Number(r.fault_count),
    faultHistory: JSON.parse(String(r.fault_history_json || '[]')),
    status: String(r.status) as EquipmentUnit['status'],
    anomalyNote: String(r.anomaly_note),
    maintenanceRecommendation: String(r.maintenance_recommendation),
    updatedAt: String(r.updated_at),
  }));
}

export function performEquipmentMaintenance(unitId: number): EquipmentUnit | null {
  const existing = db.prepare('SELECT * FROM equipment_units WHERE id = ?').get(unitId) as Record<string, unknown> | undefined;
  if (!existing) return null;
  const now = new Date().toISOString();
  const baseTemp =
    existing.unit_code === 'ECLSS-CDRA-01' ? 34.0 : existing.unit_code === 'ECLSS-OGA-02' ? 31.5 : 22.5;
  const history = JSON.parse(String(existing.fault_history_json || '[]')) as Array<{ timestamp: string; code: string; detail: string }>;
  history.unshift({
    timestamp: now,
    code: 'MAINT-CAL-OK',
    detail: 'Preventive inspection & sensor recalibration completed.',
  });

  db.prepare(
    `UPDATE equipment_units
     SET temperature_c = ?, vibration_mm_s = 0.65, battery_health_pct = MIN(100, battery_health_pct + 4.5),
         sensor_reliability_pct = 99.2, fault_history_json = ?, status = 'NOMINAL',
         anomaly_note = 'Post-maintenance nominal baseline verified.',
         maintenance_recommendation = 'Routine monitoring every 24h.', updated_at = ?
     WHERE id = ?`
  ).run(baseTemp, JSON.stringify(history.slice(0, 8)), now, unitId);

  return getEquipmentUnits().find((u) => u.id === unitId) || null;
}

export function analyzePredictiveHealth(astronaut: AstronautProfile): PredictiveAnalysis {
  const rawReadings = db
    .prepare('SELECT * FROM health_readings WHERE astronaut_id = ? ORDER BY recorded_at DESC LIMIT 18')
    .all(astronaut.id) as Array<Record<string, unknown>>;
  const readings = rawReadings.map(rowToReading).reverse();
  const sleepLogs = getSleepLogsForAstronaut(astronaut.id);
  const exerciseLogs = getExerciseLogsForAstronaut(astronaut.id);
  const visionLogs = getVisionLogsForAstronaut(astronaut.id);

  const b = astronaut.baseline;
  const curr = astronaut.latestReading;
  const warnings: PredictiveWarning[] = [];

  // 1. Resting Heart Rate & SpO2 multi-window drift
  const recentWindow = readings.slice(-4);
  const avgHrRecent =
    recentWindow.length > 0
      ? recentWindow.reduce((sum, r) => sum + r.heartRateBpm, 0) / recentWindow.length
      : curr.heartRateBpm;
  const avgSpo2Recent =
    recentWindow.length > 0
      ? recentWindow.reduce((sum, r) => sum + r.spo2Pct, 0) / recentWindow.length
      : curr.spo2Pct;

  const hrDrift = avgHrRecent - b.heartRateBpm;
  const spo2Drift = avgSpo2Recent - b.spo2Pct;

  if (Math.abs(hrDrift) >= 10 || spo2Drift <= -1.4 || curr.spo2Pct <= 94) {
    warnings.push({
      id: 'pred-cardio-drift',
      domain: 'Cardiopulmonary',
      level: curr.spo2Pct <= 92 || Math.abs(hrDrift) >= 24 ? 'WARNING' : 'WATCH',
      title: 'Cardiopulmonary Autonomic & Oxygenation Pattern Drift',
      explanation: `Recent 4-packet mean HR (${avgHrRecent.toFixed(1)} BPM) and SpO2 (${avgSpo2Recent.toFixed(1)}%) diverged from ${astronaut.callSign}'s personal baseline.`,
      supportingData: [
        {
          metric: 'Heart Rate (4-pt Mean)',
          baseline: `${Math.round(b.heartRateBpm)} BPM`,
          observed: `${avgHrRecent.toFixed(1)} BPM`,
          trend: `${hrDrift >= 0 ? '+' : ''}${hrDrift.toFixed(1)} BPM`,
        },
        {
          metric: 'SpO2 (4-pt Mean)',
          baseline: `${b.spo2Pct.toFixed(1)}%`,
          observed: `${avgSpo2Recent.toFixed(1)}%`,
          trend: `${spo2Drift >= 0 ? '+' : ''}${spo2Drift.toFixed(1)}%`,
        },
      ],
      recommendedAction: 'Cross-check resting ECG rhythm, hydration, and cabin ppCO2; notify Flight Surgeon if persistent.',
      confidenceNote: `Observed across ${recentWindow.length} sequential telemetry samples.`,
    });
  }

  // 2. Sleep Debt & Fatigue Trajectory
  const latestSleep = sleepLogs[sleepLogs.length - 1];
  const prevSleep = sleepLogs[sleepLogs.length - 2];
  const avgSleep =
    sleepLogs.slice(-4).length > 0
      ? sleepLogs.slice(-4).reduce((s, x) => s + x.sleepHours, 0) / sleepLogs.slice(-4).length
      : curr.sleepHours;
  const fatigueTrend: PredictiveAnalysis['fatigueTrend'] =
    latestSleep && prevSleep
      ? latestSleep.fatigueIndex - prevSleep.fatigueIndex >= 5
        ? 'RISING'
        : prevSleep.fatigueIndex - latestSleep.fatigueIndex >= 5
        ? 'RECOVERY'
        : 'STABLE'
      : curr.sleepHours < b.sleepHours - 0.8
      ? 'RISING'
      : 'STABLE';

  if (avgSleep < b.sleepHours - 0.6 || (latestSleep && latestSleep.fatigueIndex >= 55) || curr.sleepHours < 6.0) {
    warnings.push({
      id: 'pred-fatigue-trend',
      domain: 'Fatigue & Circadian',
      level: curr.sleepHours < 5.5 || (latestSleep && latestSleep.fatigueIndex >= 70) ? 'WARNING' : 'WATCH',
      title: 'Cumulative Sleep Restriction & Fatigue Pattern Detected',
      explanation: `Trailing sleep mean (${avgSleep.toFixed(1)} h/night) sits below personal baseline (${b.sleepHours.toFixed(1)} h) alongside elevated workload/fatigue index.`,
      supportingData: [
        {
          metric: 'Mean Sleep Duration',
          baseline: `${b.sleepHours.toFixed(1)} hrs`,
          observed: `${avgSleep.toFixed(1)} hrs`,
          trend: `${(avgSleep - b.sleepHours).toFixed(1)} hrs/night`,
        },
        {
          metric: 'Fatigue Index',
          baseline: '< 45 / 100',
          observed: `${latestSleep ? latestSleep.fatigueIndex : Math.round(curr.stressIndex)} / 100`,
          trend: fatigueTrend,
        },
      ],
      recommendedAction: 'Schedule protected 8.5h sleep opportunity and defer non-essential high-precision EVA or robotics.',
      confidenceNote: `Derived from ${sleepLogs.length} sleep logs & recent actigraphy.`,
    });
  }

  // 3. Physical Performance & Musculoskeletal Strength Drift
  const latestEx = exerciseLogs[exerciseLogs.length - 1];
  const earliestEx = exerciseLogs[0];
  const strengthDelta = latestEx && earliestEx ? latestEx.strengthScore - earliestEx.strengthScore : 0;
  const performanceDriftPct = Number(((curr.boneMuscleIndex - b.boneMuscleIndex) + strengthDelta * 0.4).toFixed(1));

  if (curr.boneMuscleIndex < b.boneMuscleIndex - 4 || curr.activityMins < 45 || strengthDelta <= -4) {
    warnings.push({
      id: 'pred-musculoskeletal',
      domain: 'Musculoskeletal',
      level: curr.boneMuscleIndex < 80 ? 'WARNING' : 'WATCH',
      title: 'Microgravity Physical Performance / Resistive Load Drift',
      explanation: `Musculoskeletal index (${curr.boneMuscleIndex.toFixed(1)}) or ARED activity (${Math.round(curr.activityMins)} min) shifted below mission countermeasure target.`,
      supportingData: [
        {
          metric: 'Bone & Muscle Index',
          baseline: `${b.boneMuscleIndex.toFixed(0)} idx`,
          observed: `${curr.boneMuscleIndex.toFixed(1)} idx`,
          trend: `${(curr.boneMuscleIndex - b.boneMuscleIndex).toFixed(1)}`,
        },
        {
          metric: 'Exercise Load Score',
          baseline: '92–96 pts',
          observed: `${latestEx ? latestEx.strengthScore : 90} pts`,
          trend: `${strengthDelta >= 0 ? '+' : ''}${strengthDelta} pts`,
        },
      ],
      recommendedAction: 'Verify scheduled ARED & T2 treadmill axial loading sessions when medically cleared.',
      confidenceNote: `Evaluated across ${exerciseLogs.length} countermeasure sessions.`,
    });
  }

  // 4. SANS Vision / Ocular Warning Check
  const latestVis = visionLogs[visionLogs.length - 1];
  if (latestVis && (latestVis.warningTriggered || latestVis.nearShiftDiopter >= 0.75 || latestVis.symptoms.length > 0)) {
    warnings.push({
      id: 'pred-vision-sans',
      domain: 'Vision / SANS',
      level: latestVis.nearShiftDiopter >= 1.0 || latestVis.warningTriggered ? 'WARNING' : 'WATCH',
      title: 'Spaceflight-Associated Neuro-ocular Syndrome (SANS) Screening Watch',
      explanation: `Reported visual findings (${latestVis.symptoms.join(', ') || 'diopter shift'}) and/or near-vision shift (+${latestVis.nearShiftDiopter.toFixed(2)} D) warrant Flight Surgeon review.`,
      supportingData: [
        {
          metric: 'Hyperopic Near Shift',
          baseline: '0.00 D',
          observed: `+${latestVis.nearShiftDiopter.toFixed(2)} D`,
          trend: latestVis.nearShiftDiopter >= 0.75 ? 'RISING' : 'WATCH',
        },
        {
          metric: 'Acuity (L / R)',
          baseline: '20/20 / 20/20',
          observed: `${latestVis.visualAcuityLeft} / ${latestVis.visualAcuityRight}`,
          trend: latestVis.symptoms.length ? `${latestVis.symptoms.length} symptom(s)` : 'STABLE',
        },
      ],
      recommendedAction: latestVis.clinicianRecommendation,
      confidenceNote: `Based on ${visionLogs.length} onboard ophthalmic check entries.`,
    });
  }

  // 5. Cabin CO2 / Radiation Creep
  if (curr.cabinCo2Mmhg >= 3.2 || curr.radiationMsvDay >= 1.1) {
    warnings.push({
      id: 'pred-env-radiation',
      domain: curr.radiationMsvDay >= 1.1 ? 'Radiation' : 'Environmental',
      level: curr.cabinCo2Mmhg >= 4.2 || curr.radiationMsvDay >= 2.5 ? 'WARNING' : 'WATCH',
      title: 'Habitat Environmental & Space Weather Load Elevation',
      explanation: `Cabin ppCO2 (${curr.cabinCo2Mmhg.toFixed(2)} mmHg) or radiation dose rate (${curr.radiationMsvDay.toFixed(2)} mSv/day) exceeds nominal baseline.`,
      supportingData: [
        {
          metric: 'Cabin ppCO2',
          baseline: `${b.cabinCo2Mmhg.toFixed(2)} mmHg`,
          observed: `${curr.cabinCo2Mmhg.toFixed(2)} mmHg`,
          trend: curr.cabinCo2Mmhg >= 3.2 ? 'RISING' : 'STABLE',
        },
        {
          metric: 'Radiation Rate',
          baseline: `${b.radiationMsvDay.toFixed(2)} mSv/d`,
          observed: `${curr.radiationMsvDay.toFixed(2)} mSv/d`,
          trend: curr.radiationMsvDay >= 1.1 ? 'RISING' : 'STABLE',
        },
      ],
      recommendedAction: 'Inspect CDRA scrubber bed performance and review shielding bay options.',
      confidenceNote: 'Matched against NASA-STD-3001 habitat atmosphere bands.',
    });
  }

  const penalty = warnings.reduce((acc, w) => acc + (w.level === 'WARNING' ? 14 : w.level === 'WATCH' ? 6 : 2), 0);
  const readinessScore = Math.max(25, Math.min(99, Math.round(97 - penalty)));

  return {
    astronautId: astronaut.id,
    evaluatedAt: new Date().toISOString(),
    readinessScore,
    fatigueTrend,
    performanceDriftPct,
    warnings,
    disclaimer:
      'Decision-support pattern analysis only. ASTROCARE does not issue medical diagnoses or guaranteed predictions; consult Earth Flight Surgeon for clinical decisions.',
    isSimulated: curr.isSimulated,
  };
}

export function buildDigitalTwinPayload(astronautId: number): DigitalTwinPayload | null {
  const astronaut = getFullAstronautProfiles().find((a) => a.id === astronautId);
  if (!astronaut) return null;

  const rawReadings = db
    .prepare('SELECT * FROM health_readings WHERE astronaut_id = ? ORDER BY recorded_at ASC LIMIT 40')
    .all(astronautId) as Array<Record<string, unknown>>;
  const readingsHistory = rawReadings.map(rowToReading);

  const radRows = db
    .prepare('SELECT * FROM radiation_records WHERE astronaut_id = ? ORDER BY id ASC LIMIT 25')
    .all(astronautId) as Array<Record<string, unknown>>;

  return {
    astronaut,
    predictive: analyzePredictiveHealth(astronaut),
    readingsHistory,
    sleepLogs: getSleepLogsForAstronaut(astronautId),
    exerciseLogs: getExerciseLogsForAstronaut(astronautId),
    visionLogs: getVisionLogsForAstronaut(astronautId),
    radiationHistory: radRows.map((r) => ({
      id: Number(r.id),
      recordedAt: String(r.recorded_at),
      doseMsvDay: Number(r.dose_msv_day),
      cumulativeMsv: Number(r.cumulative_msv),
      eventType: String(r.event_type),
    })),
    provenanceNote:
      'Prototype research digital twin combining simulated mission telemetry, SQLite historical trends, and deterministic safety logic. Not a clinically validated medical digital twin.',
  };
}
