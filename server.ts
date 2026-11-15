import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  authenticateUser,
  optionalAuth,
  rateLimiter,
  recordAudit,
  registerUser,
  requireAuth,
  requireRole,
  type AuthedRequest,
} from './server/auth.ts';
import { db, initDatabase } from './server/db.ts';
import { analyzeDiseaseRisks } from './server/diseaseEngine.ts';
import { queryAstraAssistant } from './server/gemini.ts';
import { evaluateAstronautHealth } from './server/healthEngine.ts';
import {
  getFullAstronautProfiles,
  getSpacecraftResources,
  monitorEngine,
  rowToReading,
} from './server/monitorEngine.ts';
import {
  getLiveISSPosition,
  getNasaEarthMedia,
  getNasaTextureBuffer,
  getSatelliteDataset,
} from './server/spaceDataService.ts';
import {
  analyzePredictiveHealth,
  buildDigitalTwinPayload,
  getEquipmentUnits,
  getExerciseLogsForAstronaut,
  getPrivateMentalCheckIns,
  getSleepLogsForAstronaut,
  getVisionLogsForAstronaut,
  performEquipmentMaintenance,
} from './server/predictiveEngine.ts';
import {
  getPreMissionAttachment,
  getPreMissionReports,
  reviewPreMissionReport,
  submitPreMissionReport,
} from './server/preMissionEngine.ts';
import type { EngineMode, PreMissionClearanceStatus, ScenarioPreset, UserRole } from './src/types/astrocare.ts';

initDatabase();
monitorEngine.start();

const app = express();
const httpServer = http.createServer(app);

app.use(express.json({ limit: '5mb' }));
app.use(rateLimiter(300));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ASTROCARE', time: new Date().toISOString() });
});

// Authentication
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  const result = authenticateUser(String(email), String(password));
  if (!result) return res.status(401).json({ error: 'Invalid mission credentials.' });
  res.json(result);
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, fullName, role } = req.body || {};
    if (!email || !password || !fullName) return res.status(400).json({ error: 'All registration fields required.' });
    const safeRole: UserRole = ['Astronaut', 'Doctor', 'Mission Control', 'Administrator'].includes(role)
      ? role
      : 'Astronaut';
    const result = registerUser(String(email), String(password), String(fullName), safeRole);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed' });
  }
});

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required.' });
  recordAudit(String(email), 'Guest', 'PASSWORD_RESET_REQUEST', 'Recovery dispatch simulated');
  res.json({ ok: true, message: 'If this mission account exists, recovery guidance has been queued via Flight Ops.' });
});

// Astronauts & Telemetry
app.get('/api/astronauts', optionalAuth, (req: AuthedRequest, res) => {
  const all = getFullAstronautProfiles();
  if (req.user?.role === 'Astronaut' && req.user.astronautId) {
    return res.json({
      astronauts: all.filter((a) => a.id === req.user?.astronautId),
      engine: monitorEngine.getStatus(),
      resources: getSpacecraftResources(),
    });
  }
  res.json({ astronauts: all, engine: monitorEngine.getStatus(), resources: getSpacecraftResources() });
});

app.get('/api/readings', optionalAuth, (req: AuthedRequest, res) => {
  const astronautId = Number(req.query.astronautId || 1);
  const range = String(req.query.range || '24h');
  if (req.user?.role === 'Astronaut' && req.user.astronautId && req.user.astronautId !== astronautId) {
    return res.status(403).json({ error: 'Astronaut profile access restricted.' });
  }
  const hours = range === '1h' ? 1 : range === '6h' ? 6 : range === '7d' ? 168 : 24;
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = db
    .prepare('SELECT * FROM health_readings WHERE astronaut_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC')
    .all(astronautId, since) as Array<Record<string, unknown>>;
  res.json({ readings: rows.map(rowToReading), range });
});

