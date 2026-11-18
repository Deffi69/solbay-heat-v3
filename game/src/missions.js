// Story and side jobs. Five story missions with dialogue, plus repeatable taxi fares
// and parcel rushes from the green ranks. One objective at a time, shown on the HUD
// and on the minimap as a pulsing gold beacon.
import * as THREE from 'three';
import { TUNE, CAST } from './config.js';
import { distSq } from './random.js';

const PAY = TUNE.MISSION_PAY;

const STORY_DEFS = [
  {
    name: 'First Wheels',
    briefing: `${CAST.contact}: "Reno. You drive? Good — I need a lift to the marina. No questions."`,
    steps: [
      { type: 'goto', at: 'club', text: 'Go to Club Azahar — meet Marisol' },
      { type: 'talk', at: 'club', text: 'Talk to Marisol (press E)' },
      { type: 'driveTo', at: 'marina', needCar: true, text: 'Drive Marisol to the Marina' },
    ],
    pay: PAY[0],
  },
  {
    name: 'Borrowed Shine',
    briefing: `${CAST.mechanic}: "There's a gold Aurelia GT at my lot. Borrow it. Permanently. Bring it back here."`,
    steps: [
      { type: 'goto', at: 'coupeLot', text: 'Go to the gold coupe at the lot' },
      { type: 'steal', text: 'Steal the gold coupe (E to enter)' },
      { type: 'driveTo', at: 'garage', needCar: true, text: "Bring the coupe to Piper's Garage" },
    ],
    pay: PAY[1],
  },
  {
    name: 'Corsair Static',
    briefing: `${CAST.contact}: "The Corsairs are shaking down the pier. Clear them out — they're armed."`,
    steps: [
      { type: 'goto', at: 'pier', text: 'Go to Solbay Pier' },
      { type: 'clear', at: 'pier', count: 3, text: 'Deal with the Corsair thugs (3)' },
    ],
    pay: PAY[2],
  },
  {
    name: 'Hot Cargo',
    briefing: `${CAST.mechanic}: "Crate at the harbour warehouse. Airfield hangar. Fast. The PD will notice."`,
    steps: [
      { type: 'goto', at: 'warehouse', text: 'Pick up the crate at the Harbour Warehouse' },
      { type: 'driveTo', at: 'hangar', needCar: true, timed: 75, heat: 150, text: 'Deliver to Hangar 2 — 75 seconds!' },
    ],
    pay: PAY[3],
  },
  {
    name: 'Solbay Goodbye',
    briefing: `${CAST.contact}: "Last one, Reno. Four stars on us already. Get to the plane on the runway — and don't stop."`,
    steps: [
      { type: 'driveTo', at: 'airfield', needCar: true, heat: 360, text: 'Escape to the plane on the runway!' },
    ],
    pay: PAY[4],
  },
];

