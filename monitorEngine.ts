import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { db } from './db.ts';
import { evaluateAstronautHealth } from './healthEngine.ts';
import type {
  AstronautProfile,
  EngineMode,
  HealthReading,
  PersonalBaseline,
  ScenarioPreset,
  SpacecraftResources,
  SuitTelemetry,
} from '../src/types/astrocare.ts';

function rowToBaseline(r: Record<string, number>): PersonalBaseline {
  return {
    astronautId: r.astronaut_id,
    heartRateBpm: r.heart_rate_bpm,
    systolicBp: r.systolic_bp,
    diastolicBp: r.diastolic_bp,
    spo2Pct: r.spo2_pct,
    bodyTempC: r.body_temp_c,
    respiratoryRate: r.respiratory_rate,
    sleepHours: r.sleep_hours,
    stressIndex: r.stress_index,
    moodScore: r.mood_score,
    activityMins: r.activity_mins,
    boneMuscleIndex: r.bone_muscle_index,
    immuneScore: r.immune_score,
    radiationMsvDay: r.radiation_msv_day,
    cabinO2Pct: r.cabin_o2_pct,
    cabinCo2Mmhg: r.cabin_co2_mmhg,
    cabinTempC: r.cabin_temp_c,
    cabinHumidityPct: r.cabin_humidity_pct,
    cabinPressureKpa: r.cabin_pressure_kpa,
  };
}

export function rowToReading(r: Record<string, unknown>): HealthReading {
  return {
    id: Number(r.id),
    astronautId: Number(r.astronaut_id),
    recordedAt: String(r.recorded_at),
    source: (r.source as HealthReading['source']) || 'SIMULATION',
    heartRateBpm: Number(r.heart_rate_bpm),
    systolicBp: Number(r.systolic_bp),
    diastolicBp: Number(r.diastolic_bp),
    spo2Pct: Number(r.spo2_pct),
    bodyTempC: Number(r.body_temp_c),
    respiratoryRate: Number(r.respiratory_rate),
    sleepHours: Number(r.sleep_hours),
    stressIndex: Number(r.stress_index),
    moodScore: Number(r.mood_score),
    activityMins: Number(r.activity_mins),
    boneMuscleIndex: Number(r.bone_muscle_index),
    immuneScore: Number(r.immune_score),
    radiationMsvDay: Number(r.radiation_msv_day),
    cabinO2Pct: Number(r.cabin_o2_pct),
    cabinCo2Mmhg: Number(r.cabin_co2_mmhg),
    cabinTempC: Number(r.cabin_temp_c),
    cabinHumidityPct: Number(r.cabin_humidity_pct),
    cabinPressureKpa: Number(r.cabin_pressure_kpa),
    ecgRhythm: String(r.ecg_rhythm || 'Normal Sinus Rhythm'),
    ecgStMv: Number(r.ecg_st_mv ?? 0.02),
    symptomsNote: r.symptoms_note ? String(r.symptoms_note) : undefined,
    isSimulated: Number(r.is_simulated) === 1,
  };
}