app.post('/api/readings/manual', optionalAuth, (req: AuthedRequest, res) => {
  const body = req.body || {};
  const astronautId = Number(body.astronautId || 1);
  const profiles = getFullAstronautProfiles();
  const target = profiles.find((p) => p.id === astronautId);
  if (!target) return res.status(404).json({ error: 'Astronaut profile not found.' });
  if (req.user?.role === 'Astronaut' && req.user.astronautId && req.user.astronautId !== astronautId) {
    return res.status(403).json({ error: 'Cannot submit readings for another crew member.' });
  }

  const b = target.baseline;
  const now = new Date().toISOString();
  const isSimulated = Boolean(body.isSimulated);
  const hr = Number(body.heartRateBpm ?? b.heartRateBpm);
  const reading = {
    astronautId,
    recordedAt: now,
    source: 'MANUAL' as const,
    heartRateBpm: hr,
    systolicBp: Number(body.systolicBp ?? b.systolicBp),
    diastolicBp: Number(body.diastolicBp ?? b.diastolicBp),
    spo2Pct: Number(body.spo2Pct ?? b.spo2Pct),
    bodyTempC: Number(body.bodyTempC ?? b.bodyTempC),
    respiratoryRate: Number(body.respiratoryRate ?? b.respiratoryRate),
    sleepHours: Number(body.sleepHours ?? b.sleepHours),
    stressIndex: Number(body.stressIndex ?? b.stressIndex),
    moodScore: Number(body.moodScore ?? b.moodScore),
    activityMins: Number(body.activityMins ?? b.activityMins),
    boneMuscleIndex: Number(body.boneMuscleIndex ?? b.boneMuscleIndex),
    immuneScore: Number(body.immuneScore ?? b.immuneScore),
    radiationMsvDay: Number(body.radiationMsvDay ?? b.radiationMsvDay),
    cabinO2Pct: Number(body.cabinO2Pct ?? b.cabinO2Pct),
    cabinCo2Mmhg: Number(body.cabinCo2Mmhg ?? b.cabinCo2Mmhg),
    cabinTempC: Number(body.cabinTempC ?? b.cabinTempC),
    cabinHumidityPct: Number(body.cabinHumidityPct ?? b.cabinHumidityPct),
    cabinPressureKpa: Number(body.cabinPressureKpa ?? b.cabinPressureKpa),
    ecgRhythm: hr >= 105 ? 'Sinus Tachycardia' : 'Normal Sinus Rhythm',
    ecgStMv: hr >= 120 ? -0.08 : 0.02,
    symptomsNote: body.symptomsNote ? String(body.symptomsNote) : undefined,
    isSimulated,
  };

  let assessment;
  if (target.privacyConsent.allowDatabaseStorage) {
    assessment = monitorEngine.insertReadingAndAlert(reading, b);
    recordAudit(req.user?.email || target.callSign, req.user?.role || 'Astronaut', 'MANUAL_HEALTH_ENTRY', `Logged check-in for ${target.fullName}`);
  } else {
    assessment = evaluateAstronautHealth(reading, b);
  }

  const diseaseAnalysis = analyzeDiseaseRisks(reading, b);
  if (body.symptomsNote && target.privacyConsent.allowDatabaseStorage) {
    db.prepare(
      'INSERT INTO medical_incidents (astronaut_id, reported_at, summary, severity_level, status) VALUES (?, ?, ?, ?, ?)'
    ).run(astronautId, now, String(body.symptomsNote), assessment.severityLevel, 'PENDING_REVIEW');
  }

  monitorEngine.broadcast({
    type: 'telemetry:tick',
    ...monitorEngine.getStatus(),
    astronauts: getFullAstronautProfiles(),
  });

  res.json({
    stored: target.privacyConsent.allowDatabaseStorage,
    reading,
    assessment,
    diseaseAnalysis,
    basicHealthAid: assessment.recommendedActions,
  });
});

app.post('/api/readings/wearable-ingest', (req, res) => {
  const body = req.body || {};
  const astronautId = Number(body.astronautId || 1);
  const profiles = getFullAstronautProfiles();
  const target = profiles.find((p) => p.id === astronautId);
  if (!target) return res.status(404).json({ error: 'Astronaut not found.' });
  const b = target.baseline;
  const reading = {
    astronautId,
    recordedAt: new Date().toISOString(),
    source: 'WEARABLE_LIVE' as const,
    heartRateBpm: Number(body.heartRateBpm ?? b.heartRateBpm),
    systolicBp: Number(body.systolicBp ?? b.systolicBp),
    diastolicBp: Number(body.diastolicBp ?? b.diastolicBp),
    spo2Pct: Number(body.spo2Pct ?? b.spo2Pct),
    bodyTempC: Number(body.bodyTempC ?? b.bodyTempC),
    respiratoryRate: Number(body.respiratoryRate ?? b.respiratoryRate),
    sleepHours: Number(body.sleepHours ?? b.sleepHours),
    stressIndex: Number(body.stressIndex ?? b.stressIndex),
    moodScore: Number(body.moodScore ?? b.moodScore),
    activityMins: Number(body.activityMins ?? b.activityMins),
    boneMuscleIndex: Number(body.boneMuscleIndex ?? b.boneMuscleIndex),
    immuneScore: Number(body.immuneScore ?? b.immuneScore),
    radiationMsvDay: Number(body.radiationMsvDay ?? b.radiationMsvDay),
    cabinO2Pct: Number(body.cabinO2Pct ?? b.cabinO2Pct),
    cabinCo2Mmhg: Number(body.cabinCo2Mmhg ?? b.cabinCo2Mmhg),
    cabinTempC: Number(body.cabinTempC ?? b.cabinTempC),
    cabinHumidityPct: Number(body.cabinHumidityPct ?? b.cabinHumidityPct),
    cabinPressureKpa: Number(body.cabinPressureKpa ?? b.cabinPressureKpa),
    ecgRhythm: String(body.ecgRhythm || 'Normal Sinus Rhythm'),
    ecgStMv: Number(body.ecgStMv ?? 0.02),
    isSimulated: false,
  };
  const assessment = monitorEngine.insertReadingAndAlert(reading, b);
  monitorEngine.broadcast({ type: 'telemetry:tick', ...monitorEngine.getStatus(), astronauts: getFullAstronautProfiles() });
  res.json({ ok: true, assessment });
});

