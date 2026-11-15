import { GoogleGenAI } from '@google/genai';
import type {
  AstraAssistantResponse,
  AstronautProfile,
  DiseaseRiskItem,
} from '../src/types/astrocare.ts';

const TRANSPARENCY_NOTICE = 'AI provides decision support, not a medical diagnosis.';

function buildDeterministicResponse(
  question: string,
  astronaut: AstronautProfile,
  risks: DiseaseRiskItem[],
  isSimulated: boolean
): AstraAssistantResponse {
  const { assessment, latestReading, baseline } = astronaut;
  const q = question.toLowerCase();
  const isEmergency = assessment.severityLevel === 4;

  // Deterministic safe rule-based response aligned with Levels 1-4
  let answer = '';
  if (isEmergency) {
    answer =
      `EMERGENCY PROTOCOL ACTIVE (${assessment.severityLabel}). ${assessment.emergencyReason ?? assessment.summary} ` +
      `Follow the mission emergency medical checklist immediately: ${assessment.recommendedActions[0]}. ` +
      `Earth Medical Station notification is required as soon as communication is available.`;
  } else if (q.includes('ayurved') || q.includes('complementary') || q.includes('herbal') || q.includes('traditional')) {
    if (assessment.severityLevel >= 3) {
      answer =
        `Because your current classification is ${assessment.severityLabel}, optional Ayurvedic or complementary measures must NOT delay or substitute professional medical evaluation. ` +
        `Prioritize clinical steps first: ${assessment.recommendedActions.join(' ')}`;
    } else if (assessment.severityLevel === 2) {
      answer =
        `Your current status is ${assessment.severityLabel}. Evidence-based medical monitoring comes first (${assessment.recommendedActions[0]}). ` +
        `As an optional non-interfering wellness support alongside monitoring: paced breathwork, adequate mission hydration, and rest are acceptable — never as a replacement for medical follow-up.`;
    } else {
      answer =
        `Your status is ${assessment.severityLabel}. Alongside normal mission protocols, optional complementary wellness practices (such as 10 minutes of paced breathing, warm hydration, and gentle stretching) may support comfort. These are wellness practices, not medical treatments.`;
    }
  } else if (q.includes('suit') || q.includes('battery') || q.includes('eva') || q.includes('seal') || q.includes('pressure')) {
    const suit = astronaut.suit;
    answer =
      `Spacesuit ${suit.suitId} Telemetry: Mode ${suit.evaMode}, Seal ${suit.sealStatus}, Battery ${suit.batteryPct.toFixed(1)}%, O2 Reserve ${suit.o2ReservePct.toFixed(1)}%, Suit Pressure ${suit.suitPressureKpa.toFixed(1)} kPa, Thermal Loop ${suit.thermalLoopC.toFixed(1)} °C. ` +
      (suit.batteryPct < 25 || suit.sealStatus !== 'SEALED'
        ? 'PRIORITY SAFETY ACTION: Abort EVA task, return immediately to airlock, and dock umbilical power/O2.'
        : 'Suit life-support envelope is nominal for current mission mode.');
  } else if (q.includes('radiation') || q.includes('solar') || q.includes('storm')) {
    answer =
      `Space Radiation Dosimetry: ${latestReading.radiationMsvDay.toFixed(2)} mSv/day (baseline ${baseline.radiationMsvDay.toFixed(2)} mSv/day), mission cumulative ~${astronaut.suit.cumulativeDoseMsv.toFixed(1)} mSv. ` +
      (latestReading.radiationMsvDay >= 2.5
        ? 'HIGH RADIATION ALERT: Relocate crew immediately to high-density polyethylene / water-shielded habitat Storm Shelter and defer EVA.'
        : 'Dosimetry within routine Low Earth Orbit geomagnetic background.');
  } else if (q.includes('exercise') || q.includes('offline') || q.includes('remed') || q.includes('aid is not')) {
    answer =
      assessment.severityLevel >= 3
        ? `Because your current classification is ${assessment.severityLabel}, avoid physical exercise and prioritize emergency stabilization + Earth Medical Station escalation.`
        : `For stable Level 1–2 crew when direct medical aid is delayed: use gentle diaphragmatic breathing (4-2-6), hourly ankle pumps / isometric calf squeezes for venous return, small-sip hydration, and neutral rest. Stop immediately if dizziness, fever, high CO2, or chest discomfort develops.`;
  } else if (q.includes('serious') || q.includes('why') || q.includes('alert')) {
    answer =
      `Current assessment: ${assessment.severityLabel} (${assessment.status}). ` +
      `Main triggering indicators compared against ${astronaut.fullName}'s personal baseline: ${assessment.mainIndicators.join('; ')}. ` +
      `${risks.length > 0 ? `Flagged concern(s): ${risks.map((r) => r.conditionName).join(', ')}. ` : ''}` +
      `${assessment.summary}`;
  } else if (q.includes('contact') || q.includes('medical station') || q.includes('earth')) {
    answer = assessment.earthMedicalSupportRequired
      ? `YES — Earth Medical Station contact is recommended (${assessment.severityLabel}). Transmit current telemetry (${latestReading.heartRateBpm} BPM, SpO2 ${latestReading.spo2Pct}%, CO2 ${latestReading.cabinCo2Mmhg} mmHg) and consult the Flight Surgeon.`
      : `Direct Earth Medical Station escalation is not urgently required right now (${assessment.severityLabel}), unless symptoms worsen or persist beyond ${assessment.monitoringInterval}.`;
  } else if (q.includes('when') || q.includes('check')) {
    answer = `Recommended reassessment schedule: ${assessment.monitoringInterval}. Escalate immediately if: ${assessment.whenToEscalate}`;
  } else {
    answer =
      `Assessment for ${astronaut.fullName} (Mission Day ${astronaut.missionDay}): ${assessment.severityLabel}. ` +
      `Recommended immediate action: ${assessment.recommendedActions.join(' ')} ` +
      `(HR ${Math.round(latestReading.heartRateBpm)} vs baseline ${Math.round(baseline.heartRateBpm)} BPM; SpO2 ${latestReading.spo2Pct.toFixed(1)}% vs ${baseline.spo2Pct.toFixed(1)}%; Suit ${astronaut.suit.suitId} ${astronaut.suit.batteryPct.toFixed(0)}% bat).`;
  }

  return {
    answer,
    currentSeverity: assessment.severityLabel,
    severityLevel: assessment.severityLevel,
    mainIndicators: assessment.mainIndicators,
    recommendedAction: assessment.recommendedActions[0] || 'Continue baseline monitoring.',
    monitoringInterval: assessment.monitoringInterval,
    whenToEscalate: assessment.whenToEscalate,
    earthMedicalSupportRequired: assessment.earthMedicalSupportRequired,
    complementaryWellnessInfo:
      assessment.severityLevel <= 2
        ? assessment.complementaryNote ||
          'Optional wellness only (not medical care): paced breathing, measured hydration, and sleep hygiene. Verify no interaction with onboard medications.'
        : undefined,
    transparencyNotice: TRANSPARENCY_NOTICE,
    source: 'CLINICAL_PROTOCOL_ENGINE',
    isSimulatedData: isSimulated,
  };
}