export class Missions {
  constructor(scene, world, player, traffic, peds, police, combat, hud, audio) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.traffic = traffic;
    this.peds = peds;
    this.police = police;
    this.combat = combat;
    this.hud = hud;
    this.audio = audio;
    this.storyIndex = 0; // 0..4, 5 = story complete
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.thugs = [];
    this.job = null; // {kind: 'taxi' | 'parcel', ...}
    this.jobCooldown = 0;
    this.passenger = null;
    this.started = false;
    this.makeBeacon();
  }

  makeBeacon() {
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23e,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    const ringGeo = new THREE.RingGeometry(1.8, 2.4, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd23e,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);
  }

  currentDef() {
    return STORY_DEFS[this.storyIndex] ?? null;
  }

  currentStep() {
    const def = this.currentDef();
    return def ? def.steps[this.stepIndex] : null;
  }

  get done() {
    return this.storyIndex >= STORY_DEFS.length;
  }

  startStory() {
    if (this.started) return;
    this.started = true;
    const def = this.currentDef();
    this.hud.say('MARISOL', def.briefing, 6);
    this.audio.chime();
    this.refreshObjective();
  }

  refreshObjective() {
    const def = this.currentDef();
    const step = this.currentStep();
    if (!def || !step) {
      this.hud.setObjective(this.done ? 'Story complete — Solbay is yours. Free roam!' : '');
      this.setMarker(null);
      return;
    }
    this.hud.setObjective(`${def.name} — ${step.text}`);
    const at = step.at ? this.world.markers[step.at] : null;
    this.setMarker(at);
  }

  setMarker(at) {
    if (!at) {
      this.beacon.visible = false;
      this.ring.visible = false;
      this.hud.setMarker(null);
      return;
    }
    this.beacon.position.set(at.x, 30, at.z);
    this.beacon.visible = true;
    this.ring.position.set(at.x, 0.1, at.z);
    this.ring.visible = true;
    this.hud.setMarker(at);
  }

  advanceStep() {
    this.stepIndex++;
    const def = this.currentDef();
    if (this.stepIndex >= def.steps.length) {
      // Mission complete: pay out and open the next one.
      const pay = def.pay;
      this.player.money += pay;
      this.hud.say('SOLBAY', `Mission complete: ${def.name} — +$${pay}`, 5);
      this.audio.chime();
      this.storyIndex++;
      this.stepIndex = 0;
      this.hud.flashCash(pay);
      if (this.done) {
        this.hud.say('MARISOL', '"You did it, Reno. Solbay is yours now."', 6);
        this.player.money += 500; // story bonus
      } else {
        const next = this.currentDef();
        this.hud.say('MARISOL', next.briefing, 6);
      }
      this.refreshObjective();
      return;
    }
    const step = this.currentStep();
    if (step.heat) this.police.addHeat(step.heat);
    if (step.timed) this.stepTimer = step.timed;
    this.refreshObjective();
  }

  markerPos(name) {
    const m = this.world.markers[name];
    return m ? { x: m.x, z: m.z } : null;
  }

  spawnThugs() {
    const pier = this.world.markers.pier;
    for (let i = 0; i < 3; i++) {
      const ped = this.peds.spawn(pier.x + (i - 1) * 6, pier.z - 10 - i * 3, {
        isThug: true,
        state: 'stroll',
      });
      ped.shootTimer = 1 + i * 0.7;
      this.thugs.push(ped);
    }
    this.hud.say('CORSAIR', '"This pier is ours, Vale. Walk away."', 4);
  }

  startJob(kind) {
    if (this.job) return;
    const p = this.player;
    if (kind === 'taxi') {
      const dests = ['marina', 'airfield', 'club', 'beach', 'garage'];
      const destName = dests[Math.floor(Math.random() * dests.length)];
      const dest = this.markerPos(destName);
      const rank = this.world.markers.taxi;
      const ped = this.peds.spawn(rank.x, rank.z + 4, { isPassenger: true });
      this.passenger = ped;
      this.job = { kind: 'taxi', phase: 'pickup', dest, destName, payPerM: TUNE.FARE_PER_M };
      this.hud.say('DISPATCH', '"Fare waiting at the Taxi Rank. Pick them up."', 4);
      this.setMarker(rank);
      this.hud.setObjective('Taxi — pick up the fare at the rank');
    } else {
      const dest = this.markerPos('airfield');
      this.job = { kind: 'parcel', phase: 'deliver', dest, destName: 'airfield', timeLeft: 60 };
      this.hud.say('DISPATCH', '"Parcel rush: get this to the Airfield in 60 seconds."', 4);
      this.setMarker(this.world.markers.airfield);
      this.hud.setObjective('Parcel rush — deliver to the Airfield (60s)');
    }
    this.audio.click();
  }

  update(dt, input) {
    void input;
    this.jobCooldown = Math.max(0, this.jobCooldown - dt);
    // --- Story steps ---
    const step = this.currentStep();
    const p = this.player;
    if (step && this.started) {
      const at = step.at ? this.markerPos(step.at) : null;
      if (step.type === 'goto' && at) {
        if (distSq(p.x, p.z, at.x, at.z) < 6 * 6) this.advanceStep();
      } else if (step.type === 'talk' && at) {
        // Advancing happens via tryTalk(), called from the E-key handler.
      } else if (step.type === 'steal') {
        if (p.inCar && p.inCar.isStoryCoupe) {
          this.police.addHeat(TUNE.HEAT_STEAL);
          this.hud.say('PIPER', '"That\'s the one. Now bring her home."', 4);
          this.advanceStep();
        }
      } else if (step.type === 'driveTo' && at) {
        if (p.inCar && distSq(p.x, p.z, at.x, at.z) < 8 * 8) this.advanceStep();
        if (step.timed) {
          this.stepTimer -= dt;
          this.hud.setTimer(Math.max(0, this.stepTimer));
          if (this.stepTimer <= 0) {
            this.hud.say('PIPER', '"Too slow — the crate\'s gone cold. Try again."', 4);
            this.stepIndex = Math.max(0, this.stepIndex - 1);
            this.refreshObjective();
          }
        }
      } else if (step.type === 'clear') {
        if (this.thugs.length === 0 && step.spawned !== true) {
          step.spawned = true;
          this.spawnThugs();
        }
        for (const t of [...this.thugs]) {
          if (t.down) continue;
          t.shootTimer -= dt;
          const d = Math.hypot(t.x - p.x, t.z - p.z);
          if (d < 32 && t.shootTimer <= 0) {
            t.shootTimer = 1.2 + Math.random();
            this.combat.thugShot(t, p);
          }
        }
        const alive = this.thugs.filter((t) => !t.down).length;
        this.hud.setObjective(`${step.text} — ${alive} left`);
        if (this.thugs.length > 0 && alive === 0) {
          this.thugs = [];
          this.police.addHeat(30);
          this.advanceStep();
        }
      }
      if (step.type !== 'driveTo' || !step.timed) this.hud.setTimer(null);
    }
    // --- Side jobs ---
    if (this.job) {
      const j = this.job;
      if (j.kind === 'taxi') {
        if (j.phase === 'dropoff' && distSq(p.x, p.z, j.dest.x, j.dest.z) < 8 * 8 && p.inCar) {
          const pay = Math.round(60 + (j.startDist || 100) * j.payPerM);
          p.money += pay;
          this.hud.flashCash(pay);
          this.hud.say('FARE', `"Thanks, driver. Keep the change." (+$${pay})`, 3);
          this.audio.chime();
          this.job = null;
          this.refreshObjective();
        }
      } else if (j.kind === 'parcel') {
        j.timeLeft -= dt;
        this.hud.setTimer(Math.max(0, j.timeLeft));
        if (distSq(p.x, p.z, j.dest.x, j.dest.z) < 8 * 8 && p.inCar) {
          const pay = TUNE.PARCEL_PAY + Math.round(j.timeLeft) * 2;
          p.money += pay;
          this.hud.flashCash(pay);
          this.hud.say('DISPATCH', `"Parcel delivered. +$${pay}"`, 3);
          this.audio.chime();
          this.job = null;
          this.hud.setTimer(null);
          this.refreshObjective();
        } else if (j.timeLeft <= 0) {
          this.hud.say('DISPATCH', '"Parcel late — job failed."', 3);
          this.job = null;
          this.hud.setTimer(null);
          this.refreshObjective();
        }
      }
    }
    // Beacon pulse.
    if (this.beacon.visible) {
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.15;
      this.beacon.scale.set(s, 1, s);
    }
  }

  // --- E-key interactions, called from main in priority order: talk, then job, then car.
  talkAvailable() {
    const step = this.currentStep();
    if (!step || step.type !== 'talk' || !this.started) return false;
    const at = this.markerPos(step.at);
    return !!at && distSq(this.player.x, this.player.z, at.x, at.z) < 8 * 8;
  }

  tryTalk() {
    if (!this.talkAvailable()) return false;
    this.hud.say('MARISOL', '"Good. Let\'s roll — the marina, and keep it under the limit."', 4);
    this.advanceStep();
    return true;
  }

  tryJobStart() {
    const p = this.player;
    if (!p.inCar) return false;
    const taxi = this.world.markers.taxi;
    const parcel = this.world.markers.parcel;
    const near = (m) => distSq(p.x, p.z, m.x, m.z) < 8 * 8;
    // Pick up a fare that is already waiting.
    if (this.job?.kind === 'taxi' && this.job.phase === 'pickup' && near(taxi)) {
      const j = this.job;
      j.phase = 'dropoff';
      j.startDist = Math.hypot(j.dest.x - p.x, j.dest.z - p.z);
      this.hud.say('FARE', '"Take me to the ' + this.world.markers[j.destName].label + ', quick!"', 3);
      this.setMarker(this.world.markers[j.destName]);
      this.hud.setObjective(`Taxi — drive the fare to ${this.world.markers[j.destName].label}`);
      if (this.passenger) {
        this.passenger.down = true;
        this.passenger.gone = true;
      }
      return true;
    }
    if (this.job || this.jobCooldown > 0) return false;
    if (near(taxi)) {
      this.startJob('taxi');
      this.jobCooldown = 1;
      return true;
    }
    if (near(parcel)) {
      this.startJob('parcel');
      this.jobCooldown = 1;
      return true;
    }
    return false;
  }
}