app.put('/api/astronauts/:id/privacy', optionalAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { allowDatabaseStorage, allowEarthTransmission } = req.body || {};
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO privacy_consents (astronaut_id, allow_database_storage, allow_earth_transmission, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(astronaut_id) DO UPDATE SET
     allow_database_storage = excluded.allow_database_storage,
     allow_earth_transmission = excluded.allow_earth_transmission,
     updated_at = excluded.updated_at`
  ).run(id, allowDatabaseStorage ? 1 : 0, allowEarthTransmission ? 1 : 0, now);
  recordAudit(req.user?.email || `astronaut-${id}`, req.user?.role || 'Astronaut', 'PRIVACY_CONSENT_UPDATED', `DB:${allowDatabaseStorage}, Earth:${allowEarthTransmission}`);
  monitorEngine.broadcast({ type: 'telemetry:tick', ...monitorEngine.getStatus(), astronauts: getFullAstronautProfiles() });
  res.json({ ok: true });
});

app.put('/api/astronauts/:id/sensors', optionalAuth, (req, res) => {
  const id = Number(req.params.id);
  const sensors = req.body?.sensors;
  if (!sensors) return res.status(400).json({ error: 'Sensors object required.' });
  db.prepare('UPDATE astronaut_profiles SET sensors_json = ? WHERE id = ?').run(JSON.stringify(sensors), id);
  monitorEngine.broadcast({ type: 'telemetry:tick', ...monitorEngine.getStatus(), astronauts: getFullAstronautProfiles() });
  res.json({ ok: true });
});

// Engine mode & scenario triggers
app.post('/api/engine/mode', (req, res) => {
  const mode = req.body?.mode as EngineMode;
  if (mode !== 'SIMULATION' && mode !== 'LIVE') return res.status(400).json({ error: 'Invalid engine mode.' });
  monitorEngine.setMode(mode);
  res.json(monitorEngine.getStatus());
});

app.post('/api/engine/scenario', (req, res) => {
  const scenario = (req.body?.scenario || 'NOMINAL') as ScenarioPreset;
  const astronautId = Number(req.body?.astronautId || 1);
  monitorEngine.applyScenario(scenario, astronautId);
  res.json({
    ok: true,
    ...monitorEngine.getStatus(),
    astronauts: getFullAstronautProfiles(),
    resources: getSpacecraftResources(),
  });
});

app.get('/api/resources', (_req, res) => {
  const radiationRecords = db
    .prepare('SELECT * FROM radiation_records ORDER BY id DESC LIMIT 20')
    .all() as Array<Record<string, unknown>>;
  res.json({
    resources: getSpacecraftResources(),
    radiationRecords: radiationRecords.map((r) => ({
      id: Number(r.id),
      astronautId: Number(r.astronaut_id),
      recordedAt: String(r.recorded_at),
      doseMsvDay: Number(r.dose_msv_day),
      cumulativeMsv: Number(r.cumulative_msv),
      eventType: String(r.event_type),
    })),
  });
});

app.post('/api/resources/action', optionalAuth, (req: AuthedRequest, res) => {
  const action = String(req.body?.action || '');
  if (!['CONSERVE_WATER', 'CYCLE_CO2_SCRUBBER', 'PURGE_CABIN_O2', 'LOG_RESUPPLY'].includes(action)) {
    return res.status(400).json({ error: 'Invalid resource action.' });
  }
  monitorEngine.applyResourceAction(
    action as 'CONSERVE_WATER' | 'CYCLE_CO2_SCRUBBER' | 'PURGE_CABIN_O2' | 'LOG_RESUPPLY'
  );
  recordAudit(req.user?.email || 'crew', req.user?.role || 'Mission Control', 'RESOURCE_ACTION', action);
  res.json({ ok: true, resources: getSpacecraftResources() });
});

app.post('/api/suit/:id/action', optionalAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const action = String(req.body?.action || '');
  if (!['START_PREBREATHE', 'TOGGLE_EVA', 'DOCK_RECHARGE', 'SEAL_CHECK'].includes(action)) {
    return res.status(400).json({ error: 'Invalid suit action.' });
  }
  monitorEngine.applySuitAction(
    id,
    action as 'START_PREBREATHE' | 'TOGGLE_EVA' | 'DOCK_RECHARGE' | 'SEAL_CHECK'
  );
  recordAudit(req.user?.email || `astronaut-${id}`, req.user?.role || 'Astronaut', 'SUIT_ACTION', `${action} on xEMU-0${id}`);
  res.json({ ok: true, astronauts: getFullAstronautProfiles() });
});

app.post('/api/engine/comms', (req, res) => {
  monitorEngine.setEarthComms(Boolean(req.body?.online));
  res.json(monitorEngine.getStatus());
});

// Alerts
app.get('/api/alerts', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, p.full_name as astronaut_name FROM alerts a
       JOIN astronaut_profiles p ON a.astronaut_id = p.id
       ORDER BY a.id DESC LIMIT 40`
    )
    .all() as Array<Record<string, unknown>>;
  res.json({
    alerts: rows.map((r) => ({
      id: Number(r.id),
      astronautId: Number(r.astronaut_id),
      astronautName: String(r.astronaut_name),
      severityLevel: Number(r.severity_level),
      status: String(r.status),
      title: String(r.title),
      whatChanged: String(r.what_changed),
      whyItMatters: String(r.why_it_matters),
      whatToDo: String(r.what_to_do),
      whenToCheckAgain: String(r.when_to_check_again),
      escalationRule: String(r.escalation_rule),
      acknowledged: Number(r.acknowledged) === 1,
      earthNotified: Number(r.earth_notified) === 1,
      pendingSync: Number(r.pending_sync) === 1,
      createdAt: String(r.created_at),
    })),
  });
});

