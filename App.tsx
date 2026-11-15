import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Activity,
  Bell,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Dumbbell,
  FileBarChart2,
  FileCheck2,
  FlaskConical,
  Globe2,
  HeartPulse,
  Home,
  Info,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Microscope,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AboutUsView } from './components/AboutUsView.tsx';
import { AuthModal } from './components/AuthPages.tsx';
import { CrewWellbeingView } from './components/CrewWellbeingView.tsx';
import { DigitalTwinView } from './components/DigitalTwinView.tsx';
import { DiseaseDetectionView } from './components/DiseaseDetectionView.tsx';
import { EquipmentSimLabView } from './components/EquipmentSimLabView.tsx';
import { GeminiAssistantView } from './components/GeminiAssistantView.tsx';
import { HealthDashboardView } from './components/HealthDashboardView.tsx';
import { HomeView } from './components/HomeView.tsx';
import { LiveMonitoringView } from './components/LiveMonitoringView.tsx';
import { MedicalSupportView } from './components/MedicalSupportView.tsx';
import { OrbitalTrackingView } from './components/OrbitalTrackingView.tsx';
import { PreMissionMedicalView } from './components/PreMissionMedicalView.tsx';
import { ReportsAnalyticsView } from './components/ReportsAnalyticsView.tsx';
import { ResearchValidationView } from './components/ResearchValidationView.tsx';
import { SpaceEarthBackground } from './components/SpaceEarthBackground.tsx';
import { SuitResourcesView } from './components/SuitResourcesView.tsx';
import { Footer } from './components/ui/primitives.tsx';
import { VitalSignsView } from './components/VitalSignsView.tsx';
import {
  playArmConfirmChime,
  playEmergencyKlaxon,
  startEmergencyAlarmLoop,
  stopAlarmAudio,
  unlockAlarmAudio,
} from './lib/alarmAudio.ts';
import { apiFetch, setAuthToken } from './lib/api.ts';
import {
  clearQueuedOfflineReadings,
  getQueuedOfflineReadings,
  loadOfflineSnapshot,
  saveOfflineSnapshot,
} from './lib/offlineStore.ts';
import type {
  AppTab,
  AstronautProfile,
  AuthUser,
  EngineMode,
  ScenarioPreset,
  SpacecraftResources,
  StructuredAlert,
} from './types/astrocare.ts';