export async function queryAstraAssistant(
  question: string,
  astronaut: AstronautProfile,
  risks: DiseaseRiskItem[],
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  isSimulated: boolean
): Promise<AstraAssistantResponse> {
  const deterministic = buildDeterministicResponse(question, astronaut, risks, isSimulated);
  const apiKey = process.env.GEMINI_API_KEY;

  // CRITICAL SAFETY RULE: Level 4 Critical/Emergency uses validated deterministic protocol directly
  // and never allows an LLM to override or inject complementary/Ayurvedic alternatives.
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || astronaut.assessment.severityLevel === 4) {
    return deterministic;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const { latestReading, baseline, assessment } = astronaut;

    const systemPrompt = [
      'You are ASTRA Health Assistant, a calm, professional NASA astronaut clinical decision-support assistant.',
      'STRICT MEDICAL SAFETY RULES:',
      '1. Never claim to diagnose a disease.',
      '2. Never prescribe medications, dosages, or independently recommend an Ayurvedic remedy as treatment.',
      '3. Never present Ayurveda or complementary approaches as a replacement for emergency or necessary medical care.',
      '4. For Level 3 High Risk or uncertain symptoms, prioritize professional medical evaluation and Earth station notification.',
      '5. Keep answers concise, clear, calm, non-gamified, and usable under spaceflight stress.',
      '6. Explicitly state uncertainty and remind that AI provides decision support, not a medical diagnosis.',
      `Astronaut: ${astronaut.fullName} (Day ${astronaut.missionDay}, Role: ${astronaut.missionRole})`,
      `Validated Rule-Based Severity (DO NOT DOWNGRADE): ${assessment.severityLabel}`,
      `Main Indicators: ${assessment.mainIndicators.join(' | ')}`,
      `Current vs Baseline: HR ${latestReading.heartRateBpm}/${baseline.heartRateBpm} BPM, BP ${latestReading.systolicBp}/${latestReading.diastolicBp} vs ${baseline.systolicBp}/${baseline.diastolicBp} mmHg, SpO2 ${latestReading.spo2Pct}/${baseline.spo2Pct}%, Temp ${latestReading.bodyTempC}/${baseline.bodyTempC} C, CO2 ${latestReading.cabinCo2Mmhg}/${baseline.cabinCo2Mmhg} mmHg, Pressure ${latestReading.cabinPressureKpa} kPa, Rad ${latestReading.radiationMsvDay}/${baseline.radiationMsvDay} mSv/d, Sleep ${latestReading.sleepHours}/${baseline.sleepHours}h.`,
      `Spacesuit (${astronaut.suit.suitId}): Mode ${astronaut.suit.evaMode}, Seal ${astronaut.suit.sealStatus}, Battery ${astronaut.suit.batteryPct}%, O2 ${astronaut.suit.o2ReservePct}%, Pressure ${astronaut.suit.suitPressureKpa} kPa.`,
      `Flagged Risks: ${risks.map((r) => `${r.conditionName} (${r.severity})`).join('; ') || 'None'}`,
    ].join('\n');

    const transcript = history
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'Astronaut' : 'ASTRA'}: ${m.text}`)
      .join('\n');

    let timer: NodeJS.Timeout | undefined;
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${systemPrompt}\n\nConversation:\n${transcript}\nAstronaut question: ${question}\n\nRespond clearly in 3-5 sentences covering what is happening, seriousness, immediate action, and reassessment.`,
        config: {
          temperature: 0.2,
          maxOutputTokens: 320,
        },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('ASTRA Gemini timeout')), 5000);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });

    const text = response.text?.trim();
    if (!text) return deterministic;

    return {
      ...deterministic,
      answer: text,
      source: 'GEMINI_BACKEND',
    };
  } catch {
    return deterministic;
  }
}