app.post('/api/alerts/:id/acknowledge', optionalAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(id);
  recordAudit(req.user?.email || 'crew', req.user?.role || 'Astronaut', 'ALERT_ACKNOWLEDGED', `Alert #${id}`);
  res.json({ ok: true });
});

app.post('/api/alerts/notify-earth', optionalAuth, (req: AuthedRequest, res) => {
  const astronautId = Number(req.body?.astronautId || 1);
  const reason = String(req.body?.reason || 'Crew requested direct Flight Surgeon escalation.');
  const online = monitorEngine.getStatus().earthCommsOnline;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO alerts (
      astronaut_id, severity_level, status, title, what_changed, why_it_matters, what_to_do,
      when_to_check_again, escalation_rule, acknowledged, earth_notified, pending_sync, created_at
    ) VALUES (?, 3, 'NEEDS ATTENTION', 'Earth Medical Station Escalation', ?, 'Crew initiated medical uplink', 'Await Flight Surgeon response and continue telemetry', '15 min', 'Immediate', 0, ?, ?, ?)`
  ).run(astronautId, reason, online ? 1 : 0, online ? 0 : 1, now);
  recordAudit(req.user?.email || 'crew', req.user?.role || 'Astronaut', 'EARTH_STATION_NOTIFY', reason);
  res.json({ ok: true, transmittedImmediately: online, queuedOffline: !online });
});

// Disease detection & ASTRA assistant
app.get('/api/disease-detection', (req, res) => {
  const astronautId = Number(req.query.astronautId || 1);
  const target = getFullAstronautProfiles().find((p) => p.id === astronautId);
  if (!target) return res.status(404).json({ error: 'Astronaut not found.' });
  const risks = analyzeDiseaseRisks(target.latestReading, target.baseline);
  res.json({
    astronautId,
    isSimulated: target.latestReading.isSimulated,
    assessment: target.assessment,
    risks,
  });
});

app.post('/api/ai/chat', async (req, res) => {
  const { question, astronautId = 1, history = [] } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Question required.' });
  const target = getFullAstronautProfiles().find((p) => p.id === Number(astronautId));
  if (!target) return res.status(404).json({ error: 'Astronaut not found.' });
  const risks = analyzeDiseaseRisks(target.latestReading, target.baseline);
  const response = await queryAstraAssistant(
    String(question),
    target,
    risks,
    Array.isArray(history) ? history : [],
    target.latestReading.isSimulated
  );
  res.json(response);
});

// Digital Twin & Predictive Intelligence
app.get('/api/twin/:astronautId', (req, res) => {
  const astronautId = Number(req.params.astronautId || 1);
  const payload = buildDigitalTwinPayload(astronautId);
  if (!payload) return res.status(404).json({ error: 'Astronaut profile not found.' });
  res.json(payload);
});

app.get('/api/predictive/:astronautId', (req, res) => {
  const astronautId = Number(req.params.astronautId || 1);
  const target = getFullAstronautProfiles().find((p) => p.id === astronautId);
  if (!target) return res.status(404).json({ error: 'Astronaut profile not found.' });
  res.json({ predictive: analyzePredictiveHealth(target) });
});

// Crew Wellbeing: Sleep & Fatigue, Bone & Muscle, Vision (SANS), Private Mental Support
app.get('/api/wellbeing/:astronautId', optionalAuth, (req: AuthedRequest, res) => {
  const astronautId = Number(req.params.astronautId || 1);
  res.json({
    sleepLogs: getSleepLogsForAstronaut(astronautId),
    exerciseLogs: getExerciseLogsForAstronaut(astronautId),
    visionLogs: getVisionLogsForAstronaut(astronautId),
    mentalCheckIns: getPrivateMentalCheckIns(astronautId),
  });
});

app.post('/api/wellbeing/sleep', optionalAuth, (req, res) => {
  const { astronautId = 1, sleepHours = 7.0, qualityPct = 82, workloadScore = 60, workHours = 9.0, note = '' } = req.body || {};
  const id = Number(astronautId);
  const sh = Number(sleepHours);
  const wl = Number(workloadScore);
  const wh = Number(workHours);
  const rh = Math.max(0, Number((24 - wh).toFixed(1)));
  const fatigue = Math.max(10, Math.min(95, Math.round(wl * 0.45 + Math.max(0, 8 - sh) * 14)));
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO crew_sleep_logs (astronaut_id, logged_at, sleep_hours, quality_pct, workload_score, fatigue_index, work_hours, rest_hours, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, now, sh, Number(qualityPct), wl, fatigue, wh, rh, String(note || 'Logged via Sleep & Fatigue Console'));
  res.status(201).json({ ok: true, sleepLogs: getSleepLogsForAstronaut(id) });
});

app.post('/api/wellbeing/exercise', optionalAuth, (req, res) => {
  const { astronautId = 1, device = 'ARED', exerciseName = 'ARED Countermeasure Session', durationMin = 45, loadKg = 85 } = req.body || {};
  const id = Number(astronautId);
  const dur = Number(durationMin);
  const load = Number(loadKg);
  const strengthScore = Math.max(70, Math.min(99, Math.round(80 + load * 0.12 + dur * 0.1)));
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO crew_exercise_logs (astronaut_id, logged_at, device, exercise_name, duration_min, load_kg, strength_score, completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(id, now, String(device), String(exerciseName), dur, load, strengthScore);
  res.status(201).json({ ok: true, exerciseLogs: getExerciseLogsForAstronaut(id) });
});

app.post('/api/wellbeing/vision', optionalAuth, (req, res) => {
  const {
    astronautId = 1,
    visualAcuityLeft = '20/20',
    visualAcuityRight = '20/20',
    nearShiftDiopter = 0.25,
    symptoms = [],
  } = req.body || {};
  const id = Number(astronautId);
  const shift = Number(nearShiftDiopter);
  const syms = Array.isArray(symptoms) ? symptoms.map(String) : [];
  const highRiskSymptom = syms.some((s) => /flash|scotoma|loss|double|severe/i.test(s));
  const warningTriggered = shift >= 0.75 || highRiskSymptom || syms.length >= 2;
  const recommendation = warningTriggered
    ? 'Elevated SANS warning: Schedule OCT retinal & optic nerve ultrasound exam and notify Earth Flight Surgeon.'
    : shift >= 0.5 || syms.length > 0
    ? 'Moderate refractive shift noted: Monitor near visual acuity daily and repeat ophthalmic grid check in 48h.'
    : 'Nominal SANS vision screening; continue routine weekly Amsler grid & acuity log.';
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO crew_vision_logs (astronaut_id, recorded_at, visual_acuity_left, visual_acuity_right, near_shift_diopter, symptoms_json, warning_triggered, clinician_recommendation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, now, String(visualAcuityLeft), String(visualAcuityRight), shift, JSON.stringify(syms), warningTriggered ? 1 : 0, recommendation);

  if (warningTriggered) {
    monitorEngine.createSystemAlert(
      id,
      3,
      'NEEDS ATTENTION',
      'SANS Ocular / Vision Screening Alert',
      `Hyperopic shift +${shift.toFixed(2)} D; reported: ${syms.join(', ') || 'acuity change'}`,
      'Microgravity cephalad fluid shift can induce optic disc edema and choroidal folds.',
      recommendation,
      'Repeat ophthalmic check in 24 hours',
      'Escalate immediately to Flight Surgeon if sudden vision loss or persistent flashes occur.'
    );
  }
  res.status(201).json({ ok: true, warningTriggered, visionLogs: getVisionLogsForAstronaut(id) });
});

app.post('/api/wellbeing/mental', optionalAuth, (req, res) => {
  const { astronautId = 1, moodScore = 80, stressLevel = 30, workloadRating = 60, sleepHours = 7.0, privateNote = '' } = req.body || {};
  const id = Number(astronautId);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO crew_mental_checkins (astronaut_id, recorded_at, mood_score, stress_level, workload_rating, sleep_hours, private_note, is_private)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(id, now, Number(moodScore), Number(stressLevel), Number(workloadRating), Number(sleepHours), String(privateNote || 'Private reflection logged.'));
  res.status(201).json({ ok: true, mentalCheckIns: getPrivateMentalCheckIns(id) });
});

// Predictive Equipment Maintenance & Emergency Simulation Lab
app.get('/api/equipment', (_req, res) => {
  res.json({ units: getEquipmentUnits() });
});

app.post('/api/equipment/:id/maintain', optionalAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const updated = performEquipmentMaintenance(id);
  if (!updated) return res.status(404).json({ error: 'Equipment unit not found.' });
  recordAudit(req.user?.email || 'crew', req.user?.role || 'Mission Control', 'EQUIPMENT_MAINTENANCE', `${updated.unitCode} recalibrated`);
  res.json({ ok: true, unit: updated, units: getEquipmentUnits() });
});

app.post('/api/simulation/drill', (req, res) => {
  const scenario = (req.body?.scenario || 'NOMINAL') as ScenarioPreset;
  const astronautId = Number(req.body?.astronautId || 1);
  monitorEngine.applyScenario(scenario, astronautId);

  const astronaut = getFullAstronautProfiles().find((p) => p.id === astronautId);
  const predictive = astronaut ? analyzePredictiveHealth(astronaut) : null;
  const units = getEquipmentUnits();

  const protoCodeMap: Record<ScenarioPreset, string> = {
    NOMINAL: 'NASA-MED-05',
    CO2_SCRUBBER_FAULT: 'NASA-MED-01',
    EQUIP_MALFUNCTION: 'NASA-MED-01',
    SOLAR_PARTICLE_EVENT: 'NASA-MED-02',
    ORTHOSTATIC_STRESS: 'NASA-MED-03',
    CRITICAL_HYPOXIA: 'NASA-MED-01',
    OXYGEN_DROP: 'NASA-MED-01',
    CABIN_PRESSURE_DROP: 'NASA-MED-01',
    AST_FATIGUE: 'NASA-MED-04',
    SENSOR_DISCONNECT: 'NASA-MED-03',
    SUIT_BATTERY_LOW: 'NASA-MED-03',
    RESOURCE_WATER_LOW: 'NASA-MED-05',
  };
  const code = protoCodeMap[scenario] || 'NASA-MED-01';
  const protoRow = db.prepare('SELECT * FROM medical_protocols WHERE code = ?').get(code) as Record<string, unknown> | undefined;

  res.json({
    ok: true,
    scenario,
    isSimulatedTraining: true,
    notice: 'SIMULATED TRAINING DRILL — Outputs demonstrate ASTROCARE detection logic and reference checklists; not a live operational flight certification.',
    astronaut,
    predictive,
    resources: getSpacecraftResources(),
    units,
    matchedProcedure: protoRow
      ? {
          code: String(protoRow.code),
          title: String(protoRow.title),
          steps: JSON.parse(String(protoRow.steps_json)) as string[],
          sourceRef: String(protoRow.source_ref),
        }
      : null,
  });
});

// Medical Support, Protocols, Medicines, Incidents, Audit
app.get('/api/medical/overview', (_req, res) => {
  const protocols = db.prepare('SELECT * FROM medical_protocols ORDER BY code ASC').all() as Array<Record<string, unknown>>;
  const medicines = db.prepare('SELECT * FROM medicine_inventory ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  const incidents = db
    .prepare(
      `SELECT m.*, p.full_name as astronaut_name FROM medical_incidents m
       JOIN astronaut_profiles p ON m.astronaut_id = p.id ORDER BY m.id DESC LIMIT 25`
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    protocols: protocols.map((p) => ({
      code: String(p.code),
      title: String(p.title),
      category: String(p.category),
      severityScope: String(p.severity_scope),
      summary: String(p.summary),
      steps: JSON.parse(String(p.steps_json)),
      sourceRef: String(p.source_ref),
    })),
    medicines: medicines.map((m) => {
      const qty = Number(m.quantity);
      const expired = new Date(String(m.expiry_date)).getTime() < Date.now();
      return {
        id: Number(m.id),
        name: String(m.name),
        category: String(m.category),
        quantity: qty,
        unit: String(m.unit),
        expiryDate: String(m.expiry_date),
        contraindications: String(m.contraindications),
        indication: String(m.indication),
        status: expired ? 'EXPIRED' : qty < 10 ? 'LOW_STOCK' : 'AVAILABLE',
      };
    }),
    incidents: incidents.map((i) => ({
      id: Number(i.id),
      astronautId: Number(i.astronaut_id),
      astronautName: String(i.astronaut_name),
      reportedAt: String(i.reported_at),
      summary: String(i.summary),
      severityLevel: Number(i.severity_level),
      status: String(i.status),
      clinicianNote: i.clinician_note ? String(i.clinician_note) : undefined,
      reviewedBy: i.reviewed_by ? String(i.reviewed_by) : undefined,
    })),
  });
});

app.post('/api/incidents', optionalAuth, (req: AuthedRequest, res) => {
  const { astronautId = 1, summary, severityLevel = 2 } = req.body || {};
  if (!summary) return res.status(400).json({ error: 'Incident summary required.' });
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO medical_incidents (astronaut_id, reported_at, summary, severity_level, status) VALUES (?, ?, ?, ?, ?)'
  ).run(Number(astronautId), now, String(summary), Number(severityLevel), 'PENDING_REVIEW');
  recordAudit(req.user?.email || 'crew', req.user?.role || 'Astronaut', 'INCIDENT_REPORTED', String(summary).slice(0, 80));
  res.status(201).json({ ok: true });
});

app.patch('/api/incidents/:id/review', requireAuth, requireRole('Doctor', 'Mission Control', 'Administrator'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { status = 'APPROVED', clinicianNote = '' } = req.body || {};
  db.prepare('UPDATE medical_incidents SET status = ?, clinician_note = ?, reviewed_by = ? WHERE id = ?').run(
    String(status),
    String(clinicianNote),
    req.user?.fullName || 'Flight Surgeon',
    id
  );
  recordAudit(req.user!.email, req.user!.role, 'INCIDENT_REVIEWED', `Incident #${id} -> ${status}`);
  res.json({ ok: true });
});

