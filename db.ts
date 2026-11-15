import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'astrocare.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const hashBuf = Buffer.from(hash, 'hex');
  if (derived.length !== hashBuf.length) return false;
  return crypto.timingSafeEqual(derived, hashBuf);
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      astronaut_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS astronaut_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_sign TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      mission_role TEXT NOT NULL,
      mission_name TEXT NOT NULL,
      mission_day INTEGER NOT NULL,
      age INTEGER NOT NULL,
      blood_type TEXT NOT NULL,
      sensors_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personal_baselines (
      astronaut_id INTEGER PRIMARY KEY REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      heart_rate_bpm REAL NOT NULL,
      systolic_bp REAL NOT NULL,
      diastolic_bp REAL NOT NULL,
      spo2_pct REAL NOT NULL,
      body_temp_c REAL NOT NULL,
      respiratory_rate REAL NOT NULL,
      sleep_hours REAL NOT NULL,
      stress_index REAL NOT NULL,
      mood_score REAL NOT NULL,
      activity_mins REAL NOT NULL,
      bone_muscle_index REAL NOT NULL,
      immune_score REAL NOT NULL,
      radiation_msv_day REAL NOT NULL,
      cabin_o2_pct REAL NOT NULL,
      cabin_co2_mmhg REAL NOT NULL,
      cabin_temp_c REAL NOT NULL,
      cabin_humidity_pct REAL NOT NULL,
      cabin_pressure_kpa REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      recorded_at TEXT NOT NULL,
      source TEXT NOT NULL,
      heart_rate_bpm REAL NOT NULL,
      systolic_bp REAL NOT NULL,
      diastolic_bp REAL NOT NULL,
      spo2_pct REAL NOT NULL,
      body_temp_c REAL NOT NULL,
      respiratory_rate REAL NOT NULL,
      sleep_hours REAL NOT NULL,
      stress_index REAL NOT NULL,
      mood_score REAL NOT NULL,
      activity_mins REAL NOT NULL,
      bone_muscle_index REAL NOT NULL,
      immune_score REAL NOT NULL,
      radiation_msv_day REAL NOT NULL,
      cabin_o2_pct REAL NOT NULL,
      cabin_co2_mmhg REAL NOT NULL,
      cabin_temp_c REAL NOT NULL,
      cabin_humidity_pct REAL NOT NULL,
      cabin_pressure_kpa REAL NOT NULL,
      ecg_rhythm TEXT NOT NULL DEFAULT 'Normal Sinus Rhythm',
      ecg_st_mv REAL NOT NULL DEFAULT 0.02,
      symptoms_note TEXT,
      is_simulated INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_readings_astro_time ON health_readings(astronaut_id, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS medical_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      recorded_date TEXT NOT NULL,
      entry TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      severity_level INTEGER NOT NULL,
      summary TEXT NOT NULL,
      evaluated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      severity_level INTEGER NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      what_changed TEXT NOT NULL,
      why_it_matters TEXT NOT NULL,
      what_to_do TEXT NOT NULL,
      when_to_check_again TEXT NOT NULL,
      escalation_rule TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      earth_notified INTEGER NOT NULL DEFAULT 0,
      pending_sync INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS radiation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      recorded_at TEXT NOT NULL,
      dose_msv_day REAL NOT NULL,
      cumulative_msv REAL NOT NULL,
      event_type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS environmental_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at TEXT NOT NULL,
      cabin_o2_pct REAL NOT NULL,
      cabin_co2_mmhg REAL NOT NULL,
      cabin_temp_c REAL NOT NULL,
      cabin_humidity_pct REAL NOT NULL,
      cabin_pressure_kpa REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sleep_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      night_date TEXT NOT NULL,
      hours REAL NOT NULL,
      quality_pct INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medicine_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      contraindications TEXT NOT NULL,
      indication TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medical_protocols (
      code TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      severity_scope TEXT NOT NULL,
      summary TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      source_ref TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medical_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      reported_at TEXT NOT NULL,
      summary TEXT NOT NULL,
      severity_level INTEGER NOT NULL,
      status TEXT NOT NULL,
      clinician_note TEXT,
      reviewed_by TEXT
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      report_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      summary TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS synchronisation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS privacy_consents (
      astronaut_id INTEGER PRIMARY KEY REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      allow_database_storage INTEGER NOT NULL DEFAULT 1,
      allow_earth_transmission INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS astronaut_suit_telemetry (
      astronaut_id INTEGER PRIMARY KEY REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      suit_id TEXT NOT NULL,
      battery_pct REAL NOT NULL,
      o2_reserve_pct REAL NOT NULL,
      suit_pressure_kpa REAL NOT NULL,
      thermal_loop_c REAL NOT NULL,
      co2_scrubber_pct REAL NOT NULL,
      seal_status TEXT NOT NULL,
      eva_mode TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spacecraft_resources (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      food_days_remaining REAL NOT NULL,
      food_kcal_reserve_pct REAL NOT NULL,
      water_liters REAL NOT NULL,
      water_recycling_pct REAL NOT NULL,
      oxygen_kg REAL NOT NULL,
      o2_generation_kg_day REAL NOT NULL,
      co2_scrubber_health_pct REAL NOT NULL,
      cabin_pressure_kpa REAL NOT NULL,
      solar_power_kw REAL NOT NULL,
      battery_array_pct REAL NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crew_sleep_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      logged_at TEXT NOT NULL,
      sleep_hours REAL NOT NULL,
      quality_pct INTEGER NOT NULL,
      workload_score INTEGER NOT NULL,
      fatigue_index INTEGER NOT NULL,
      work_hours REAL NOT NULL,
      rest_hours REAL NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS crew_exercise_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      logged_at TEXT NOT NULL,
      device TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      load_kg REAL NOT NULL,
      strength_score INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS crew_vision_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      recorded_at TEXT NOT NULL,
      visual_acuity_left TEXT NOT NULL,
      visual_acuity_right TEXT NOT NULL,
      near_shift_diopter REAL NOT NULL,
      symptoms_json TEXT NOT NULL,
      warning_triggered INTEGER NOT NULL DEFAULT 0,
      clinician_recommendation TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crew_mental_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER NOT NULL REFERENCES astronaut_profiles(id) ON DELETE CASCADE,
      recorded_at TEXT NOT NULL,
      mood_score INTEGER NOT NULL,
      stress_level INTEGER NOT NULL,
      workload_rating INTEGER NOT NULL,
      sleep_hours REAL NOT NULL,
      private_note TEXT NOT NULL,
      is_private INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS equipment_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      subsystem TEXT NOT NULL,
      temperature_c REAL NOT NULL,
      vibration_mm_s REAL NOT NULL,
      battery_health_pct REAL NOT NULL,
      sensor_reliability_pct REAL NOT NULL,
      fault_count INTEGER NOT NULL DEFAULT 0,
      fault_history_json TEXT NOT NULL,
      status TEXT NOT NULL,
      anomaly_note TEXT NOT NULL,
      maintenance_recommendation TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pre_mission_medical_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      astronaut_id INTEGER REFERENCES astronaut_profiles(id) ON DELETE SET NULL,
      candidate_name TEXT NOT NULL,
      call_sign TEXT NOT NULL,
      age INTEGER NOT NULL,
      blood_type TEXT NOT NULL,
      target_mission TEXT NOT NULL,
      mission_role TEXT NOT NULL,
      mission_duration_days INTEGER NOT NULL,
      eva_planned INTEGER NOT NULL DEFAULT 1,
      resting_hr_bpm REAL NOT NULL,
      systolic_bp REAL NOT NULL,
      diastolic_bp REAL NOT NULL,
      spo2_pct REAL NOT NULL,
      ecg_summary TEXT NOT NULL,
      exercise_clearance TEXT NOT NULL,
      near_vision_diopter REAL NOT NULL,
      vestibular_ent_status TEXT NOT NULL,
      bone_density_z_score REAL NOT NULL,
      lab_panel_status TEXT NOT NULL,
      immunizations_current INTEGER NOT NULL DEFAULT 1,
      allergies_text TEXT NOT NULL,
      medications_text TEXT NOT NULL,
      medical_history_summary TEXT NOT NULL,
      attachment_name TEXT,
      attachment_mime TEXT,
      attachment_size_bytes INTEGER,
      attachment_data_base64 TEXT,
      screening_result TEXT NOT NULL,
      screening_flags_json TEXT NOT NULL,
      clearance_status TEXT NOT NULL,
      consent_to_store INTEGER NOT NULL DEFAULT 1,
      consent_to_share_flight_surgeon INTEGER NOT NULL DEFAULT 1,
      clinician_note TEXT,
      reviewed_by TEXT,
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT
    );
  `);

  const roleCount = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c;
  if (roleCount === 0) {
    const insertRole = db.prepare('INSERT INTO roles (name) VALUES (?)');
    ['Astronaut', 'Doctor', 'Mission Control', 'Administrator'].forEach((r) => insertRole.run(r));
  }

  const astroCount = (db.prepare('SELECT COUNT(*) as c FROM astronaut_profiles').get() as { c: number }).c;
  if (astroCount === 0) {
    const now = new Date().toISOString();
    const defaultSensors = JSON.stringify({
      heartRate: 'ONLINE',
      spo2: 'ONLINE',
      sleep: 'ONLINE',
      radiation: 'ONLINE',
      cabinEnv: 'ONLINE',
    });

    const insertAstro = db.prepare(
      `INSERT INTO astronaut_profiles (call_sign, full_name, mission_role, mission_name, mission_day, age, blood_type, sensors_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertBaseline = db.prepare(
      `INSERT INTO personal_baselines (
        astronaut_id, heart_rate_bpm, systolic_bp, diastolic_bp, spo2_pct, body_temp_c,
        respiratory_rate, sleep_hours, stress_index, mood_score, activity_mins,
        bone_muscle_index, immune_score, radiation_msv_day, cabin_o2_pct, cabin_co2_mmhg,
        cabin_temp_c, cabin_humidity_pct, cabin_pressure_kpa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertConsent = db.prepare(
      `INSERT INTO privacy_consents (astronaut_id, allow_database_storage, allow_earth_transmission, updated_at)
       VALUES (?, 1, 1, ?)`
    );

    const crew = [
      {
        callSign: 'CDR-01',
        name: 'Cmdr. Elena Vance',
        role: 'Mission Commander',
        mission: 'ARES-IV Transit / ISS-LEO Prep',
        day: 140,
        age: 39,
        blood: 'O+',
        b: [64, 116, 74, 98.5, 36.7, 14, 7.2, 24, 84, 95, 94, 92, 0.42, 20.9, 2.2, 21.8, 44, 101.2],
      },
      {
        callSign: 'FLT-02',
        name: 'Dr. Aris Thorne',
        role: 'Crew Medical Officer',
        mission: 'ARES-IV Transit / ISS-LEO Prep',
        day: 140,
        age: 42,
        blood: 'A+',
        b: [68, 120, 78, 98.1, 36.8, 15, 7.0, 28, 82, 85, 92, 90, 0.42, 20.9, 2.2, 21.8, 44, 101.2],
      },
      {
        callSign: 'SCI-03',
        name: 'Lt. Maya Patel',
        role: 'Biomedical Payload Specialist',
        mission: 'ARES-IV Transit / ISS-LEO Prep',
        day: 140,
        age: 34,
        blood: 'B+',
        b: [61, 112, 72, 98.8, 36.6, 13, 7.5, 22, 86, 100, 95, 94, 0.42, 20.9, 2.2, 21.8, 44, 101.2],
      },
      {
        callSign: 'ENG-04',
        name: 'Eng. Kenji Sato',
        role: 'ECLSS Systems Engineer',
        mission: 'ARES-IV Transit / ISS-LEO Prep',
        day: 140,
        age: 37,
        blood: 'AB-',
        b: [66, 118, 76, 98.2, 36.7, 14, 7.1, 26, 83, 90, 93, 91, 0.42, 20.9, 2.2, 21.8, 44, 101.2],
      },
    ];

    crew.forEach((c) => {
      const res = insertAstro.run(c.callSign, c.name, c.role, c.mission, c.day, c.age, c.blood, defaultSensors);
      const id = Number(res.lastInsertRowid);
      insertBaseline.run(id, ...c.b);
      insertConsent.run(id, now);
      db.prepare('INSERT INTO medical_history (astronaut_id, recorded_date, entry) VALUES (?, ?, ?)').run(
        id,
        'Day 001',
        'Pre-flight baseline telemetry certified nominal by NASA Flight Surgeon.'
      );
      db.prepare('INSERT INTO medical_history (astronaut_id, recorded_date, entry) VALUES (?, ?, ?)').run(
        id,
        'Day 120',
        'ARED resistive load exercise and quarterly blood/immune screening within nominal envelope.'
      );
    });
  }

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount === 0) {
    const getRoleId = (name: string) =>
      (db.prepare('SELECT id FROM roles WHERE name = ?').get(name) as { id: number }).id;
    const now = new Date().toISOString();
    const pass = hashPassword('AstroCare2026!');
    const insertUser = db.prepare(
      'INSERT INTO users (email, password_hash, full_name, role_id, astronaut_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insertUser.run('astronaut@astrocare.space', pass, 'Cmdr. Elena Vance', getRoleId('Astronaut'), 1, now);
    insertUser.run('doctor@astrocare.space', pass, 'Dr. Marcus Lin (Flight Surgeon)', getRoleId('Doctor'), null, now);
    insertUser.run('control@astrocare.space', pass, 'Flight Dir. Sarah Chen', getRoleId('Mission Control'), null, now);
    insertUser.run('admin@astrocare.space', pass, 'ASTROCARE Systems Admin', getRoleId('Administrator'), null, now);
  }

  const protoCount = (db.prepare('SELECT COUNT(*) as c FROM medical_protocols').get() as { c: number }).c;
  if (protoCount === 0) {
    const insertProto = db.prepare(
      `INSERT INTO medical_protocols (code, title, category, severity_scope, summary, steps_json, source_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const protocols = [
      [
        'NASA-MED-01',
        'Hypercapnia & Cabin CO2 Elevation Response',
        'Environmental / Pulmonary',
        'LEVEL 2-4',
        'Immediate cabin atmosphere verification and crew respiratory protection protocol when ppCO2 exceeds 3.5 mmHg.',
        JSON.stringify([
          'Verify CDRA CO2 scrubber bed telemetry and secondary LiOH canisters.',
          'Suspend strenuous ARED/CEVIS exercise until ppCO2 stabilizes below 3.0 mmHg.',
          'Monitor SpO2, respiratory rate, and headache symptoms every 15 minutes.',
          'Escalate to Flight Surgeon and relocate crew if ppCO2 exceeds 5.0 mmHg or SpO2 drops below 92%.',
        ]),
        'NASA STD-3001 Vol. 2 Rev. C',
      ],
      [
        'NASA-MED-02',
        'Solar Particle Event (SPE) & Radiation Storm Shelter',
        'Radiation Protection',
        'LEVEL 3-4',
        'Crew dosimetry shielding and exposure reduction protocol during elevated solar flux.',
        JSON.stringify([
          'Relocate immediately to high-density polyethylene / water-wall storm shelter.',
          'Verify personal active dosimeter and TEPC readings every 30 minutes.',
          'Maintain hydration and log any acute GI or fatigue symptoms.',
          'Await Flight Surgeon & Space Weather clear-to-exit authorization.',
        ]),
        'NASA JSC Space Radiation Health Guidelines',
      ],
      [
        'NASA-MED-03',
        'Cardiovascular Orthostatic & Arrhythmia Triage',
        'Cardiovascular',
        'LEVEL 2-4',
        'Evaluation of tachycardia, ST-segment shift, or blood pressure instability in microgravity.',
        JSON.stringify([
          'Cease physical exertion and enter seated/restrained rest posture.',
          'Acquire 12-lead / Lead-II ECG strip and repeat blood pressure after 5 minutes.',
          'Assess fluid intake status; avoid rapid fluid loading if hypertensive.',
          'Transmit ECG packet to Earth Flight Surgeon immediately for Level 3-4 findings.',
        ]),
        'NASA ISS Medical Checklist Card 4-02',
      ],
      [
        'NASA-MED-04',
        'Circadian & Behavioral Health Support Protocol',
        'Behavioral / Sleep',
        'LEVEL 1-2',
        'Structured countermeasures for chronic sleep restriction, confinement stress, and circadian drift.',
        JSON.stringify([
          'Enforce 8.5-hour protected sleep window with blue-depleted cabin lighting.',
          'Complete 10-minute paced respiratory decompression (4-7-8 or box breathing).',
          'Schedule private crew-family or Ground Behavioral Health conference.',
          'Reassess sleep duration and mood index next morning.',
        ]),
        'NASA Behavioral Health & Performance (BHP) Manual',
      ],
      [
        'NASA-MED-05',
        'Altered-Gravity Musculoskeletal Countermeasure',
        'Bone & Muscle',
        'LEVEL 1-2',
        'Prevention of microgravity bone mineral density loss and skeletal muscle atrophy.',
        JSON.stringify([
          'Complete scheduled ARED resistive loading and T2/CEVIS aerobic session if medically cleared.',
          'Verify daily Vitamin D3 and calcium nutritional protocol compliance.',
          'Log joint soreness or muscle fatigue before escalating load.',
        ]),
        'NASA Bone & Muscle Countermeasure Operations',
      ],
    ];
    protocols.forEach((p) => insertProto.run(...p));
  }

  const medCount = (db.prepare('SELECT COUNT(*) as c FROM medicine_inventory').get() as { c: number }).c;
  if (medCount === 0) {
    const insertMed = db.prepare(
      `INSERT INTO medicine_inventory (name, category, quantity, unit, expiry_date, contraindications, indication)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const meds = [
      ['Acetaminophen 500mg', 'Analgesic / Antipyretic', 48, 'tablets', '2027-08-15', 'Severe hepatic impairment', 'Mild headache or fever after Flight Surgeon review'],
      ['Zolpidem / Melatonin Protocol Pack', 'Sleep Regulation', 24, 'doses', '2027-05-30', 'Concurrent sedatives or critical EVA shift', 'Circadian sleep disruption under clinician authorization'],
      ['Oral Rehydration Electrolyte Salts', 'Fluid / Electrolytes', 60, 'sachets', '2028-01-10', 'Severe uncontrolled hypertension or fluid overload', 'Orthostatic dehydration support'],
      ['Ondansetron ODT 4mg', 'Antiemetic', 18, 'tablets', '2027-11-20', 'QT prolongation risk', 'Space adaptation / acute nausea per protocol'],
      ['Potassium Citrate 10mEq', 'Renal / Bone Support', 40, 'tablets', '2026-12-15', 'Hyperkalemia or renal insufficiency', 'Renal stone prophylaxis during bone resorption'],
      ['Epinephrine Auto-Injector 0.3mg', 'Emergency Anaphylaxis', 4, 'pens', '2027-03-01', 'None in life-threatening anaphylaxis', 'Emergency airway/shock per NASA-MED protocol'],
    ];
    meds.forEach((m) => insertMed.run(...m));
  }

  const suitCount = (db.prepare('SELECT COUNT(*) as c FROM astronaut_suit_telemetry').get() as { c: number }).c;
  if (suitCount === 0) {
    const astroIds = db.prepare('SELECT id FROM astronaut_profiles ORDER BY id ASC').all() as Array<{ id: number }>;
    const insertSuit = db.prepare(
      `INSERT INTO astronaut_suit_telemetry (
        astronaut_id, suit_id, battery_pct, o2_reserve_pct, suit_pressure_kpa,
        thermal_loop_c, co2_scrubber_pct, seal_status, eva_mode, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    astroIds.forEach((row, idx) => {
      insertSuit.run(
        row.id,
        `xEMU-0${row.id}`,
        94 - idx * 2,
        96 - idx,
        29.6,
        18.6 + idx * 0.2,
        95 - idx,
        'SEALED',
        'STANDBY_IVA',
        now
      );
    });
  }

  const resCount = (db.prepare('SELECT COUNT(*) as c FROM spacecraft_resources').get() as { c: number }).c;
  if (resCount === 0) {
    db.prepare(
      `INSERT INTO spacecraft_resources (
        id, food_days_remaining, food_kcal_reserve_pct, water_liters, water_recycling_pct,
        oxygen_kg, o2_generation_kg_day, co2_scrubber_health_pct, cabin_pressure_kpa,
        solar_power_kw, battery_array_pct, updated_at
      ) VALUES (1, 142.0, 88.4, 2480.0, 93.5, 312.5, 9.4, 92.0, 101.2, 86.4, 91.0, ?)`
    ).run(new Date().toISOString());
  }

  seedWellbeingAndEquipmentIfNeeded();
  backfillSevenDayReadingsIfNeeded();
}

function seedWellbeingAndEquipmentIfNeeded() {
  const now = Date.now();
  const astroRows = db.prepare('SELECT id FROM astronaut_profiles ORDER BY id ASC').all() as Array<{ id: number }>;

  const sleepCount = (db.prepare('SELECT COUNT(*) as c FROM crew_sleep_logs').get() as { c: number }).c;
  if (sleepCount === 0) {
    const insSleep = db.prepare(
      `INSERT INTO crew_sleep_logs (astronaut_id, logged_at, sleep_hours, quality_pct, workload_score, fatigue_index, work_hours, rest_hours, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    astroRows.forEach((a) => {
      [5, 4, 3, 2, 1, 0].forEach((daysAgo, i) => {
        const ts = new Date(now - daysAgo * 86400_000).toISOString();
        const sleepH = Number((7.4 - (i % 3) * 0.45 - (a.id === 2 && i > 3 ? 0.8 : 0)).toFixed(1));
        const quality = Math.max(62, Math.round(90 - (i % 3) * 6 - (7.4 - sleepH) * 8));
        const workload = Math.min(92, 54 + i * 4);
        const fatigue = Math.max(12, Math.min(88, Math.round(workload * 0.45 + (8 - sleepH) * 14)));
        insSleep.run(
          a.id,
          ts,
          sleepH,
          quality,
          workload,
          fatigue,
          Number((8.5 + (i % 2) * 1.2).toFixed(1)),
          Number((15.5 - (8.5 + (i % 2) * 1.2)).toFixed(1)),
          daysAgo === 0 ? 'Scheduled protected sleep window logged.' : 'Circadian actigraphy sync (SIMULATED).'
        );
      });
    });
  }

  const exCount = (db.prepare('SELECT COUNT(*) as c FROM crew_exercise_logs').get() as { c: number }).c;
  if (exCount === 0) {
    const insEx = db.prepare(
      `INSERT INTO crew_exercise_logs (astronaut_id, logged_at, device, exercise_name, duration_min, load_kg, strength_score, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    astroRows.forEach((a) => {
      const entries: Array<[number, 'ARED' | 'T2_TREADMILL' | 'CEVIS', string, number, number, number]> = [
        [4, 'ARED', 'ARED Squat & Heel Raise Protocol', 45, 92, 94],
        [3, 'T2_TREADMILL', 'T2 Loaded Harness Run (5.2 km)', 35, 68, 93],
        [2, 'ARED', 'ARED Deadlift & Bench Countermeasure', 50, 98, 95],
        [1, 'CEVIS', 'CEVIS Aerobic Interval Cycle', 40, 45, 92],
        [0, 'ARED', 'ARED Core & Lumbar Axial Loading', 45, 94, 94],
      ];
      entries.forEach(([daysAgo, dev, name, dur, load, str]) => {
        insEx.run(a.id, new Date(now - daysAgo * 86400_000).toISOString(), dev, name, dur, load, str, 1);
      });
    });
  }

  const visCount = (db.prepare('SELECT COUNT(*) as c FROM crew_vision_logs').get() as { c: number }).c;
  if (visCount === 0) {
    const insVis = db.prepare(
      `INSERT INTO crew_vision_logs (astronaut_id, recorded_at, visual_acuity_left, visual_acuity_right, near_shift_diopter, symptoms_json, warning_triggered, clinician_recommendation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    astroRows.forEach((a) => {
      insVis.run(
        a.id,
        new Date(now - 30 * 86400_000).toISOString(),
        '20/20',
        '20/20',
        0.0,
        JSON.stringify([]),
        0,
        'Baseline pre-mission ophthalmic & OCT optic-disc check nominal.'
      );
      insVis.run(
        a.id,
        new Date(now - 3 * 86400_000).toISOString(),
        a.id === 1 ? '20/25' : '20/20',
        '20/20',
        a.id === 1 ? 0.5 : 0.25,
        JSON.stringify(a.id === 1 ? ['Mild near-focus blur after sleep'] : []),
        0,
        a.id === 1
          ? 'Monitor near-acuity and schedule non-urgent Fundoscope / OCT imaging at weekly medical conference.'
          : 'Routine SANS visual acuity & choroidal fold screening nominal.'
      );
    });
  }

  const mentalCount = (db.prepare('SELECT COUNT(*) as c FROM crew_mental_checkins').get() as { c: number }).c;
  if (mentalCount === 0) {
    const insMental = db.prepare(
      `INSERT INTO crew_mental_checkins (astronaut_id, recorded_at, mood_score, stress_level, workload_rating, sleep_hours, private_note, is_private)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    astroRows.forEach((a) => {
      insMental.run(
        a.id,
        new Date(now - 2 * 86400_000).toISOString(),
        84,
        24,
        58,
        7.3,
        'Private reflection: Steady crew rhythm during orbital maintenance cycle.',
        1
      );
      insMental.run(
        a.id,
        new Date(now - 86400_000).toISOString(),
        81,
        28,
        64,
        7.0,
        'Private reflection: Heavy cargo transfer day; evening breathing session helped.',
        1
      );
    });
  }

  const equipCount = (db.prepare('SELECT COUNT(*) as c FROM equipment_units').get() as { c: number }).c;
  if (equipCount === 0) {
    const insEq = db.prepare(
      `INSERT INTO equipment_units (
        unit_code, name, subsystem, temperature_c, vibration_mm_s, battery_health_pct,
        sensor_reliability_pct, fault_count, fault_history_json, status, anomaly_note, maintenance_recommendation, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const ts = new Date(now).toISOString();
    const units: Array<[string, string, string, number, number, number, number, number, Array<{ timestamp: string; code: string; detail: string }>, string, string, string]> = [
      [
        'ECLSS-CDRA-01',
        'CO2 Removal Assembly (CDRA)',
        'ECLSS',
        34.2,
        1.15,
        96.0,
        98.5,
        0,
        [],
        'NOMINAL',
        'Desiccant & sorbent bed thermal cycling within nominal tolerance.',
        'Next routine valve inspection in 14 days.',
      ],
      [
        'ECLSS-OGA-02',
        'Oxygen Generation Assembly (OGA)',
        'ECLSS',
        31.8,
        1.42,
        94.0,
        97.8,
        1,
        [{ timestamp: new Date(now - 9 * 86400_000).toISOString(), code: 'H2O-FEED-WARN', detail: 'Transient feedwater pressure ripple cleared after filter flush.' }],
        'NOMINAL',
        'Electrolysis cell stack operating steadily at 9.4 kg O2/day equivalent.',
        'Monitor rotary separator vibration every 24h.',
      ],
      [
        'SUIT-xEMU-01',
        'xEMU Spacesuit Power & Thermal Loop',
        'SPACESUIT',
        21.4,
        0.65,
        94.2,
        99.1,
        0,
        [],
        'NOMINAL',
        'Sublimator coolant loop and primary Li-ion battery SOH healthy.',
        'Perform seal integrity check prior to EVA prebreathe.',
      ],
      [
        'EPS-ARRAY-03',
        'Solar Array Rotary Joint & Battery Bank',
        'POWER',
        28.9,
        2.15,
        91.0,
        96.2,
        1,
        [{ timestamp: new Date(now - 4 * 86400_000).toISOString(), code: 'SARJ-VIB-WATCH', detail: 'Slight harmonic vibration uptick during orbital night transition.' }],
        'DEGRADED',
        'SARJ bearing vibration slightly above 2.0 mm/s baseline watch threshold.',
        'Inspect telemetry trend & run lubrication diagnostic window.',
      ],
      [
        'ENV-CABIN-04',
        'Cabin Pressure & Barometric Manifold',
        'ECLSS',
        21.9,
        0.48,
        99.0,
        99.4,
        0,
        [],
        'NOMINAL',
        'Dual redundant pressure transducers agree within 0.05 kPa.',
        'Nominal continuous monitoring.',
      ],
      [
        'RAD-TEPC-05',
        'Tissue Equivalent Proportional Counter (TEPC)',
        'DOSIMETRY',
        23.1,
        0.22,
        97.5,
        99.0,
        0,
        [],
        'NOMINAL',
        'Active radiation flux detector calibrated for GCR & SPE monitoring.',
        'Verify weekly zero-offset calibration.',
      ],
    ];

    units.forEach((u) => {
      insEq.run(u[0], u[1], u[2], u[3], u[4], u[5], u[6], u[7], JSON.stringify(u[8]), u[9], u[10], u[11], ts);
    });
  }
}

export function backfillSevenDayReadingsIfNeeded() {
  const count = (db.prepare('SELECT COUNT(*) as c FROM health_readings').get() as { c: number }).c;
  if (count > 0) return;

  const baselines = db.prepare('SELECT * FROM personal_baselines').all() as Array<Record<string, number>>;
  const insert = db.prepare(
    `INSERT INTO health_readings (
      astronaut_id, recorded_at, source, heart_rate_bpm, systolic_bp, diastolic_bp, spo2_pct,
      body_temp_c, respiratory_rate, sleep_hours, stress_index, mood_score, activity_mins,
      bone_muscle_index, immune_score, radiation_msv_day, cabin_o2_pct, cabin_co2_mmhg,
      cabin_temp_c, cabin_humidity_pct, cabin_pressure_kpa, ecg_rhythm, ecg_st_mv, symptoms_note, is_simulated
    ) VALUES (?, ?, 'SIMULATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`
  );

  const now = Date.now();
  // 7 days every 4 hours = 42 points per astronaut so 1h/6h/24h/7d ranges all have rich data
  const hoursBack = [168, 160, 152, 144, 136, 128, 120, 112, 104, 96, 88, 80, 72, 64, 56, 48, 40, 32, 24, 18, 12, 6, 4, 2, 1, 0.5, 0.1];

  db.exec('BEGIN');
  try {
    for (const b of baselines) {
      hoursBack.forEach((h, idx) => {
        const ts = new Date(now - h * 3600_000).toISOString();
        const wave = Math.sin(idx * 0.7 + b.astronaut_id);
        const hr = Number((b.heart_rate_bpm + wave * 3.5).toFixed(1));
        const sbp = Number((b.systolic_bp + wave * 3).toFixed(1));
        const dbp = Number((b.diastolic_bp + wave * 2).toFixed(1));
        const spo2 = Number(Math.min(100, Math.max(95.5, b.spo2_pct + wave * 0.4)).toFixed(1));
        const temp = Number((b.body_temp_c + wave * 0.12).toFixed(2));
        const resp = Number((b.respiratory_rate + wave * 1.1).toFixed(1));
        const sleep = Number(Math.max(5.2, b.sleep_hours + Math.cos(idx) * 0.45).toFixed(2));
        const stress = Number(Math.max(10, b.stress_index + wave * 4).toFixed(1));
        const mood = Number(Math.min(100, b.mood_score - wave * 2).toFixed(1));
        const activity = Number(Math.max(30, b.activity_mins + wave * 10).toFixed(0));
        const bone = Number(b.bone_muscle_index.toFixed(1));
        const immune = Number(b.immune_score.toFixed(1));
        const rad = Number((b.radiation_msv_day + Math.abs(wave) * 0.05).toFixed(3));
        const co2 = Number((b.cabin_co2_mmhg + Math.abs(wave) * 0.25).toFixed(2));
        insert.run(
          b.astronaut_id,
          ts,
          hr,
          sbp,
          dbp,
          spo2,
          temp,
          resp,
          sleep,
          stress,
          mood,
          activity,
          bone,
          immune,
          rad,
          b.cabin_o2_pct,
          co2,
          b.cabin_temp_c,
          b.cabin_humidity_pct,
          b.cabin_pressure_kpa,
          'Normal Sinus Rhythm',
          0.02
        );
      });

      db.prepare(
        'INSERT INTO radiation_records (astronaut_id, recorded_at, dose_msv_day, cumulative_msv, event_type) VALUES (?, ?, ?, ?, ?)'
      ).run(b.astronaut_id, new Date(now).toISOString(), b.radiation_msv_day, Number((b.radiation_msv_day * 140).toFixed(2)), 'Nominal GCR Background');

      db.prepare(
        'INSERT INTO sleep_records (astronaut_id, night_date, hours, quality_pct) VALUES (?, ?, ?, ?)'
      ).run(b.astronaut_id, new Date(now - 86400_000).toISOString().slice(0, 10), b.sleep_hours, 88);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