export function getFullAstronautProfiles(): AstronautProfile[] {
  const rows = db.prepare('SELECT * FROM astronaut_profiles ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  return rows.map((a) => {
    const id = Number(a.id);
    const baselineRow = db.prepare('SELECT * FROM personal_baselines WHERE astronaut_id = ?').get(id) as Record<string, number>;
    const baseline = rowToBaseline(baselineRow);
    const recentRows = db
      .prepare('SELECT * FROM health_readings WHERE astronaut_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 2')
      .all(id) as Array<Record<string, unknown>>;

    const latestReading = recentRows[0]
      ? rowToReading(recentRows[0])
      : {
          ...baseline,
          astronautId: id,
          recordedAt: new Date().toISOString(),
          source: 'SIMULATION' as const,
          ecgRhythm: 'Normal Sinus Rhythm',
          ecgStMv: 0.02,
          isSimulated: true,
        };
    const prevReading = recentRows[1] ? rowToReading(recentRows[1]) : undefined;
    const assessment = evaluateAstronautHealth(latestReading, baseline, prevReading);

    const consent = db.prepare('SELECT * FROM privacy_consents WHERE astronaut_id = ?').get(id) as
      | { allow_database_storage: number; allow_earth_transmission: number; updated_at: string }
      | undefined;

    const suitRow = db.prepare('SELECT * FROM astronaut_suit_telemetry WHERE astronaut_id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    const radRow = db
      .prepare('SELECT cumulative_msv FROM radiation_records WHERE astronaut_id = ? ORDER BY id DESC LIMIT 1')
      .get(id) as { cumulative_msv: number } | undefined;

    const suit: SuitTelemetry = suitRow
      ? {
          astronautId: id,
          suitId: String(suitRow.suit_id),
          batteryPct: Number(suitRow.battery_pct),
          o2ReservePct: Number(suitRow.o2_reserve_pct),
          suitPressureKpa: Number(suitRow.suit_pressure_kpa),
          thermalLoopC: Number(suitRow.thermal_loop_c),
          co2ScrubberPct: Number(suitRow.co2_scrubber_pct),
          sealStatus: (String(suitRow.seal_status) as SuitTelemetry['sealStatus']) || 'SEALED',
          evaMode: (String(suitRow.eva_mode) as SuitTelemetry['evaMode']) || 'STANDBY_IVA',
          cumulativeDoseMsv: Number(radRow?.cumulative_msv ?? latestReading.radiationMsvDay * Number(a.mission_day)),
          updatedAt: String(suitRow.updated_at),
        }
      : {
          astronautId: id,
          suitId: `xEMU-0${id}`,
          batteryPct: 94,
          o2ReservePct: 96,
          suitPressureKpa: 29.6,
          thermalLoopC: 18.8,
          co2ScrubberPct: 95,
          sealStatus: 'SEALED',
          evaMode: 'STANDBY_IVA',
          cumulativeDoseMsv: Number((latestReading.radiationMsvDay * Number(a.mission_day)).toFixed(2)),
          updatedAt: new Date().toISOString(),
        };

    return {
      id,
      callSign: String(a.call_sign),
      fullName: String(a.full_name),
      missionRole: String(a.mission_role),
      missionName: String(a.mission_name),
      missionDay: Number(a.mission_day),
      age: Number(a.age),
      bloodType: String(a.blood_type),
      baseline,
      latestReading,
      assessment,
      sensors: JSON.parse(String(a.sensors_json)),
      suit,
      privacyConsent: {
        allowDatabaseStorage: consent ? consent.allow_database_storage === 1 : true,
        allowEarthTransmission: consent ? consent.allow_earth_transmission === 1 : true,
        updatedAt: consent?.updated_at || new Date().toISOString(),
      },
    };
  });
}

export function getSpacecraftResources(): SpacecraftResources {
  const row = db.prepare('SELECT * FROM spacecraft_resources WHERE id = 1').get() as Record<string, unknown> | undefined;
  if (!row) {
    return {
      foodDaysRemaining: 142,
      foodKcalReservePct: 88.4,
      waterLiters: 2480,
      waterRecyclingPct: 93.5,
      oxygenKg: 312.5,
      o2GenerationKgDay: 9.4,
      co2ScrubberHealthPct: 92,
      cabinPressureKpa: 101.2,
      solarPowerKw: 86.4,
      batteryArrayPct: 91,
      daysOfAutonomy: 91,
      updatedAt: new Date().toISOString(),
      isSimulated: true,
    };
  }
  const foodDays = Number(row.food_days_remaining);
  const waterL = Number(row.water_liters);
  const o2Kg = Number(row.oxygen_kg);
  const autonomy = Math.floor(Math.min(foodDays, waterL / 18, o2Kg / 2.2));
  return {
    foodDaysRemaining: Number(foodDays.toFixed(1)),
    foodKcalReservePct: Number(Number(row.food_kcal_reserve_pct).toFixed(1)),
    waterLiters: Number(waterL.toFixed(1)),
    waterRecyclingPct: Number(Number(row.water_recycling_pct).toFixed(1)),
    oxygenKg: Number(o2Kg.toFixed(1)),
    o2GenerationKgDay: Number(Number(row.o2_generation_kg_day).toFixed(1)),
    co2ScrubberHealthPct: Number(Number(row.co2_scrubber_health_pct).toFixed(1)),
    cabinPressureKpa: Number(Number(row.cabin_pressure_kpa).toFixed(2)),
    solarPowerKw: Number(Number(row.solar_power_kw).toFixed(1)),
    batteryArrayPct: Number(Number(row.battery_array_pct).toFixed(1)),
    daysOfAutonomy: Math.max(0, autonomy),
    updatedAt: String(row.updated_at),
    isSimulated: true,
  };
}