// Pre-Mission Medical Report Submission & Clearance Screening
app.get('/api/pre-mission-reports', (_req, res) => {
  res.json({ reports: getPreMissionReports() });
});

app.post('/api/pre-mission-reports', optionalAuth, (req: AuthedRequest, res) => {
  try {
    const body = req.body || {};
    if (!body.candidateName || !body.targetMission) {
      return res.status(400).json({ error: 'Candidate name and target mission are required.' });
    }
    const created = submitPreMissionReport({
      astronautId: body.astronautId ? Number(body.astronautId) : null,
      candidateName: String(body.candidateName),
      callSign: String(body.callSign || 'CAND-01'),
      age: Number(body.age || 35),
      bloodType: String(body.bloodType || 'O+'),
      targetMission: String(body.targetMission),
      missionRole: String(body.missionRole || 'Mission Specialist'),
      missionDurationDays: Number(body.missionDurationDays || 180),
      evaPlanned: Boolean(body.evaPlanned ?? true),
      restingHrBpm: Number(body.restingHrBpm ?? 65),
      systolicBp: Number(body.systolicBp ?? 118),
      diastolicBp: Number(body.diastolicBp ?? 76),
      spo2Pct: Number(body.spo2Pct ?? 98.5),
      ecgSummary: String(body.ecgSummary || 'Normal Sinus Rhythm'),
      exerciseClearance: body.exerciseClearance || 'CLEARED',
      nearVisionDiopter: Number(body.nearVisionDiopter ?? 0.0),
      vestibularEntStatus: body.vestibularEntStatus || 'CLEARED',
      boneDensityZScore: Number(body.boneDensityZScore ?? 0.2),
      labPanelStatus: body.labPanelStatus || 'NOMINAL',
      immunizationsCurrent: Boolean(body.immunizationsCurrent ?? true),
      allergiesText: String(body.allergiesText || 'NKDA'),
      medicationsText: String(body.medicationsText || 'None'),
      medicalHistorySummary: String(body.medicalHistorySummary || ''),
      attachmentName: body.attachmentName ? String(body.attachmentName) : null,
      attachmentMime: body.attachmentMime ? String(body.attachmentMime) : null,
      attachmentSizeBytes: body.attachmentSizeBytes ? Number(body.attachmentSizeBytes) : null,
      attachmentDataBase64: body.attachmentDataBase64 ? String(body.attachmentDataBase64) : null,
      consentToStore: Boolean(body.consentToStore),
      consentToShareFlightSurgeon: Boolean(body.consentToShareFlightSurgeon),
      syncBaselineIfRoster: Boolean(body.syncBaselineIfRoster),
    });
    recordAudit(
      req.user?.email || created.callSign,
      req.user?.role || 'Astronaut',
      'PRE_MISSION_REPORT_SUBMITTED',
      `${created.candidateName} (${created.targetMission}) -> ${created.screeningResult}`
    );
    res.status(201).json({ ok: true, report: created, reports: getPreMissionReports() });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to submit medical report.' });
  }
});

