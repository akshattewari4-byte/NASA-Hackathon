import { db } from './db.ts';
import type { PreMissionClearanceStatus, PreMissionMedicalReport } from '../src/types/astrocare.ts';

export interface PreMissionSubmissionInput {
  astronautId?: number | null;
  candidateName: string;
  callSign: string;
  age: number;
  bloodType: string;
  targetMission: string;
  missionRole: string;
  missionDurationDays: number;
  evaPlanned: boolean;
  restingHrBpm: number;
  systolicBp: number;
  diastolicBp: number;
  spo2Pct: number;
  ecgSummary: string;
  exerciseClearance: 'CLEARED' | 'EQUIVOCAL' | 'NOT_CLEARED';
  nearVisionDiopter: number;
  vestibularEntStatus: 'CLEARED' | 'FOLLOW_UP_NEEDED';
  boneDensityZScore: number;
  labPanelStatus: 'NOMINAL' | 'MILD_VARIANCE' | 'ABNORMAL_FOLLOWUP';
  immunizationsCurrent: boolean;
  allergiesText: string;
  medicationsText: string;
  medicalHistorySummary: string;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSizeBytes?: number | null;
  attachmentDataBase64?: string | null;
  consentToStore: boolean;
  consentToShareFlightSurgeon: boolean;
  syncBaselineIfRoster?: boolean;
}

export function screenPreMissionReport(input: PreMissionSubmissionInput): {
  screeningResult: PreMissionMedicalReport['screeningResult'];
  screeningFlags: string[];
} {
  const flags: string[] = [];
  let hold = false;

  if (input.systolicBp >= 150 || input.diastolicBp >= 95 || input.systolicBp < 85) {
    flags.push(`Blood pressure (${input.systolicBp}/${input.diastolicBp} mmHg) outside pre-flight nominal envelope (90–139 / 60–89 mmHg).`);
    if (input.systolicBp >= 160 || input.diastolicBp >= 100) hold = true;
  }
  if (input.spo2Pct < 95) {
    flags.push(`Resting SpO2 (${input.spo2Pct.toFixed(1)}%) below 95.0% sea-level aerospace baseline.`);
    if (input.spo2Pct < 92) hold = true;
  }
  if (input.restingHrBpm > 95 || input.restingHrBpm < 40) {
    flags.push(`Resting heart rate (${input.restingHrBpm} BPM) requires cardiology review against athletic vs pathological baseline.`);
  }
  if (input.exerciseClearance !== 'CLEARED') {
    flags.push(`Cardiopulmonary exercise stress test reported as ${input.exerciseClearance}.`);
    if (input.exerciseClearance === 'NOT_CLEARED') hold = true;
  }
  if (/arrhythmia|ischemi|st\s*elevat|abnormal|block/i.test(input.ecgSummary)) {
    flags.push(`12-lead ECG summary indicates non-benign finding ("${input.ecgSummary}").`);
    hold = true;
  }
  if (input.vestibularEntStatus !== 'CLEARED') {
    flags.push('Vestibular / ENT middle-ear barotrauma clearance flagged for Flight Surgeon pressure-chamber review.');
  }
  if (input.boneDensityZScore < -1.0) {
    flags.push(`DEXA bone mineral density Z-score (${input.boneDensityZScore.toFixed(1)}) below -1.0 SD microgravity threshold.`);
    if (input.boneDensityZScore <= -2.0) hold = true;
  }
  if (input.labPanelStatus !== 'NOMINAL') {
    flags.push(`Hematology / Comprehensive Metabolic Panel status: ${input.labPanelStatus}.`);
    if (input.labPanelStatus === 'ABNORMAL_FOLLOWUP') hold = true;
  }
  if (!input.immunizationsCurrent) {
    flags.push('Pre-mission immunization & quarantine vaccine record incomplete.');
  }
  if (input.nearVisionDiopter >= 1.0) {
    flags.push(`Baseline hyperopic refractive offset (+${input.nearVisionDiopter.toFixed(2)} D) noted for pre-flight SANS optic-disc baseline comparison.`);
  }

  const screeningResult: PreMissionMedicalReport['screeningResult'] = hold
    ? 'HOLD_RECOMMENDED'
    : flags.length > 0
    ? 'REVIEW_RECOMMENDED'
    : 'NOMINAL_PREFLIGHT';

  return { screeningResult, screeningFlags: flags };
}

