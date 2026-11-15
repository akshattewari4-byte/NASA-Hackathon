import type { DiseaseRiskItem, HealthReading, PersonalBaseline } from '../src/types/astrocare.ts';

export function analyzeDiseaseRisks(reading: HealthReading, baseline: PersonalBaseline): DiseaseRiskItem[] {
  const risks: DiseaseRiskItem[] = [];

  // 1. Hypercapnia / Cabin CO2 Toxicity Risk
  if (reading.cabinCo2Mmhg >= 3.2 || reading.spo2Pct < 95.5) {
    const isCritical = reading.cabinCo2Mmhg >= 6.5 || reading.spo2Pct <= 90;
    const isHigh = !isCritical && (reading.cabinCo2Mmhg >= 4.2 || reading.spo2Pct <= 93);
    const triggers: string[] = [];
    if (reading.cabinCo2Mmhg >= 3.2) triggers.push(`Cabin ppCO2 ${reading.cabinCo2Mmhg.toFixed(2)} mmHg`);
    if (reading.spo2Pct < 95.5) triggers.push(`SpO2 ${reading.spo2Pct.toFixed(1)}%`);
    if (reading.respiratoryRate > baseline.respiratoryRate + 3) {
      triggers.push(`Respiratory Rate ${Math.round(reading.respiratoryRate)}/min`);
    }

    risks.push({
      id: 'hypercapnia-hypoxia',
      conditionName: 'Cabin Hypercapnia / Hypoxic Respiratory Strain Risk',
      category: 'Pulmonary & Environmental ECLSS',
      severity: isCritical ? 'CRITICAL' : isHigh ? 'HIGH' : 'MODERATE',
      confidencePct: triggers.length >= 2 ? 84 : null,
      triggeringParameters: triggers,
      explanation:
        'Elevated cabin carbon dioxide partial pressure or reduced arterial oxygen saturation indicates potential CO2 scrubber degradation or respiratory ventilation stress.',
      specialist: 'Pulmonologist & Aerospace ECLSS Flight Surgeon',
      diagnosticTests: [
        'Continuous pulse oximetry & capnography verification',
        'CDRA CO2 scrubber bed & cabin O2 partial pressure check',
        'Neurocognitive headache / confusion screening',
      ],
      treatmentApproaches: [
        'Immediate cabin atmosphere scrubbing / emergency O2 mask if SpO2 <= 90%',
        'Ventilation airflow augmentation and cessation of aerobic exertion',
      ],
      formularyForClinicianReview: [
        'Supplemental Oxygen Therapy (Flight Surgeon / Emergency Protocol)',
        'Acetaminophen 500mg (for CO2-related headache only after cabin air correction)',
      ],
      redFlagWarnings: [
        'SpO2 <= 90% or cyanosis',
        'Confusion, severe throbbing headache, or air hunger',
      ],
      recoveryMeasures: {
        lifestyle: ['Suspend strenuous tasks immediately', 'Remain in well-ventilated habitat node'],
        activityOrRest: ['Strict physical rest — DO NOT perform ARED or CEVIS exercise while ppCO2 is elevated'],
        diet: ['Light easily digestible meals only'],
        hydration: ['Maintain standard mission hydration'],
        sleepRecovery: ['Verify cabin ppCO2 < 3.0 mmHg before sleep cycle'],
        environmental: ['Verify CDRA desiccant/adsorbent beds and secondary LiOH canisters'],
        contraindications: ['Strenuous exercise is contraindicated during hypercapnia because it elevates CO2 production'],
      },
      complementaryInfo: isCritical || isHigh
        ? undefined
        : 'Optional wellness note (not a medical substitute): calm nasal breathing at rest while ECLSS airflow stabilizes.',
      protocolRef: 'NASA-MED-01',
    });
  }

  // 2. Cardiovascular / Orthostatic Strain Risk
  const hrDiff = reading.heartRateBpm - baseline.heartRateBpm;
  if (reading.heartRateBpm >= 100 || Math.abs(hrDiff) >= 18 || reading.systolicBp >= 145 || reading.systolicBp <= 90) {
    const isCritical = reading.heartRateBpm >= 135 || reading.systolicBp >= 180 || reading.systolicBp <= 75;
    const isHigh = !isCritical && (reading.heartRateBpm >= 112 || reading.systolicBp >= 150 || reading.systolicBp <= 88);
    const triggers = [
      `Heart Rate ${Math.round(reading.heartRateBpm)} BPM (baseline ${Math.round(baseline.heartRateBpm)})`,
      `Blood Pressure ${Math.round(reading.systolicBp)}/${Math.round(reading.diastolicBp)} mmHg`,
      `ECG: ${reading.ecgRhythm} (ST ${reading.ecgStMv.toFixed(2)} mV)`,
    ];

    risks.push({
      id: 'cardio-orthostatic',
      conditionName: 'Cardiovascular Autonomic / Orthostatic Strain Risk',
      category: 'Cardiovascular',
      severity: isCritical ? 'CRITICAL' : isHigh ? 'HIGH' : 'MODERATE',
      confidencePct: 79,
      triggeringParameters: triggers,
      explanation:
        'Heart rate or arterial blood pressure deviated substantially from personal microgravity baseline, which can reflect fluid shift, orthostatic intolerance, or arrhythmia.',
      specialist: 'Aerospace Cardiologist',
      diagnosticTests: ['12-lead / Lead-II ECG transmission', 'Serial seated/supine BP x3', 'Serum electrolyte panel'],
      treatmentApproaches: [
        'Immediate physical rest and ECG telemetry uplink',
        'Targeted fluid/electrolyte management only if normotensive/hypotensive',
      ],
      formularyForClinicianReview: [
        'Oral Rehydration Electrolyte Salts (contraindicated if hypertensive)',
        'Beta-blocker or antiarrhythmic review strictly by Earth Cardiologist',
      ],
      redFlagWarnings: ['Chest pressure/pain', 'Syncope or near-fainting', 'HR >= 135 BPM at rest'],
      recoveryMeasures: {
        lifestyle: ['Stop EVA or heavy payload transfer', 'Keep torso supported'],
        activityOrRest: ['Rest until heart rate returns within 15% of personal baseline'],
        diet: reading.systolicBp >= 140 ? ['Avoid high-sodium rations'] : ['Standard balanced crew nutrition'],
        hydration: reading.systolicBp >= 140 ? ['Normal measured water intake; avoid rapid salt-fluid loading'] : ['Measured oral hydration with electrolytes if cleared'],
        sleepRecovery: ['Avoid caffeine and ensure full sleep window'],
        environmental: ['Maintain cool cabin temperature (20–22 °C)'],
        contraindications: ['Do not use high-sodium fluid loading when blood pressure is elevated (>= 140 mmHg systolic)'],
      },
      complementaryInfo: isCritical || isHigh
        ? undefined
        : 'Optional wellness note (not a medical substitute): slow vagal-calming exhalation breathing while resting.',
      protocolRef: 'NASA-MED-03',
    });
  }

  // 3. Space Radiation Exposure Risk
  if (reading.radiationMsvDay >= 1.1) {
    const isCritical = reading.radiationMsvDay >= 10.0;
    const isHigh = !isCritical && reading.radiationMsvDay >= 2.5;
    risks.push({
      id: 'radiation-spe',
      conditionName: 'Elevated Space Radiation / Solar Particle Exposure Risk',
      category: 'Space Radiation',
      severity: isCritical ? 'CRITICAL' : isHigh ? 'HIGH' : 'MODERATE',
      confidencePct: 91,
      triggeringParameters: [`Active Dosimetry ${reading.radiationMsvDay.toFixed(2)} mSv/day (baseline ${baseline.radiationMsvDay.toFixed(2)})`],
      explanation:
        'Active personal and habitat TEPC dosimeters show ionizing flux above baseline background, indicating geomagnetic anomaly passage or a Solar Particle Event.',
      specialist: 'Radiation Health Officer & Hematologist',
      diagnosticTests: ['30-minute TEPC dosimetry trending', 'Complete blood count (CBC) if cumulative threshold exceeded'],
      treatmentApproaches: ['Immediate physical shielding (water-wall / polyethylene storm shelter)', 'Mission EVA deferral'],
      formularyForClinicianReview: [
        'Ondansetron ODT 4mg (prodromal nausea review by Flight Surgeon)',
        'Hematopoietic cytokine support strictly per Earth Radiation Board',
      ],
      redFlagWarnings: ['Dose > 10 mSv/day', 'Unexplained fatigue, nausea, or mucosal symptoms'],
      recoveryMeasures: {
        lifestyle: ['Remain inside shielded habitat core; cancel any EVA'],
        activityOrRest: ['Minimize transit through unshielded viewport cupolas'],
        diet: ['Antioxidant-rich standard crew diet (not a substitute for shielding)'],
        hydration: ['Maintain 2.5 L/day water intake'],
        sleepRecovery: ['Sleep inside highest mass-shielded crew berth'],
        environmental: ['Close cupola shutters and orient spacecraft water-wall toward solar vector'],
        contraindications: ['No traditional or herbal remedy can reverse ionizing radiation damage; physical shielding is mandatory'],
      },
      protocolRef: 'NASA-MED-02',
    });
  }

  // 4. Behavioral, Sleep & Immune Disruption
  if (reading.sleepHours <= baseline.sleepHours - 1.2 || reading.stressIndex >= 65 || reading.immuneScore < 78 || reading.bodyTempC >= 37.8) {
    const isHigh = reading.bodyTempC >= 38.2 || reading.sleepHours < 4.5;
    const triggers: string[] = [];
    if (reading.sleepHours <= baseline.sleepHours - 1.2) triggers.push(`Sleep ${reading.sleepHours.toFixed(1)} hrs`);
    if (reading.stressIndex >= 65) triggers.push(`Stress Index ${Math.round(reading.stressIndex)}/100`);
    if (reading.immuneScore < 78) triggers.push(`Immune Readiness ${Math.round(reading.immuneScore)}/100`);
    if (reading.bodyTempC >= 37.8) triggers.push(`Temp ${reading.bodyTempC.toFixed(1)} °C`);

    risks.push({
      id: 'behavioral-immune',
      conditionName: 'Circadian Sleep, Isolation Stress & Immune Shift Risk',
      category: 'Behavioral Health & Immunology',
      severity: isHigh ? 'HIGH' : 'MODERATE',
      confidencePct: triggers.length >= 2 ? 76 : null,
      triggeringParameters: triggers,
      explanation:
        'Multi-parameter drift in sleep duration, perceived isolation stress, or immune biomarkers increases fatigue errors and latent viral reactivation risk.',
      specialist: 'Aerospace Behavioral Health Specialist & General Physician',
      diagnosticTests: ['Actigraphy & circadian phase review', 'Targeted viral/febrile symptom screening'],
      treatmentApproaches: ['Protected sleep opportunity', 'Work-rest schedule rebalancing', 'Private Earth Behavioral conference'],
      formularyForClinicianReview: [
        'Melatonin / Sleep Regulation Protocol Pack (clinician reviewed)',
        'Acetaminophen 500mg (if febrile >= 38.0 °C after Flight Surgeon consult)',
      ],
      redFlagWarnings: ['Persistent fever >= 38.5 °C', 'Severe insomnia > 48h or acute mood crisis'],
      recoveryMeasures: {
        lifestyle: ['Defer non-urgent precision tasks', 'Connect with crewmates or family downlink'],
        activityOrRest: ['Light daytime mobility; avoid high-intensity exercise within 3h of sleep'],
        diet: ['Avoid caffeine > 8h prior to sleep window'],
        hydration: ['Adequate water intake; warm herbal infusion if desired'],
        sleepRecovery: ['Enforce 8.5h dark/quiet berth period with blue-depleted cabin lighting'],
        environmental: ['Shift cabin LEDs to warm 2700K evening spectrum'],
        contraindications: ['Never combine sleep aids during critical EVA standby shifts'],
      },
      complementaryInfo: isHigh
        ? undefined
        : 'Optional complementary wellness (distinct from medical care): 10-minute paced pranayama/box breathing and structured mindfulness decompression.',
      protocolRef: 'NASA-MED-04',
    });
  }

  // 5. Altered-Gravity Bone & Muscle Deconditioning Risk
  if (reading.boneMuscleIndex < 82 || reading.activityMins < 45) {
    risks.push({
      id: 'bone-muscle-deconditioning',
      conditionName: 'Altered-Gravity Bone Loss & Muscle Deconditioning Risk',
      category: 'Musculoskeletal',
      severity: reading.boneMuscleIndex < 72 ? 'HIGH' : 'MODERATE',
      confidencePct: 81,
      triggeringParameters: [
        `Bone/Muscle Index ${reading.boneMuscleIndex.toFixed(1)}%`,
        `Daily ARED/CEVIS Activity ${Math.round(reading.activityMins)} min`,
      ],
      explanation:
        'Reduced mechanical loading in microgravity accelerates bone mineral resorption and skeletal muscle atrophy when ARED resistive sessions drop below mission target.',
      specialist: 'Aerospace Musculoskeletal & Sports Medicine Physician',
      diagnosticTests: ['ARED force-plate load audit', 'Urinary calcium / bone turnover markers'],
      treatmentApproaches: ['Progressive ARED resistive countermeasure loading', 'Vitamin D3 & dietary protein optimization'],
      formularyForClinicianReview: ['Potassium Citrate 10mEq (renal stone prophylaxis during bone resorption)'],
      redFlagWarnings: ['Flank pain (renal stone risk)', 'Acute tendon or lower-back strain during ARED'],
      recoveryMeasures: {
        lifestyle: ['Prioritize scheduled 60-min ARED + 30-min CEVIS/T2 block'],
        activityOrRest: ['Gradual resistive reload if recovering from missed sessions'],
        diet: ['Adequate protein (1.4 g/kg) and prescribed Vitamin D3 supplementation'],
        hydration: ['Increase hydration >= 2.5 L/day to reduce calcium stone risk'],
        sleepRecovery: ['Allow 48h muscle group recovery between maximal deadlift/squat sets'],
        environmental: ['Inspect ARED vacuum cylinder pressure seals before loading'],
        contraindications: ['Suspend heavy ARED loading if cardiovascular, febrile, or cabin CO2 alerts are active'],
      },
      complementaryInfo: 'Optional wellness note: gentle microgravity spinal elongation stretching post-ARED.',
      protocolRef: 'NASA-MED-05',
    });
  }

  return risks;
}