app.patch(
  '/api/pre-mission-reports/:id/review',
  requireAuth,
  requireRole('Doctor', 'Mission Control', 'Administrator'),
  (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const clearanceStatus = String(req.body?.clearanceStatus || 'CLEARED_FOR_FLIGHT') as PreMissionClearanceStatus;
    if (
      !['PENDING_FLIGHT_SURGEON', 'CLEARED_FOR_FLIGHT', 'CONDITIONAL_REVIEW', 'DEFERRED_HOLD'].includes(
        clearanceStatus
      )
    ) {
      return res.status(400).json({ error: 'Invalid clearance status.' });
    }
    const clinicianNote = String(req.body?.clinicianNote || 'Reviewed via Flight Surgeon Pre-Mission Console.');
    const updated = reviewPreMissionReport(id, clearanceStatus, clinicianNote, req.user?.fullName || 'Flight Surgeon');
    if (!updated) return res.status(404).json({ error: 'Pre-mission report not found.' });
    recordAudit(req.user!.email, req.user!.role, 'PRE_MISSION_REPORT_REVIEWED', `Report #${id} -> ${clearanceStatus}`);
    res.json({ ok: true, report: updated, reports: getPreMissionReports() });
  }
);

app.get('/api/pre-mission-reports/:id/attachment', (req, res) => {
  const id = Number(req.params.id);
  const file = getPreMissionAttachment(id);
  if (!file) return res.status(404).json({ error: 'Attachment not found.' });
  const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send(file.buffer);
});

