// SOLBAY HEAT — the conductor: renderer, state machine, and the per-frame update order.
// States: title → playing ⇄ paused → busted / wasted → playing.
import * as THREE from 'three';
import { TUNE } from './config.js';
import { Controls } from './input.js';
import { Sound } from './audio.js';
import { World, streetAt } from './world.js';
import { Traffic } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { SaveGame } from './save.js';
import { applyShot, armShotReady, SHOT_NAMES } from './shots.js';
import { seedFromText } from './random.js';

class Game {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.seed = seedFromText(params.get('seed') || 'solbay-2026');
    this.shotName = params.get('shot');
    this.state = 'title';
    this.started = false;
    this.elapsed = 0;
    this.saveTimer = 0;
    this.lastHealth = TUNE.MAX_HEALTH;
    this.autoDrive = false;

    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);

    this.input = new Controls(canvas);
    this.audio = new Sound();
    this.world = new World(this.scene, this.seed);
    this.traffic = new Traffic(this.scene, this.world, this.seed + 1);
    this.peds = new Pedestrians(this.scene, this.world, this.seed + 2);
    this.player = new Player(this.scene, this.world, streetAt(4) + 3, streetAt(4) + 8);
    this.player.attachCamera(this.camera);
    this.police = new Police(this.scene, this.world, this.traffic, this.peds);
    this.hud = new HUD(this.world);
    this.combat = new Combat(
      this.scene,
      this.camera,
      this.player,
      this.peds,
      this.police,
      this.traffic,
      this.audio,
    );
    this.combat.onCrime = (heat) => this.police.addHeat(heat);
    this.combat.onBusted = () => this.busted();
    this.combat.onWasted = () => this.wasted();
    this.missions = new Missions(
      this.scene,
      this.world,
      this.player,
      this.traffic,
      this.peds,
      this.police,
      this.combat,
      this.hud,
      this.audio,
    );
    this.coupe = this.traffic.populate(12);
    this.peds.populate(22);

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    this.wireMenus();
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);

    if (this.shotName && SHOT_NAMES.includes(this.shotName)) {
      // Staged screenshot: skip the title screen, stage the scene, flag readiness.
      this.state = 'playing';
      this.started = true;
      this.showTitle(false);
      applyShot(this.shotName, this);
      armShotReady(this);
    }
    requestAnimationFrame(this.loop);
  }

  wireMenus() {
    const $ = (id) => document.getElementById(id);
    const save = SaveGame.load();
    $('btn-continue').style.display = save ? 'block' : 'none';
    $('btn-new').addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      SaveGame.clear();
      this.newGame();
    });
    $('btn-continue').addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this.continueGame(save);
    });
    $('btn-resume').addEventListener('click', () => {
      this.audio.click();
      this.setPaused(false);
    });
    $('btn-quit').addEventListener('click', () => {
      this.audio.click();
      this.saveNow();
      this.toTitle();
    });
    $('btn-busted').addEventListener('click', () => {
      this.audio.click();
      this.respawnAfterBust();
    });
    $('btn-wasted').addEventListener('click', () => {
      this.audio.click();
      this.respawnAfterBust();
    });
    $('btn-how').addEventListener('click', () => {
      const el = $('howto');
      el.style.display = el.style.display === 'block' ? 'none' : 'block';
    });
  }

  showTitle(show) {
    document.getElementById('title-screen').style.display = show ? 'flex' : 'none';
    document.getElementById('hud').style.display = show ? 'none' : 'block';
  }

  newGame() {
    this.player.reset(streetAt(4) + 3, streetAt(4) + 8, Math.PI);
    this.player.money = TUNE.START_CASH;
    this.missions.storyIndex = 0;
    this.missions.stepIndex = 0;
    this.police.clearWanted();
    this.state = 'playing';
    this.started = true;
    this.showTitle(false);
    this.missions.startStory();
    this.hud.setObjective('First Wheels — Go to Club Azahar');
  }

  continueGame(save) {
    this.player.reset(save.x ?? 0, save.z ?? 0, 0);
    this.player.money = save.money ?? TUNE.START_CASH;
    this.missions.storyIndex = save.storyIndex ?? 0;
    this.missions.stepIndex = 0;
    this.police.clearWanted();
    this.state = 'playing';
    this.started = true;
    this.showTitle(false);
    this.missions.startStory();
    this.hud.say(
      'SOLBAY',
      `Welcome back, Reno. $${Math.floor(this.player.money).toLocaleString('en-US')} in your pocket.`,
      4,
    );
  }

  toTitle() {
    this.state = 'title';
    this.showTitle(true);
    document.getElementById('pause-screen').style.display = 'none';
    const save = SaveGame.load();
    document.getElementById('btn-continue').style.display = save ? 'block' : 'none';
  }

  setPaused(paused) {
    if (paused && this.state !== 'playing') return;
    if (!paused && this.state !== 'paused') return;
    this.state = paused ? 'paused' : 'playing';
    document.getElementById('pause-screen').style.display = paused ? 'flex' : 'none';
    if (paused) this.saveNow();
  }

  busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    const fine = Math.min(this.player.money, TUNE.BUST_FINE);
    this.player.money -= fine;
    this.police.clearWanted();
    document.getElementById('busted-fine').textContent =
      `Fine: $${fine} — the PD keeps the rest of your dignity.`;
    document.getElementById('busted-screen').style.display = 'flex';
    this.audio.thud();
    this.saveNow();
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    const fee = Math.min(this.player.money, TUNE.HOSPITAL);
    this.player.money -= fee;
    this.police.clearWanted();
    document.getElementById('wasted-fee').textContent =
      `Hospital bill: $${fee} — Solbay General patched you up.`;
    document.getElementById('wasted-screen').style.display = 'flex';
    this.audio.thud();
    this.saveNow();
  }

  respawnAfterBust() {
    document.getElementById('busted-screen').style.display = 'none';
    document.getElementById('wasted-screen').style.display = 'none';
    // Solbay General, downtown.
    this.player.reset(streetAt(3) - 6, streetAt(3) + 6, Math.PI / 2);
    this.player.heal(TUNE.MAX_HEALTH);
    if (this.player.inCar) this.player.exitCar();
    this.state = 'playing';
    this.saveNow();
  }

  saveNow() {
    if (!this.started) return;
    SaveGame.write({
      money: this.player.money,
      storyIndex: this.missions.storyIndex,
      x: this.player.x,
      z: this.player.z,
      kills: 0,
      earned: this.player.money,
    });
  }

  // The E key, in priority order: talk, then start a job, then enter or exit a car.
  handleInteract() {
    const p = this.player;
    if (this.input.hit('KeyE')) {
      if (this.missions.tryTalk()) return;
      if (this.missions.tryJobStart()) return;
      if (p.inCar) {
        p.exitCar();
        return;
      }
      const car = this.traffic.nearestCar(p.x, p.z, 4.5);
      if (car) {
        p.tryEnterCar(car);
        // Stealing in front of a witness draws heat.
        const witness = this.peds.nearest(p.x, p.z, 25, (x) => !x.down);
        if (witness) {
          this.police.addHeat(TUNE.HEAT_STEAL);
          this.hud.say('WITNESS', '"Hey! That\'s my car!"', 3);
        }
      }
    }
    // Contextual prompt line under the crosshair.
    let prompt = '';
    if (!p.inCar) {
      const car = this.traffic.nearestCar(p.x, p.z, 4.5);
      if (this.missions.talkAvailable()) prompt = 'E — Talk to Marisol';
      else if (car) prompt = `E — Enter the ${car.name}`;
    } else {
      const taxi = this.world.markers.taxi;
      const parcel = this.world.markers.parcel;
      const near = (m) => Math.hypot(p.x - m.x, p.z - m.z);
      if (!this.missions.job && near(taxi) < 8) prompt = 'E — Start taxi fares';
      else if (!this.missions.job && near(parcel) < 8) prompt = 'E — Start a parcel rush';
      else if (
        this.missions.job?.kind === 'taxi' &&
        this.missions.job.phase === 'pickup' &&
        near(taxi) < 8
      ) {
        prompt = 'E — Pick up the fare';
      } else {
        prompt = 'E — Exit car';
      }
    }
    this.hud.prompt(prompt);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    const input = this.input;

    if (input.hit('KeyM')) {
      this.audio.ensure();
      this.audio.setMuted(!this.audio.muted);
    }
    if (input.hit('KeyP') && this.state === 'playing') this.setPaused(true);
    else if (input.hit('KeyP') && this.state === 'paused') this.setPaused(false);

    if (this.state === 'playing') {
      // Staged driving shots keep the throttle on so the car moves in the capture.
      if (this.autoDrive) this.input.held.add('KeyW');
      this.player.update(dt, input);
      this.handleInteract();
      this.traffic.update(dt, this.player.pos);
      this.peds.update(dt, this.player.pos, null);
      this.police.update(dt, this.player, this.combat);
      this.combat.update(dt, input);
      this.missions.update(dt, input);
      this.world.update(dt, this.elapsed);
      this.hud.update(dt, this);
      // Audio follows the action.
      this.audio.ensure();
      this.audio.setEngine(this.player.speed01, !!this.player.inCar);
      this.audio.setSiren(this.police.stars >= 2);
      // Damage vignette.
      if (this.player.health < this.lastHealth) {
        const v = document.getElementById('vignette');
        v.style.opacity = '0.55';
        setTimeout(() => {
          v.style.opacity = '0';
        }, 180);
      }
      this.lastHealth = this.player.health;
      // Autosave.
      this.saveTimer += dt;
      if (this.saveTimer > 12) {
        this.saveTimer = 0;
        this.saveNow();
      }
    } else if (this.state === 'title') {
      // Idle title orbit: a slow camera drift over downtown.
      const t = this.elapsed * 0.05;
      this.camera.position.set(Math.sin(t) * 90, 70, Math.cos(t) * 90 - 40);
      this.camera.lookAt(0, 10, 0);
      this.world.update(dt, this.elapsed);
    }
    input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }
}

window.__game = new Game();