function rowToReport(r: Record<string, unknown>): PreMissionMedicalReport {
  let flags: string[] = [];
  try {
    flags = JSON.parse(String(r.screening_flags_json || '[]'));
  } catch {
    flags = [];
  }
  return {
    id: Number(r.id),
    astronautId: r.astronaut_id !== null && r.astronaut_id !== undefined ? Number(r.astronaut_id) : null,
    candidateName: String(r.candidate_name),
    callSign: String(r.call_sign),
    age: Number(r.age),
    bloodType: String(r.blood_type),
    targetMission: String(r.target_mission),
    missionRole: String(r.mission_role),
    missionDurationDays: Number(r.mission_duration_days),
    evaPlanned: Number(r.eva_planned) === 1,
    restingHrBpm: Number(r.resting_hr_bpm),
    systolicBp: Number(r.systolic_bp),
    diastolicBp: Number(r.diastolic_bp),
    spo2Pct: Number(r.spo2_pct),
    ecgSummary: String(r.ecg_summary),
    exerciseClearance: r.exercise_clearance as PreMissionMedicalReport['exerciseClearance'],
    nearVisionDiopter: Number(r.near_vision_diopter),
    vestibularEntStatus: r.vestibular_ent_status as PreMissionMedicalReport['vestibularEntStatus'],
    boneDensityZScore: Number(r.bone_density_z_score),
    labPanelStatus: r.lab_panel_status as PreMissionMedicalReport['labPanelStatus'],
    immunizationsCurrent: Number(r.immunizations_current) === 1,
    allergiesText: String(r.allergies_text || 'NKDA'),
    medicationsText: String(r.medications_text || 'None'),
    medicalHistorySummary: String(r.medical_history_summary || ''),
    attachmentName: r.attachment_name ? String(r.attachment_name) : null,
    attachmentMime: r.attachment_mime ? String(r.attachment_mime) : null,
    attachmentSizeBytes: r.attachment_size_bytes !== null && r.attachment_size_bytes !== undefined ? Number(r.attachment_size_bytes) : null,
    hasAttachmentData: Boolean(r.attachment_data_base64),
    screeningResult: r.screening_result as PreMissionMedicalReport['screeningResult'],
    screeningFlags: flags,
    clearanceStatus: r.clearance_status as PreMissionClearanceStatus,
    consentToStore: Number(r.consent_to_store) === 1,
    consentToShareFlightSurgeon: Number(r.consent_to_share_flight_surgeon) === 1,
    clinicianNote: r.clinician_note ? String(r.clinician_note) : null,
    reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
    submittedAt: String(r.submitted_at),
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
  };
}