class MonitorEngine {
  private wss: WebSocketServer;
  private mode: EngineMode = 'SIMULATION';
  private scenario: ScenarioPreset = 'NOMINAL';
  private earthCommsOnline = true;
  private intervalId: NodeJS.Timeout | null = null;
  private tickCounter = 0;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws) => {
      ws.send(
        JSON.stringify({
          type: 'engine:init',
          mode: this.mode,
          scenario: this.scenario,
          earthCommsOnline: this.earthCommsOnline,
          astronauts: getFullAstronautProfiles(),
          resources: getSpacecraftResources(),
        })
      );
    });
  }

  public handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  public getStatus() {
    return {
      mode: this.mode,
      scenario: this.scenario,
      earthCommsOnline: this.earthCommsOnline,
    };
  }

  public setMode(mode: EngineMode) {
    this.mode = mode;
    this.broadcast({ type: 'engine:state', ...this.getStatus() });
  }

  public setEarthComms(online: boolean) {
    this.earthCommsOnline = online;
    if (online) {
      db.prepare('UPDATE alerts SET pending_sync = 0, earth_notified = 1 WHERE pending_sync = 1').run();
    }
    this.broadcast({ type: 'engine:state', ...this.getStatus() });
  }

  public applyScenario(scenario: ScenarioPreset, targetAstronautId = 1) {
    this.scenario = scenario;
    const profiles = getFullAstronautProfiles();
    const target = profiles.find((p) => p.id === targetAstronautId) || profiles[0];
    if (!target) return;

    const b = target.baseline;
    const now = new Date().toISOString();
    let r: Omit<HealthReading, 'id'> = {
      ...b,
      astronautId: target.id,
      recordedAt: now,
      source: 'SIMULATION',
      ecgRhythm: 'Normal Sinus Rhythm',
      ecgStMv: 0.02,
      isSimulated: true,
    };

    const sensors = {
      heartRate: 'ONLINE',
      spo2: 'ONLINE',
      sleep: 'ONLINE',
      radiation: 'ONLINE',
      cabinEnv: 'ONLINE',
    };

    if (scenario === 'CO2_SCRUBBER_FAULT') {
      r = {
        ...r,
        cabinCo2Mmhg: 5.1,
        respiratoryRate: b.respiratoryRate + 6,
        spo2Pct: 93.2,
        heartRateBpm: b.heartRateBpm + 20,
        symptomsNote: 'Mild throbbing headache & air stuffiness in Destiny module (SIMULATED)',
      };
    } else if (scenario === 'SOLAR_PARTICLE_EVENT') {
      r = {
        ...r,
        radiationMsvDay: 11.4,
        stressIndex: 68,
        heartRateBpm: b.heartRateBpm + 18,
        symptomsNote: 'SPE Storm Shelter alert triggered (SIMULATED)',
      };
    } else if (scenario === 'ORTHOSTATIC_STRESS') {
      r = {
        ...r,
        heartRateBpm: 118,
        systolicBp: 91,
        diastolicBp: 60,
        ecgRhythm: 'Sinus Tachycardia',
        ecgStMv: -0.06,
        symptomsNote: 'Lightheadedness during post-exercise station transfer (SIMULATED)',
      };
    } else if (scenario === 'CRITICAL_HYPOXIA') {
      r = {
        ...r,
        spo2Pct: 88.5,
        heartRateBpm: 138,
        cabinCo2Mmhg: 6.9,
        respiratoryRate: 26,
        ecgRhythm: 'Sinus Tachycardia w/ ST Depression',
        ecgStMv: -0.14,
        symptomsNote: 'Acute dyspnea & severe hypoxia drill (SIMULATED)',
      };
    } else if (scenario === 'SENSOR_DISCONNECT') {
      sensors.sleep = 'OFFLINE';
      r = {
        ...r,
        sleepHours: 5.4,
        stressIndex: 58,
      };
    } else if (scenario === 'SUIT_BATTERY_LOW') {
      db.prepare(
        `UPDATE astronaut_suit_telemetry
         SET battery_pct = 17.5, o2_reserve_pct = 24.0, suit_pressure_kpa = 28.1, thermal_loop_c = 23.4,
             co2_scrubber_pct = 38.0, seal_status = 'WARNING', eva_mode = 'EVA_ACTIVE', updated_at = ?
         WHERE astronaut_id = ?`
      ).run(now, target.id);
      r = {
        ...r,
        heartRateBpm: b.heartRateBpm + 24,
        stressIndex: 69,
        bodyTempC: 37.6,
        symptomsNote: 'EVA suit battery <20% & primary O2 reserve low — airlock ingress ordered (SIMULATED)',
      };
      this.createSystemAlert(
        target.id,
        3,
        'NEEDS ATTENTION',
        'Spacesuit Power & O2 Reserve Warning',
        `xEMU-0${target.id} battery at 17.5%, O2 reserve 24.0%`,
        'Insufficient EVA autonomy for continued external task; thermal control margin narrowing.',
        'Abort external EVA task immediately, ingress airlock, and connect Umbilical Power & O2.',
        'Every 2 minutes until airlock repressurized',
        'Immediate Emergency Alert if battery < 10% or suit pressure < 25 kPa'
      );
    } else if (scenario === 'RESOURCE_WATER_LOW') {
      db.prepare(
        `UPDATE spacecraft_resources
         SET water_liters = 1280.0, water_recycling_pct = 74.0, co2_scrubber_health_pct = 76.0, updated_at = ?
         WHERE id = 1`
      ).run(now);
      this.createSystemAlert(
        target.id,
        2,
        'CHANGING',
        'Habitat Water Recovery Efficiency Drift',
        'WRS loop efficiency dropped to 74.0%; potable water reserve at 1,280 L',
        'Extended closed-loop isolation requires >=90% condensate recovery.',
        'Enable Water Conservation mode and inspect Urine Processor Assembly distillation filter.',
        'Inspect telemetry in 2 hours',
        'Notify Earth ECLSS engineering if recovery stays < 80% for > 6 hours'
      );
    } else if (scenario === 'OXYGEN_DROP') {
      db.prepare(
        `UPDATE spacecraft_resources
         SET oxygen_kg = 148.0, o2_generation_kg_day = 4.2, updated_at = ?
         WHERE id = 1`
      ).run(now);
      db.prepare(
        `UPDATE equipment_units
         SET temperature_c = 41.8, vibration_mm_s = 3.15, sensor_reliability_pct = 86.0, status = 'FAULT',
             anomaly_note = 'OGA Electrolysis stack current drop; O2 output fell to 4.2 kg/day.',
             maintenance_recommendation = 'Switch to high-pressure O2 reserve tank & inspect OGA pump.', updated_at = ?
         WHERE unit_code = 'ECLSS-OGA-02'`
      ).run(now);
      r = {
        ...r,
        cabinO2Pct: 18.6,
        spo2Pct: 92.4,
        heartRateBpm: b.heartRateBpm + 22,
        respiratoryRate: b.respiratoryRate + 5,
        symptomsNote: 'Cabin O2 supply reduction drill — mild air hunger (SIMULATED)',
      };
      this.createSystemAlert(
        target.id,
        3,
        'NEEDS ATTENTION',
        'Cabin Oxygen Supply Reduction',
        'Cabin O2 fell to 18.6%; OGA electrolysis output 4.2 kg/day',
        'Reduced partial pressure of oxygen lowers crew SpO2 during sustained operations.',
        'Open high-pressure O2 manifold valve, reduce physical workload, verify OGA fault.',
        'Monitor cabin O2 and crew SpO2 every 5 minutes',
        'Activate Emergency O2 Masks if SpO2 <= 90% or cabin O2 < 18.0%'
      );
    } else if (scenario === 'CABIN_PRESSURE_DROP') {
      db.prepare(
        `UPDATE spacecraft_resources SET cabin_pressure_kpa = 84.5, updated_at = ? WHERE id = 1`
      ).run(now);
      db.prepare(
        `UPDATE equipment_units
         SET temperature_c = 25.4, vibration_mm_s = 2.65, sensor_reliability_pct = 89.5, status = 'FAULT',
             anomaly_note = 'Rapid cabin barometric pressure decay detected (-16.7 kPa delta).',
             maintenance_recommendation = 'Execute hatch seal isolation & leak check per Emergency Depressurization Card.', updated_at = ?
         WHERE unit_code = 'ENV-CABIN-04'`
      ).run(now);
      r = {
        ...r,
        cabinPressureKpa: 84.5,
        spo2Pct: 89.6,
        heartRateBpm: 136,
        respiratoryRate: 25,
        symptomsNote: 'Cabin pressure abnormality / slow leak simulation — emergency protocol drill (SIMULATED)',
      };
      this.createSystemAlert(
        target.id,
        4,
        'NEEDS ATTENTION',
        'Cabin Pressure Abnormality Detected',
        'Cabin pressure fell to 84.5 kPa (nominal 101.2 kPa)',
        'Sustained depressurization causes rapid alveolar hypoxia and barotrauma risk.',
        'Isolate module hatch seals immediately, don emergency O2/pressure mask, notify Mission Control.',
        'Continuous barometric monitoring every 30 seconds',
        'Immediate Emergency Alert active'
      );
    } else if (scenario === 'AST_FATIGUE') {
      r = {
        ...r,
        sleepHours: 4.3,
        stressIndex: 72,
        moodScore: 60,
        heartRateBpm: b.heartRateBpm + 14,
        symptomsNote: 'Cumulative sleep restriction & high EVA workload fatigue drill (SIMULATED)',
      };
      db.prepare(
        `INSERT INTO crew_sleep_logs (astronaut_id, logged_at, sleep_hours, quality_pct, workload_score, fatigue_index, work_hours, rest_hours, note)
         VALUES (?, ?, 4.3, 56, 91, 84, 13.5, 10.5, 'SIMULATED fatigue drill: acute sleep deficit & high workload')`
      ).run(target.id, now);
    } else if (scenario === 'EQUIP_MALFUNCTION') {
      db.prepare(
        `UPDATE equipment_units
         SET temperature_c = 54.6, vibration_mm_s = 4.45, battery_health_pct = 74.0, sensor_reliability_pct = 79.0,
             fault_count = fault_count + 1, status = 'FAULT',
             anomaly_note = 'CDRA blower over-temperature (54.6 °C) and excessive bearing vibration (4.45 mm/s).',
             maintenance_recommendation = 'Shut down primary CDRA blower, engage backup LiOH canister, inspect impeller.',
             updated_at = ?
         WHERE unit_code = 'ECLSS-CDRA-01'`
      ).run(now);
      r = {
        ...r,
        cabinCo2Mmhg: 4.6,
        heartRateBpm: b.heartRateBpm + 15,
        symptomsNote: 'CDRA equipment malfunction simulation — rising cabin CO2 (SIMULATED)',
      };
      this.createSystemAlert(
        target.id,
        3,
        'NEEDS ATTENTION',
        'Equipment Malfunction: CDRA Over-Temp & Vibration',
        'ECLSS-CDRA-01 temperature 54.6 °C, vibration 4.45 mm/s',
        'Blower thermal overload stops closed-loop CO2 scrubbing.',
        'Route airflow to redundant scrubber / LiOH canisters and execute preventive maintenance check.',
        'Monitor cabin ppCO2 every 10 minutes',
        'Trigger Emergency Protocol if ppCO2 >= 6.5 mmHg'
      );
    }

    if (scenario === 'NOMINAL') {
      db.prepare(
        `UPDATE astronaut_suit_telemetry
         SET battery_pct = 94.0, o2_reserve_pct = 96.0, suit_pressure_kpa = 29.6, thermal_loop_c = 18.7,
             co2_scrubber_pct = 95.0, seal_status = 'SEALED', eva_mode = 'STANDBY_IVA', updated_at = ?
         WHERE astronaut_id = ?`
      ).run(now, target.id);
      db.prepare(
        `UPDATE spacecraft_resources
         SET food_days_remaining = 142.0, food_kcal_reserve_pct = 88.4, water_liters = 2480.0,
             water_recycling_pct = 93.5, oxygen_kg = 312.5, o2_generation_kg_day = 9.4,
             co2_scrubber_health_pct = 92.0, cabin_pressure_kpa = 101.2, solar_power_kw = 86.4,
             battery_array_pct = 91.0, updated_at = ?
         WHERE id = 1`
      ).run(now);
      db.prepare(
        `UPDATE equipment_units
         SET temperature_c = CASE WHEN unit_code = 'ECLSS-CDRA-01' THEN 34.2 WHEN unit_code = 'ECLSS-OGA-02' THEN 31.8 ELSE 23.0 END,
             vibration_mm_s = 0.72, sensor_reliability_pct = 98.8, status = 'NOMINAL',
             anomaly_note = 'Operating within nominal mission specification.',
             maintenance_recommendation = 'Routine telemetry check every 24h.', updated_at = ?`
      ).run(now);
    }

    db.prepare('UPDATE astronaut_profiles SET sensors_json = ? WHERE id = ?').run(JSON.stringify(sensors), target.id);
    this.insertReadingAndAlert(r, target.baseline);
    this.broadcast({
      type: 'telemetry:tick',
      ...this.getStatus(),
      astronauts: getFullAstronautProfiles(),
      resources: getSpacecraftResources(),
    });
  }

  public createSystemAlert(
    astronautId: number,
    severityLevel: number,
    status: string,
    title: string,
    whatChanged: string,
    whyItMatters: string,
    whatToDo: string,
    whenToCheckAgain: string,
    escalationRule: string
  ) {
    const existing = db
      .prepare('SELECT id FROM alerts WHERE astronaut_id = ? AND title = ? AND acknowledged = 0 ORDER BY id DESC LIMIT 1')
      .get(astronautId, title) as { id: number } | undefined;
    if (existing) return;

    db.prepare(
      `INSERT INTO alerts (
        astronaut_id, severity_level, status, title, what_changed, why_it_matters, what_to_do,
        when_to_check_again, escalation_rule, acknowledged, earth_notified, pending_sync, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    ).run(
      astronautId,
      severityLevel,
      status,
      title,
      whatChanged,
      whyItMatters,
      whatToDo,
      whenToCheckAgain,
      escalationRule,
      severityLevel >= 3 && this.earthCommsOnline ? 1 : 0,
      severityLevel >= 3 && !this.earthCommsOnline ? 1 : 0,
      new Date().toISOString()
    );
  }

  public applySuitAction(
    astronautId: number,
    action: 'START_PREBREATHE' | 'TOGGLE_EVA' | 'DOCK_RECHARGE' | 'SEAL_CHECK'
  ) {
    const row = db.prepare('SELECT * FROM astronaut_suit_telemetry WHERE astronaut_id = ?').get(astronautId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return;
    const now = new Date().toISOString();
    let battery = Number(row.battery_pct);
    let o2 = Number(row.o2_reserve_pct);
    let pressure = Number(row.suit_pressure_kpa);
    let thermal = Number(row.thermal_loop_c);
    let scrub = Number(row.co2_scrubber_pct);
    let seal = String(row.seal_status);
    let mode = String(row.eva_mode);

    if (action === 'START_PREBREATHE') {
      mode = 'PREBREATHE';
      o2 = Math.max(o2, 95);
      pressure = 70.3; // 10.2 psi depressurization protocol
    } else if (action === 'TOGGLE_EVA') {
      if (mode === 'EVA_ACTIVE') {
        mode = 'STANDBY_IVA';
        pressure = 29.6;
      } else {
        mode = 'EVA_ACTIVE';
        pressure = 29.6;
      }
    } else if (action === 'DOCK_RECHARGE') {
      mode = 'STANDBY_IVA';
      battery = 100;
      o2 = 100;
      scrub = 100;
      pressure = 29.6;
      thermal = 18.6;
      seal = 'SEALED';
    } else if (action === 'SEAL_CHECK') {
      seal = pressure >= 27.5 ? 'SEALED' : 'WARNING';
    }

    db.prepare(
      `UPDATE astronaut_suit_telemetry
       SET battery_pct = ?, o2_reserve_pct = ?, suit_pressure_kpa = ?, thermal_loop_c = ?,
           co2_scrubber_pct = ?, seal_status = ?, eva_mode = ?, updated_at = ?
       WHERE astronaut_id = ?`
    ).run(battery, o2, pressure, thermal, scrub, seal, mode, now, astronautId);

    this.broadcast({
      type: 'telemetry:tick',
      ...this.getStatus(),
      astronauts: getFullAstronautProfiles(),
      resources: getSpacecraftResources(),
    });
  }

  public applyResourceAction(action: 'CONSERVE_WATER' | 'CYCLE_CO2_SCRUBBER' | 'PURGE_CABIN_O2' | 'LOG_RESUPPLY') {
    const res = getSpacecraftResources();
    const now = new Date().toISOString();
    let foodDays = res.foodDaysRemaining;
    let foodPct = res.foodKcalReservePct;
    let water = res.waterLiters;
    let waterRec = res.waterRecyclingPct;
    let o2Kg = res.oxygenKg;
    let o2Gen = res.o2GenerationKgDay;
    let scrub = res.co2ScrubberHealthPct;
    let press = res.cabinPressureKpa;

    if (action === 'CONSERVE_WATER') {
      waterRec = Math.min(98.2, waterRec + 6.5);
    } else if (action === 'CYCLE_CO2_SCRUBBER') {
      scrub = 98.5;
      db.prepare('UPDATE health_readings SET cabin_co2_mmhg = 2.2 WHERE id IN (SELECT MAX(id) FROM health_readings GROUP BY astronaut_id)').run();
    } else if (action === 'PURGE_CABIN_O2') {
      o2Kg = Math.max(0, o2Kg - 2.5);
      o2Gen = 10.6;
      press = 101.3;
    } else if (action === 'LOG_RESUPPLY') {
      foodDays = Math.min(240, foodDays + 45);
      foodPct = 98.0;
      water = Math.min(3400, water + 750);
      waterRec = 95.0;
      o2Kg = Math.min(480, o2Kg + 95);
      scrub = 99.0;
    }

    db.prepare(
      `UPDATE spacecraft_resources
       SET food_days_remaining = ?, food_kcal_reserve_pct = ?, water_liters = ?, water_recycling_pct = ?,
           oxygen_kg = ?, o2_generation_kg_day = ?, co2_scrubber_health_pct = ?, cabin_pressure_kpa = ?, updated_at = ?
       WHERE id = 1`
    ).run(foodDays, foodPct, water, waterRec, o2Kg, o2Gen, scrub, press, now);

    this.broadcast({
      type: 'telemetry:tick',
      ...this.getStatus(),
      astronauts: getFullAstronautProfiles(),
      resources: getSpacecraftResources(),
    });
  }

  public insertReadingAndAlert(reading: Omit<HealthReading, 'id'>, baseline: PersonalBaseline) {
    db.prepare(
      `INSERT INTO health_readings (
        astronaut_id, recorded_at, source, heart_rate_bpm, systolic_bp, diastolic_bp, spo2_pct,
        body_temp_c, respiratory_rate, sleep_hours, stress_index, mood_score, activity_mins,
        bone_muscle_index, immune_score, radiation_msv_day, cabin_o2_pct, cabin_co2_mmhg,
        cabin_temp_c, cabin_humidity_pct, cabin_pressure_kpa, ecg_rhythm, ecg_st_mv, symptoms_note, is_simulated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      reading.astronautId,
      reading.recordedAt,
      reading.source,
      reading.heartRateBpm,
      reading.systolicBp,
      reading.diastolicBp,
      reading.spo2Pct,
      reading.bodyTempC,
      reading.respiratoryRate,
      reading.sleepHours,
      reading.stressIndex,
      reading.moodScore,
      reading.activityMins,
      reading.boneMuscleIndex,
      reading.immuneScore,
      reading.radiationMsvDay,
      reading.cabinO2Pct,
      reading.cabinCo2Mmhg,
      reading.cabinTempC,
      reading.cabinHumidityPct,
      reading.cabinPressureKpa,
      reading.ecgRhythm,
      reading.ecgStMv,
      reading.symptomsNote || null,
      reading.isSimulated ? 1 : 0
    );

    const assessment = evaluateAstronautHealth(reading, baseline);
    db.prepare(
      'INSERT INTO health_assessments (astronaut_id, status, severity_level, summary, evaluated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(reading.astronautId, assessment.status, assessment.severityLevel, assessment.summary, assessment.evaluatedAt);

    if (assessment.severityLevel >= 2) {
      const existingUnacked = db
        .prepare('SELECT id FROM alerts WHERE astronaut_id = ? AND severity_level = ? AND acknowledged = 0 ORDER BY id DESC LIMIT 1')
        .get(reading.astronautId, assessment.severityLevel) as { id: number } | undefined;

      if (!existingUnacked) {
        db.prepare(
          `INSERT INTO alerts (
            astronaut_id, severity_level, status, title, what_changed, why_it_matters, what_to_do,
            when_to_check_again, escalation_rule, acknowledged, earth_notified, pending_sync, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
        ).run(
          reading.astronautId,
          assessment.severityLevel,
          assessment.status,
          assessment.severityLabel,
          assessment.mainIndicators.join(' · '),
          assessment.summary,
          assessment.recommendedActions[0] || 'Follow mission medical protocol.',
          assessment.monitoringInterval,
          assessment.whenToEscalate,
          assessment.earthMedicalSupportRequired && this.earthCommsOnline ? 1 : 0,
          assessment.earthMedicalSupportRequired && !this.earthCommsOnline ? 1 : 0,
          reading.recordedAt
        );
      }
    }

    return assessment;
  }

  public start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      if (this.mode !== 'SIMULATION') return;
      this.tickCounter += 1;

      const profiles = getFullAstronautProfiles();
      const now = new Date().toISOString();

      for (const p of profiles) {
        if (!p.privacyConsent.allowDatabaseStorage) continue;
        const prev = p.latestReading;
        const b = p.baseline;
        const jitter = Math.sin(this.tickCounter * 0.4 + p.id) * 1.4;

        // Gently keep active scenario perturbations alive on Crew 1 if non-nominal
        const holdScenario = p.id === 1 && this.scenario !== 'NOMINAL';
        const nextReading: Omit<HealthReading, 'id'> = {
          astronautId: p.id,
          recordedAt: now,
          source: 'SIMULATION',
          heartRateBpm: Number(((holdScenario ? prev.heartRateBpm : b.heartRateBpm) + jitter).toFixed(1)),
          systolicBp: Number(((holdScenario ? prev.systolicBp : b.systolicBp) + jitter * 0.8).toFixed(1)),
          diastolicBp: Number(((holdScenario ? prev.diastolicBp : b.diastolicBp) + jitter * 0.5).toFixed(1)),
          spo2Pct: Number(Math.min(100, Math.max(85, (holdScenario ? prev.spo2Pct : b.spo2Pct) + Math.cos(this.tickCounter) * 0.15)).toFixed(1)),
          bodyTempC: Number(((holdScenario ? prev.bodyTempC : b.bodyTempC) + Math.sin(this.tickCounter * 0.2) * 0.04).toFixed(2)),
          respiratoryRate: Number(((holdScenario ? prev.respiratoryRate : b.respiratoryRate) + Math.cos(this.tickCounter * 0.5) * 0.4).toFixed(1)),
          sleepHours: prev.sleepHours,
          stressIndex: Number(Math.max(10, Math.min(95, (holdScenario ? prev.stressIndex : b.stressIndex) + jitter)).toFixed(1)),
          moodScore: prev.moodScore,
          activityMins: prev.activityMins,
          boneMuscleIndex: prev.boneMuscleIndex,
          immuneScore: prev.immuneScore,
          radiationMsvDay: Number(((holdScenario ? prev.radiationMsvDay : b.radiationMsvDay) + Math.abs(jitter) * 0.01).toFixed(3)),
          cabinO2Pct: prev.cabinO2Pct,
          cabinCo2Mmhg: Number(((holdScenario ? prev.cabinCo2Mmhg : b.cabinCo2Mmhg) + Math.sin(this.tickCounter * 0.3) * 0.05).toFixed(2)),
          cabinTempC: b.cabinTempC,
          cabinHumidityPct: b.cabinHumidityPct,
          cabinPressureKpa: b.cabinPressureKpa,
          ecgRhythm: prev.ecgRhythm,
          ecgStMv: prev.ecgStMv,
          symptomsNote: holdScenario ? prev.symptomsNote : undefined,
          isSimulated: true,
        };

        this.insertReadingAndAlert(nextReading, b);

        // Gently update EVA suit battery/O2 or IVA recharge
        const s = p.suit;
        const nextBat =
          s.evaMode === 'EVA_ACTIVE'
            ? Math.max(5, s.batteryPct - 0.18)
            : s.evaMode === 'PREBREATHE'
            ? Math.max(15, s.batteryPct - 0.05)
            : Math.min(100, s.batteryPct + 0.08);
        const nextO2 =
          s.evaMode === 'EVA_ACTIVE'
            ? Math.max(8, s.o2ReservePct - 0.15)
            : Math.min(100, s.o2ReservePct + 0.05);
        db.prepare(
          'UPDATE astronaut_suit_telemetry SET battery_pct = ?, o2_reserve_pct = ?, updated_at = ? WHERE astronaut_id = ?'
        ).run(Number(nextBat.toFixed(1)), Number(nextO2.toFixed(1)), now, p.id);
      }

      // Gently simulate solar orbital array + water/O2 closed-loop tick
      const res = getSpacecraftResources();
      const solarWave = 82 + Math.sin(this.tickCounter * 0.25) * 14;
      const arrayBat = Math.min(100, Math.max(55, 88 + Math.sin(this.tickCounter * 0.25) * 9));
      const netWater = Math.max(500, res.waterLiters - (100 - res.waterRecyclingPct) * 0.015);
      const netO2 = Math.max(40, res.oxygenKg + (res.o2GenerationKgDay - 8.9) * 0.002);
      db.prepare(
        `UPDATE spacecraft_resources
         SET water_liters = ?, oxygen_kg = ?, solar_power_kw = ?, battery_array_pct = ?, updated_at = ?
         WHERE id = 1`
      ).run(Number(netWater.toFixed(1)), Number(netO2.toFixed(2)), Number(solarWave.toFixed(1)), Number(arrayBat.toFixed(1)), now);

      // 7-day retention pruning
      const cutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      db.prepare('DELETE FROM health_readings WHERE recorded_at < ?').run(cutoff);

      this.broadcast({
        type: 'telemetry:tick',
        ...this.getStatus(),
        astronauts: getFullAstronautProfiles(),
        resources: getSpacecraftResources(),
      });
    }, 5000);
  }

  public broadcast(payload: unknown) {
    const raw = JSON.stringify(payload);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    });
  }
}

export const monitorEngine = new MonitorEngine();