app.get('/api/audit-logs', requireAuth, requireRole('Doctor', 'Mission Control', 'Administrator'), (_req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50').all();
  res.json({ logs });
});

// Real NASA, ISS & CelesTrak Space Visualization APIs
app.get('/api/space/satellites', async (_req, res) => {
  const dataset = await getSatelliteDataset();
  res.json(dataset);
});

app.get('/api/space/iss-live', async (_req, res) => {
  const pos = await getLiveISSPosition();
  res.json(pos);
});

app.get('/api/space/texture/:key', async (req, res) => {
  const result = await getNasaTextureBuffer(String(req.params.key));
  if (!result) return res.status(404).send('Texture unavailable');
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(result.buffer);
});

app.get('/api/space/nasa-media', async (_req, res) => {
  const media = await getNasaEarthMedia();
  res.json(media);
});

app.get('/api/space/video-proxy', async (req, res) => {
  const targetUrl = String(req.query.url || '');
  if (!targetUrl.startsWith('https://images-assets.nasa.gov/')) {
    return res.status(400).json({ error: 'Only verified NASA images-assets URLs are permitted.' });
  }
  try {
    const headers: Record<string, string> = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(15000) });
    res.status(upstream.status);
    ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    });
    if (!upstream.body) return res.end();
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch {
    res.status(502).end();
  }
});

// WebSocket Upgrade routing for /ws
httpServer.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
  if (pathname === '/ws') {
    monitorEngine.handleUpgrade(req, socket, head);
  }
});

async function startServer() {
  app.use(
    '/assets/aistudio',
    express.static(path.resolve(process.cwd(), 'public/assets/aistudio'), {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.mpeg') || filePath.endsWith('.mp3')) {
          res.setHeader('Content-Type', 'audio/mpeg');
        }
      },
    })
  );

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer, path: '/vite-ws' },
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(3000, '0.0.0.0', () => {
    console.log('ASTROCARE NASA Mission Control running on http://0.0.0.0:3000');
  });
}

startServer();