export function seedPreMissionReportsIfNeeded() {
  const count = (db.prepare('SELECT COUNT(*) as c FROM pre_mission_medical_reports').get() as { c: number }).c;
  if (count > 0) return;

  const now = Date.now();
  const ins = db.prepare(
    `INSERT INTO pre_mission_medical_reports (
      astronaut_id, candidate_name, call_sign, age, blood_type, target_mission, mission_role,
      mission_duration_days, eva_planned, resting_hr_bpm, systolic_bp, diastolic_bp, spo2_pct,
      ecg_summary, exercise_clearance, near_vision_diopter, vestibular_ent_status, bone_density_z_score,
      lab_panel_status, immunizations_current, allergies_text, medications_text, medical_history_summary,
      attachment_name, attachment_mime, attachment_size_bytes, attachment_data_base64,
      screening_result, screening_flags_json, clearance_status, consent_to_store, consent_to_share_flight_surgeon,
      clinician_note, reviewed_by, submitted_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  ins.run(
    1,
    'Cmdr. Elena Vance',
    'CDR-01',
    39,
    'O+',
    'ARES-IV Transit / ISS-LEO Prep',
    'Mission Commander',
    180,
    1,
    62,
    116,
    74,
    98.6,
    'Normal Sinus Rhythm — 12-Lead Verified',
    'CLEARED',
    0.0,
    'CLEARED',
    0.4,
    'NOMINAL',
    1,
    'NKDA (No Known Drug Allergies)',
    'Vitamin D3 2000 IU daily',
    'Annual NASA Class I flight physical passed; VO2max 51.2 mL/kg/min; OCT optic nerve & fundus photography nominal.',
    'CDR01_Flight_Physical_PreMission.txt',
    'text/plain',
    312,
    Buffer.from(
      'ASTROCARE PRE-MISSION AEROSPACE MEDICAL SUMMARY\nCandidate: Cmdr. Elena Vance (CDR-01)\nMission: ARES-IV / ISS-LEO Prep (180 days)\nECG: Normal Sinus Rhythm | Stress Test: Cleared | DEXA Z-score: +0.4 | OCT & Acuity: 20/20 OU\nCertified by NASA JSC Flight Medicine Clinic (Simulated Seed Record).',
      'utf8'
    ).toString('base64'),
    'NOMINAL_PREFLIGHT',
    JSON.stringify([]),
    'CLEARED_FOR_FLIGHT',
    1,
    1,
    'All Class I physical, dental, ocular, and DEXA metrics within flight envelope. Cleared for EVA.',
    'Dr. Marcus Lin (Flight Surgeon)',
    new Date(now - 45 * 86400_000).toISOString(),
    new Date(now - 44 * 86400_000).toISOString()
  );

  ins.run(
    3,
    'Lt. Maya Patel',
    'SCI-03',
    34,
    'B+',
    'ARES-IV Transit / ISS-LEO Prep',
    'Biomedical Payload Specialist',
    180,
    1,
    60,
    112,
    72,
    99.0,
    'Normal Sinus Rhythm — Athletic Sinus Bradycardia variant',
    'CLEARED',
    0.25,
    'CLEARED',
    0.7,
    'NOMINAL',
    1,
    'Mild seasonal rhinitis (non-sedating protocol cleared)',
    'Vitamin D3 2000 IU daily',
    'Pre-flight vestibular caloric test & centrifuge tolerance nominal; dental prophylaxis completed L-21 days.',
    null,
    null,
    null,
    null,
    'NOMINAL_PREFLIGHT',
    JSON.stringify([]),
    'CLEARED_FOR_FLIGHT',
    1,
    1,
    'Cleared for payload & EVA contingency operations.',
    'Dr. Marcus Lin (Flight Surgeon)',
    new Date(now - 42 * 86400_000).toISOString(),
    new Date(now - 41 * 86400_000).toISOString()
  );

  ins.run(
    null,
    'Spec. Aria Lindqvist',
    'PS-07',
    36,
    'A-',
    'Artemis Lunar South Pole Analog',
    'Payload & Extravehicular Specialist',
    45,
    1,
    71,
    136,
    88,
    97.8,
    'Normal Sinus Rhythm — Mild First-Degree AV Variant',
    'CLEARED',
    0.5,
    'FOLLOW_UP_NEEDED',
    -1.1,
    'MILD_VARIANCE',
    1,
    'Penicillin allergy (urticaria)',
    'Oral Iron Supplementation (mild ferritin variance)',
    'Recent scuba barotrauma ear check requested prior to hypobaric xEMU suit chamber run.',
    'PS07_PreMission_Labs_Summary.txt',
    'text/plain',
    268,
    Buffer.from(
      'PRE-MISSION SCREENING LAB & ENT NOTE\nCandidate: Spec. Aria Lindqvist (PS-07)\nFerritin slightly low-nominal; tympanometry follow-up scheduled ahead of Lunar analog altitude chamber qualification.',
      'utf8'
    ).toString('base64'),
    'REVIEW_RECOMMENDED',
    JSON.stringify([
      'Vestibular / ENT middle-ear barotrauma clearance flagged for Flight Surgeon pressure-chamber review.',
      'DEXA bone mineral density Z-score (-1.1) below -1.0 SD microgravity threshold.',
      'Hematology / Comprehensive Metabolic Panel status: MILD_VARIANCE.',
    ]),
    'PENDING_FLIGHT_SURGEON',
    1,
    1,
    null,
    null,
    new Date(now - 2 * 86400_000).toISOString(),
    null
  );
}

export function getPreMissionReports(): PreMissionMedicalReport[] {
  seedPreMissionReportsIfNeeded();
  const rows = db
    .prepare('SELECT * FROM pre_mission_medical_reports ORDER BY id DESC LIMIT 50')
    .all() as Array<Record<string, unknown>>;
  return rows.map(rowToReport);
}

export function getPreMissionAttachment(id: number): {
  filename: string;
  mimeType: string;
  buffer: Buffer;
} | null {
  const row = db
    .prepare('SELECT attachment_name, attachment_mime, attachment_data_base64 FROM pre_mission_medical_reports WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!row || !row.attachment_data_base64) return null;
  return {
    filename: String(row.attachment_name || `pre-mission-report-${id}.bin`),
    mimeType: String(row.attachment_mime || 'application/octet-stream'),
    buffer: Buffer.from(String(row.attachment_data_base64), 'base64'),
  };
}

export function submitPreMissionReport(input: PreMissionSubmissionInput): PreMissionMedicalReport {
  if (!input.consentToStore) {
    throw new Error('Explicit database storage permission is required before storing a medical dossier.');
  }

  const { screeningResult, screeningFlags } = screenPreMissionReport(input);
  const now = new Date().toISOString();

  const res = db
    .prepare(
      `INSERT INTO pre_mission_medical_reports (
        astronaut_id, candidate_name, call_sign, age, blood_type, target_mission, mission_role,
        mission_duration_days, eva_planned, resting_hr_bpm, systolic_bp, diastolic_bp, spo2_pct,
        ecg_summary, exercise_clearance, near_vision_diopter, vestibular_ent_status, bone_density_z_score,
        lab_panel_status, immunizations_current, allergies_text, medications_text, medical_history_summary,
        attachment_name, attachment_mime, attachment_size_bytes, attachment_data_base64,
        screening_result, screening_flags_json, clearance_status, consent_to_store, consent_to_share_flight_surgeon,
        clinician_note, reviewed_by, submitted_at, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL)`
    )
    .run(
      input.astronautId || null,
      input.candidateName.trim(),
      input.callSign.trim().toUpperCase(),
      Number(input.age),
      input.bloodType.trim(),
      input.targetMission.trim(),
      input.missionRole.trim(),
      Number(input.missionDurationDays),
      input.evaPlanned ? 1 : 0,
      Number(input.restingHrBpm),
      Number(input.systolicBp),
      Number(input.diastolicBp),
      Number(input.spo2Pct),
      input.ecgSummary.trim(),
      input.exerciseClearance,
      Number(input.nearVisionDiopter),
      input.vestibularEntStatus,
      Number(input.boneDensityZScore),
      input.labPanelStatus,
      input.immunizationsCurrent ? 1 : 0,
      input.allergiesText.trim() || 'NKDA',
      input.medicationsText.trim() || 'None',
      input.medicalHistorySummary.trim(),
      input.attachmentName || null,
      input.attachmentMime || null,
      input.attachmentSizeBytes || null,
      input.attachmentDataBase64 || null,
      screeningResult,
      JSON.stringify(screeningFlags),
      'PENDING_FLIGHT_SURGEON',
      1,
      input.consentToShareFlightSurgeon ? 1 : 0,
      now
    );

  // Optionally sync personal baseline vitals for roster astronaut if explicitly requested
  if (input.syncBaselineIfRoster && input.astronautId) {
    db.prepare(
      `UPDATE personal_baselines
       SET heart_rate_bpm = ?, systolic_bp = ?, diastolic_bp = ?, spo2_pct = ?
       WHERE astronaut_id = ?`
    ).run(
      Number(input.restingHrBpm),
      Number(input.systolicBp),
      Number(input.diastolicBp),
      Number(input.spo2Pct),
      Number(input.astronautId)
    );
  }

  const inserted = db
    .prepare('SELECT * FROM pre_mission_medical_reports WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
  return rowToReport(inserted);
}

export function reviewPreMissionReport(
  id: number,
  clearanceStatus: PreMissionClearanceStatus,
  clinicianNote: string,
  reviewedBy: string
): PreMissionMedicalReport | null {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `UPDATE pre_mission_medical_reports
       SET clearance_status = ?, clinician_note = ?, reviewed_by = ?, reviewed_at = ?
       WHERE id = ?`
    )
    .run(clearanceStatus, clinicianNote, reviewedBy, now, id);
  if (info.changes === 0) return null;
  const row = db
    .prepare('SELECT * FROM pre_mission_medical_reports WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return rowToReport(row);
}