interface NavGroup {
  group: string;
  items: Array<{ id: AppTab; label: string; icon: typeof Home }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Command',
    items: [
      { id: 'home', label: 'Home & Twin', icon: Home },
      { id: 'twin', label: 'Digital Twin & AI', icon: Sparkles },
      { id: 'orbital', label: 'Orbital View', icon: Globe2 },
    ],
  },
  {
    group: 'Biometrics',
    items: [
      { id: 'live', label: 'Live Telemetry', icon: Activity },
      { id: 'dashboard', label: 'Health Dashboard', icon: LayoutDashboard },
      { id: 'vitals', label: 'Vital Signs', icon: HeartPulse },
      { id: 'wellbeing', label: 'Sleep, Bone & SANS', icon: Dumbbell },
    ],
  },
  {
    group: 'Survival & ECLSS',
    items: [
      { id: 'resources', label: 'Suit & Resources', icon: Cpu },
      { id: 'equipment', label: 'Equip & Sim Lab', icon: FlaskConical },
    ],
  },
  {
    group: 'Clinical AI',
    items: [
      { id: 'assistant', label: 'ASTRA Assistant', icon: Bot },
      { id: 'disease', label: 'Disease & Risk', icon: ShieldAlert },
      { id: 'preflight', label: 'Pre-Mission Medical', icon: FileCheck2 },
      { id: 'medical', label: 'Medical Support', icon: Stethoscope },
    ],
  },
  {
    group: 'Operations',
    items: [
      { id: 'reports', label: 'Reports & Export', icon: FileBarChart2 },
      { id: 'research', label: 'Research & Validation', icon: Microscope },
      { id: 'about', label: 'About Team', icon: Info },
    ],
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [astronauts, setAstronauts] = useState<AstronautProfile[]>([]);
  const [selectedAstronautId, setSelectedAstronautId] = useState<number>(1);
  const [alerts, setAlerts] = useState<StructuredAlert[]>([]);
  const [resources, setResources] = useState<SpacecraftResources | null>(null);
  const [engineMode, setEngineMode] = useState<EngineMode>('SIMULATION');
  const [scenario, setScenario] = useState<ScenarioPreset>('NOMINAL');
  const [earthCommsOnline, setEarthCommsOnline] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [utcClock, setUtcClock] = useState(() => new Date().toISOString().slice(11, 19));
  const [audioMuted, setAudioMuted] = useState(() => {
    try {
      return localStorage.getItem('astrocare_alarm_muted') === '1';
    } catch {
      return false;
    }
  });
  const [silencedDangerKey, setSilencedDangerKey] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => {
      setUtcClock(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Unlock browser AudioContext smoothly on first interaction
  useEffect(() => {
    const unlock = () => {
      unlockAlarmAudio();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [crewRes, alertRes] = await Promise.all([
        apiFetch<{
          astronauts: AstronautProfile[];
          resources?: SpacecraftResources;
          engine: { mode: EngineMode; scenario: ScenarioPreset; earthCommsOnline: boolean };
        }>('/api/astronauts'),
        apiFetch<{ alerts: StructuredAlert[] }>('/api/alerts'),
      ]);
      setAstronauts(crewRes.astronauts);
      if (crewRes.resources) setResources(crewRes.resources);
      setEngineMode(crewRes.engine.mode);
      setScenario(crewRes.engine.scenario);
      setEarthCommsOnline(crewRes.engine.earthCommsOnline);
      setAlerts(alertRes.alerts);
      saveOfflineSnapshot(crewRes.astronauts);
    } catch {
      const cached = loadOfflineSnapshot();
      if (cached && astronauts.length === 0) {
        setAstronauts(cached.astronauts);
      }
    }
  }, [astronauts.length]);

  useEffect(() => {
    refreshAll();
  }, []);

  // Online/offline listeners & auto-sync queue
  useEffect(() => {
    const onOnline = async () => {
      setIsOnline(true);
      const queued = getQueuedOfflineReadings();
      if (queued.length > 0) {
        for (const item of queued) {
          try {
            await apiFetch('/api/readings/manual', { method: 'POST', body: JSON.stringify(item) });
          } catch {
            // keep remaining
          }
        }
        clearQueuedOfflineReadings();
      }
      refreshAll();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshAll]);

  // WebSocket live telemetry stream
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let closedByUnmount = false;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        if (!closedByUnmount) {
          reconnectTimer = window.setTimeout(connect, 4000);
        }
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.astronauts) {
            setAstronauts(msg.astronauts);
            saveOfflineSnapshot(msg.astronauts);
          }
          if (msg.resources) setResources(msg.resources);
          if (msg.mode) setEngineMode(msg.mode);
          if (msg.scenario) setScenario(msg.scenario);
          if (typeof msg.earthCommsOnline === 'boolean') setEarthCommsOnline(msg.earthCommsOnline);
        } catch {
          // ignore malformed frames
        }
      };
    };

    connect();
    return () => {
      closedByUnmount = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const handleChangeMode = async (mode: EngineMode) => {
    const res = await apiFetch<{ mode: EngineMode }>('/api/engine/mode', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
    setEngineMode(res.mode);
  };

  const handleTriggerScenario = async (nextScenario: ScenarioPreset) => {
    const res = await apiFetch<{
      astronauts: AstronautProfile[];
      resources?: SpacecraftResources;
      scenario: ScenarioPreset;
    }>('/api/engine/scenario', {
      method: 'POST',
      body: JSON.stringify({ scenario: nextScenario, astronautId: selectedAstronautId }),
    });
    setScenario(res.scenario);
    setAstronauts(res.astronauts);
    if (res.resources) setResources(res.resources);
    await refreshAll();
  };

  const handleToggleEarthComms = async (online: boolean) => {
    await apiFetch('/api/engine/comms', {
      method: 'POST',
      body: JSON.stringify({ online }),
    });
    setEarthCommsOnline(online);
    await refreshAll();
  };

  const handleNotifyEarth = async () => {
    await apiFetch('/api/alerts/notify-earth', {
      method: 'POST',
      body: JSON.stringify({
        astronautId: selectedAstronautId,
        reason: 'Immediate medical evaluation uplink requested from ASTRA assistant.',
      }),
    });
    await refreshAll();
  };

  const handleAcknowledgeAlert = async (alertId: number) => {
    await apiFetch(`/api/alerts/${alertId}/ack`, { method: 'POST' });
    await refreshAll();
  };

  const handleSelectTab = (tab: AppTab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
    setAlertsOpen(false);
  };

  const activeAstronaut =
    astronauts.find((a) => a.id === selectedAstronautId) || astronauts[0] || null;
  const unacknowledgedAlerts = alerts.filter((al) => !al.acknowledged);
  const highestUnackedLevel = unacknowledgedAlerts.reduce(
    (max, al) => (al.severityLevel > max ? al.severityLevel : max),
    1
  );

  // Compute active crew danger state for acoustic warning engine
  const dangerState = useMemo(() => {
    let level: 0 | 3 | 4 = 0;
    const affected: string[] = [];

    for (const crew of astronauts) {
      const isCrit =
        crew.assessment.severityLevel === 4 || crew.suit.sealStatus === 'BREACH';
      const isHigh =
        crew.assessment.severityLevel === 3 ||
        crew.suit.sealStatus === 'WARNING' ||
        crew.suit.batteryPct < 20;

      if (isCrit) {
        level = 4;
        affected.push(`${crew.id}:4`);
      } else if (isHigh) {
        if (level < 3) level = 3;
        affected.push(`${crew.id}:3`);
      }
    }

    return {
      level,
      key: level > 0 ? `${level}|${affected.join(',')}` : '',
    };
  }, [astronauts]);

  const isAlarmSounding =
    dangerState.level >= 3 && !audioMuted && silencedDangerKey !== dangerState.key;

  // Clear any prior silence when danger clears
  useEffect(() => {
    if (dangerState.level === 0 && silencedDangerKey !== null) {
      setSilencedDangerKey(null);
    }
  }, [dangerState.level, silencedDangerKey]);

  // Play & loop NASA klaxon audio when astronaut enters L3 (High Risk) or L4 (Critical Emergency)
  useEffect(() => {
    if (!isAlarmSounding || dangerState.level === 0) {
      stopAlarmAudio();
      return;
    }

    void startEmergencyAlarmLoop(dangerState.level);
    return () => {
      stopAlarmAudio();
    };
  }, [isAlarmSounding, dangerState.level, dangerState.key]);

  const handleToggleMute = async () => {
    await unlockAlarmAudio();
    setAudioMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('astrocare_alarm_muted', next ? '1' : '0');
      } catch {
        // ignore storage restrictions
      }
      if (next) {
        stopAlarmAudio();
      } else if (dangerState.level === 0) {
        void playArmConfirmChime();
      }
      return next;
    });
  };

  const handleSilenceAlarm = () => {
    stopAlarmAudio();
    if (dangerState.key) {
      setSilencedDangerKey(dangerState.key);
    }
  };

  const handleTestAlarm = async () => {
    await unlockAlarmAudio();
    if (audioMuted) {
      setAudioMuted(false);
      try {
        localStorage.setItem('astrocare_alarm_muted', '0');
      } catch {
        // ignore
      }
    }
    void playEmergencyKlaxon();
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen bg-[#050914] text-slate-100">
        <SpaceEarthBackground hidden={activeTab === 'orbital'} />

        <div className="relative z-10 flex min-h-screen">
          {/* Mobile Drawer Backdrop */}
          {mobileNavOpen && (
            <div
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-40 bg-black/70 lg:hidden"
            />
          )}

          {/* Collapsible Mission Control Left Sidebar */}
          <aside
            className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800/90 bg-[#070d1b] transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
              mobileNavOpen ? 'translate-x-0 w-64' : '-translate-x-full'
            } ${sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-64'}`}
          >
            {/* Sidebar Brand Header */}
            <div className="flex h-14 items-center justify-between border-b border-slate-800/90 px-3.5">
              <button
                type="button"
                onClick={() => handleSelectTab('home')}
                className="flex items-center gap-2 text-left whitespace-nowrap overflow-hidden"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-500/40 bg-cyan-500/10 font-mono-tabular text-xs font-bold text-cyan-300">
                  AC
                </span>
                {!sidebarCollapsed && (
                  <span className="font-display text-base font-bold tracking-tight text-white">
                    ASTROCARE
                  </span>
                )}
              </button>

              <button
                type="button"
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                onClick={() => setSidebarCollapsed((c) => !c)}
                className="hidden rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white lg:inline-flex"
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Grouped Navigation */}
            <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-4">
              {NAV_GROUPS.map((grp) => (
                <div key={grp.group} className="space-y-1">
                  {!sidebarCollapsed && (
                    <div className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {grp.group}
                    </div>
                  )}
                  {grp.items.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    const showAlertCount = tab.id === 'dashboard' && unacknowledgedAlerts.length > 0;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        title={sidebarCollapsed ? tab.label : undefined}
                        onClick={() => handleSelectTab(tab.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                          active
                            ? 'bg-cyan-500/15 text-cyan-300'
                            : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                        } ${sidebarCollapsed ? 'lg:justify-center' : 'justify-between'}`}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4 shrink-0" />
                          {!sidebarCollapsed && <span>{tab.label}</span>}
                        </span>
                        {!sidebarCollapsed && showAlertCount && (
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold ${
                              highestUnackedLevel === 4
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {unacknowledgedAlerts.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Sidebar Crew & Station Footer */}
            {!sidebarCollapsed && activeAstronaut && (
              <div className="border-t border-slate-800/90 p-3 font-mono-tabular text-[11px] text-slate-400">
                <div className="flex items-center justify-between text-slate-200">
                  <span>{activeAstronaut.callSign}</span>
                  <span className={activeAstronaut.suit.batteryPct < 30 ? 'text-rose-400' : 'text-cyan-300'}>
                    SUIT {Math.round(activeAstronaut.suit.batteryPct)}%
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-slate-500">
                  {activeAstronaut.missionName} · MD-{activeAstronaut.missionDay}
                </div>
              </div>
            )}
          </aside>

          {/* Right Workspace Column */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Single-Row Mission Control Telemetry Header */}
            <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-800/90 bg-[#050914]/95 px-4 sm:px-6">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  aria-label="Open menu"
                  onClick={() => setMobileNavOpen(true)}
                  className="rounded-lg border border-slate-800 p-1.5 text-slate-300 hover:border-cyan-500 lg:hidden"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2.5 text-xs">
                  <span className="font-display font-semibold text-white whitespace-nowrap">
                    {NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label ?? 'ASTROCARE'}
                  </span>
                  <span className="hidden text-slate-600 sm:inline">|</span>
                  <span className="hidden font-mono-tabular text-slate-400 sm:inline whitespace-nowrap">
                    UTC {utcClock}
                  </span>
                  <span className="hidden text-slate-600 md:inline">|</span>
                  <span
                    className={`hidden font-mono-tabular text-[11px] font-semibold md:inline whitespace-nowrap ${
                      engineMode === 'SIMULATION' ? 'text-cyan-300' : 'text-emerald-400'
                    }`}
                  >
                    {engineMode === 'SIMULATION' ? 'SIMULATED DATA' : 'LIVE SENSOR STREAM'}
                  </span>
                  {resources && (
                    <>
                      <span className="hidden text-slate-600 xl:inline">|</span>
                      <span className="hidden font-mono-tabular text-[11px] text-slate-400 xl:inline whitespace-nowrap">
                        P {resources.cabinPressureKpa.toFixed(1)} kPa · H2O {Math.round(resources.waterLiters)}L · O2 {Math.round(resources.oxygenKg)}kg
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="relative flex items-center gap-2 shrink-0">
                {!isOnline && (
                  <span className="font-mono-tabular text-xs font-semibold text-amber-400 whitespace-nowrap">
                    OFFLINE CACHE
                  </span>
                )}

                {isAlarmSounding && (
                  <button
                    type="button"
                    onClick={handleSilenceAlarm}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap ${
                      dangerState.level === 4
                        ? 'bg-rose-600 hover:bg-rose-500'
                        : 'bg-orange-600 hover:bg-orange-500'
                    }`}
                  >
                    Silence Siren
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleToggleMute}
                  title={audioMuted ? 'Danger alarm muted — click to arm' : 'Danger alarm armed — click to mute'}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs whitespace-nowrap ${
                    audioMuted
                      ? 'border-slate-700 bg-[#0b1120] text-slate-400 hover:border-cyan-500'
                      : isAlarmSounding
                      ? 'border-rose-500/70 bg-rose-950/60 text-rose-200'
                      : 'border-slate-700 bg-[#0b1120] text-cyan-300 hover:border-cyan-500'
                  }`}
                >
                  {audioMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  <span className="hidden md:inline">{audioMuted ? 'Alarm Muted' : 'Alarm Armed'}</span>
                </button>

                {/* Intelligent Alerts Notification Drawer Trigger */}
                <button
                  type="button"
                  onClick={() => setAlertsOpen((o) => !o)}
                  className={`relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs whitespace-nowrap ${
                    unacknowledgedAlerts.length > 0 && highestUnackedLevel === 4
                      ? 'border-rose-500/60 bg-rose-950/50 text-rose-200'
                      : unacknowledgedAlerts.length > 0
                      ? 'border-amber-500/50 bg-amber-950/40 text-amber-200'
                      : 'border-slate-700 bg-[#0b1120] text-slate-300 hover:border-cyan-500'
                  }`}
                >
                  <Bell className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Alerts</span>
                  <span className="font-mono-tabular font-semibold">{unacknowledgedAlerts.length}</span>
                </button>

                {user ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthToken(null);
                      setUser(null);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0b1120] px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-500 whitespace-nowrap"
                  >
                    <LogOut className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{user.role}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAuth(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 whitespace-nowrap"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    <span>Crew Sign In</span>
                  </button>
                )}

                {/* Popover Alert Drawer */}
                {alertsOpen && (
                  <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-slate-700 bg-[#070d1b] p-3 shadow-2xl sm:w-96">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 text-xs">
                      <span className="font-semibold text-white">
                        Intelligent Mission Alerts ({unacknowledgedAlerts.length} active)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleTestAlarm}
                          className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-300 hover:bg-rose-500/20 whitespace-nowrap"
                        >
                          Test Siren
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectTab('dashboard')}
                          className="text-cyan-400 hover:text-cyan-300 whitespace-nowrap"
                        >
                          Open Console →
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                      {unacknowledgedAlerts.length === 0 ? (
                        <div className="py-4 text-center text-xs text-slate-400">
                          No unacknowledged alerts. All mission parameters monitored.
                        </div>
                      ) : (
                        unacknowledgedAlerts.slice(0, 6).map((al) => (
                          <div
                            key={al.id}
                            className="rounded-lg border border-slate-800 bg-[#0b1120] p-2.5 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-semibold text-slate-100">
                                L{al.severityLevel} · {al.title}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAcknowledgeAlert(al.id)}
                                className="inline-flex items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-cyan-500 whitespace-nowrap"
                              >
                                <Check className="h-2.5 w-2.5" />
                                Ack
                              </button>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">{al.whatChanged}</p>
                            <p className="mt-1 text-[11px] text-cyan-300">{al.whatToDo}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </header>

            {/* Main Content */}
            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
              {!activeAstronaut ? (
                <div className="rounded-xl border border-slate-800 bg-[#0b1120]/90 p-10 text-center text-sm text-slate-300">
                  Initializing ASTROCARE telemetry and orbital engines...
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                  >
                    {activeTab === 'home' && (
                      <HomeView
                        astronaut={activeAstronaut}
                        astronauts={astronauts}
                        engineMode={engineMode}
                        isOnline={isOnline}
                        resources={resources}
                        isAlarmSounding={isAlarmSounding}
                        onSilenceAlarm={handleSilenceAlarm}
                        onSelectAstronaut={setSelectedAstronautId}
                        onNavigate={handleSelectTab}
                        onRefresh={refreshAll}
                        onTriggerScenario={handleTriggerScenario}
                      />
                    )}
                    {activeTab === 'twin' && (
                      <DigitalTwinView
                        astronaut={activeAstronaut}
                        astronauts={astronauts}
                        onSelectAstronaut={setSelectedAstronautId}
                      />
                    )}
                    {activeTab === 'orbital' && <OrbitalTrackingView />}
                    {activeTab === 'live' && (
                      <LiveMonitoringView
                        astronaut={activeAstronaut}
                        astronauts={astronauts}
                        engineMode={engineMode}
                        scenario={scenario}
                        wsConnected={wsConnected}
                        onSelectAstronaut={setSelectedAstronautId}
                        onChangeMode={handleChangeMode}
                        onTriggerScenario={handleTriggerScenario}
                        onRefresh={refreshAll}
                      />
                    )}
                    {activeTab === 'dashboard' && (
                      <HealthDashboardView
                        astronaut={activeAstronaut}
                        astronauts={astronauts}
                        alerts={alerts}
                        earthCommsOnline={earthCommsOnline}
                        onSelectAstronaut={setSelectedAstronautId}
                        onToggleEarthComms={handleToggleEarthComms}
                        onRefresh={refreshAll}
                        onNavigate={handleSelectTab}
                      />
                    )}
                    {activeTab === 'vitals' && (
                      <VitalSignsView
                        astronaut={activeAstronaut}
                        astronauts={astronauts}
                        onSelectAstronaut={setSelectedAstronautId}
                      />
                    )}
                    {activeTab === 'wellbeing' && (
                      <CrewWellbeingView
                        astronaut={activeAstronaut}
                        astronauts={astronauts}
                        onSelectAstronaut={setSelectedAstronautId}
                        onRefresh={refreshAll}
                      />
                    )}
                    {activeTab === 'resources' && (
                      <SuitResourcesView
                        astronaut={activeAstronaut}
                        astronauts={astronauts}
                        resources={resources}
                        onSelectAstronaut={setSelectedAstronautId}
                        onRefresh={refreshAll}
                      />
                    )}
                    {activeTab === 'equipment' && (
                      <EquipmentSimLabView astronaut={activeAstronaut} onRefresh={refreshAll} />
                    )}
                    {activeTab === 'assistant' && (
                      <GeminiAssistantView
                        astronaut={activeAstronaut}
                        isAlarmSounding={isAlarmSounding}
                        onSilenceAlarm={handleSilenceAlarm}
                        onNotifyEarth={handleNotifyEarth}
                      />
                    )}
                    {activeTab === 'disease' && <DiseaseDetectionView astronaut={activeAstronaut} />}
                    {activeTab === 'preflight' && (
                      <PreMissionMedicalView
                        astronaut={activeAstronaut}
                        astronauts={astronauts}
                        user={user}
                        onRefresh={refreshAll}
                      />
                    )}
                    {activeTab === 'medical' && <MedicalSupportView astronaut={activeAstronaut} user={user} />}
                    {activeTab === 'reports' && <ReportsAnalyticsView astronaut={activeAstronaut} user={user} />}
                    {activeTab === 'research' && <ResearchValidationView />}
                    {activeTab === 'about' && <AboutUsView />}
                  </motion.div>
                </AnimatePresence>
              )}
            </main>

            <Footer />
          </div>
        </div>

        {showAuth && (
          <AuthModal
            onClose={() => setShowAuth(false)}
            onSuccess={(u) => {
              setUser(u);
              if (u.astronautId) setSelectedAstronautId(u.astronautId);
              refreshAll();
            }}
          />
        )}
      </div>
    </MotionConfig>
  );
}
