// Combat: a pistol (raycast, headshots count), fists, muzzle flashes, tracers and
// hit sparks, plus return fire from cops and thugs and the busted / wasted outcomes.
import * as THREE from 'three';
import { TUNE } from './config.js';
import { distSq } from './random.js';

export class Combat {
  constructor(scene, camera, player, peds, police, traffic, audio) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.peds = peds;
    this.police = police;
    this.traffic = traffic;
    this.audio = audio;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = TUNE.GUN_RANGE;
    this.cooldown = 0;
    this.punchCooldown = 0;
    this.tracers = [];
    this.sparks = [];
    this.onBusted = null;
    this.onWasted = null;
    this.onCrime = null; // (heat) => void
    this.flashLight = new THREE.PointLight(0xffe9a8, 0, 14);
    this.scene.add(this.flashLight);
    this.crosshair = document.getElementById('crosshair');
  }

  shoot() {
    const p = this.player;
    if (this.cooldown > 0 || p.ammo <= 0 || p.inCar) return false;
    this.cooldown = 0.28;
    p.ammo--;
    this.audio.ensure();
    this.audio.shot();
    const origin = this.camera.position.clone();
    this.flashLight.position.copy(origin);
    this.flashLight.intensity = 3;
    // Aim through the crosshair: the centre of the screen.
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const targets = [];
    for (const ped of this.peds.peds) {
      if (ped.down) continue;
      targets.push(ped.mesh);
    }
    for (const cop of this.police.footCops) targets.push(cop.mesh);
    for (const car of this.traffic.cars) targets.push(car.mesh);
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = origin
      .clone()
      .add(this.raycaster.ray.direction.clone().multiplyScalar(TUNE.GUN_RANGE));
    let killedPed = false;
    if (hits.length) {
      const hit = hits[0];
      end = hit.point.clone();
      this.spawnSparks(hit.point);
      // Climb from the hit mesh to the ped / cop / car that owns it.
      let obj = hit.object;
      let ped = null;
      let cop = null;
      let car = null;
      while (obj) {
        ped = this.peds.peds.find((x) => x.mesh === obj);
        if (ped) break;
        cop = this.police.footCops.find((x) => x.mesh === obj);
        if (cop) break;
        car = this.traffic.cars.find((x) => x.mesh === obj);
        if (car) break;
        obj = obj.parent;
      }
      const headshot = !!ped && hit.point.y > ped.mesh.position.y + 1.35;
      if (ped) {
        killedPed = this.peds.damage(ped, headshot ? TUNE.GUN_HEADSHOT : TUNE.GUN_DAMAGE, headshot);
        this.onCrime?.(killedPed ? TUNE.HEAT_KILL : TUNE.HEAT_HIT_PED);
        this.peds.fleeAll(p.x, p.z, 30);
      } else if (cop) {
        // Foot cops take two hits.
        cop.hp = (cop.hp ?? 2) - 1;
        if (cop.hp <= 0) {
          this.scene.remove(cop.mesh);
          this.police.footCops = this.police.footCops.filter((x) => x !== cop);
          this.onCrime?.(TUNE.HEAT_KILL);
        } else {
          this.onCrime?.(TUNE.HEAT_SHOT);
        }
      } else if (car) {
        car.health -= TUNE.GUN_DAMAGE;
        if (car.health <= 0 && !car.wrecked) {
          car.wrecked = true;
          car.driver = null;
          this.spawnSparks(new THREE.Vector3(car.x, 1, car.z));
          this.audio.thud();
        }
        this.onCrime?.(TUNE.HEAT_SHOT);
      } else {
        this.onCrime?.(TUNE.HEAT_SHOT);
      }
    } else {
      this.onCrime?.(TUNE.HEAT_SHOT);
    }
    this.spawnTracer(origin, end);
    return true;
  }

  punch() {
    const p = this.player;
    if (this.punchCooldown > 0 || p.inCar) return false;
    this.punchCooldown = 0.45;
    this.audio.ensure();
    this.audio.thud();
    const target = this.peds.nearest(p.x, p.z, TUNE.FIST_REACH, (x) => !x.down);
    if (target) {
      const killed = this.peds.damage(target, TUNE.FIST_DAMAGE, false);
      this.onCrime?.(killed ? TUNE.HEAT_KILL : TUNE.HEAT_HIT_PED);
      return true;
    }
    const cop = this.police.footCops.find(
      (f) => distSq(f.x, f.z, p.x, p.z) < TUNE.FIST_REACH * TUNE.FIST_REACH,
    );
    if (cop) {
      cop.hp = (cop.hp ?? 2) - 1;
      if (cop.hp <= 0) {
        this.scene.remove(cop.mesh);
        this.police.footCops = this.police.footCops.filter((x) => x !== cop);
      }
      this.onCrime?.(TUNE.HEAT_SHOT);
      return true;
    }
    return false;
  }

  // An enemy fires at the player; hit chance falls off with distance.
  enemyShot(from, target, damage) {
    const p = this.player;
    const d = Math.hypot(from.x - p.x, from.z - p.z);
    this.audio.ensure();
    this.audio.shot();
    this.spawnTracer(
      new THREE.Vector3(from.x, 1.4, from.z),
      new THREE.Vector3(target.x, 1.2, target.z),
    );
    if (Math.random() < Math.max(0.06, 0.45 - d * 0.012)) {
      const died = p.hurt(damage);
      if (died) this.onWasted?.();
    }
  }

  copShot(cop) {
    this.enemyShot(cop, this.player, 9);
  }

  thugShot(from, target) {
    this.enemyShot(from, target, 8);
  }

  reload() {
    const p = this.player;
    if (p.ammo === TUNE.GUN_MAG || p.ammoReserve <= 0) return false;
    const need = TUNE.GUN_MAG - p.ammo;
    const take = Math.min(need, p.ammoReserve);
    p.ammo += take;
    p.ammoReserve -= take;
    this.audio.click();
    return true;
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  spawnSparks(point) {
    const geo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 10; i++) {
      pts.push(
        point.x + (Math.random() - 0.5) * 0.4,
        point.y + (Math.random() - 0.5) * 0.4,
        point.z + (Math.random() - 0.5) * 0.4,
      );
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffd23e, size: 0.18 }),
    );
    this.scene.add(points);
    this.sparks.push({ points, life: 0.25 });
  }

  update(dt, input) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 30);
    if (input.mouseTapped || (input.mouseHeld && this.cooldown <= 0)) this.shoot();
    if (input.hit('KeyF')) this.punch();
    if (input.hit('KeyR')) this.reload();
    for (const t of [...this.tracers]) {
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this.tracers = this.tracers.filter((x) => x !== t);
      }
    }
    for (const s of [...this.sparks]) {
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.points);
        this.sparks = this.sparks.filter((x) => x !== s);
      }
    }
    if (this.crosshair) {
      this.crosshair.style.display = this.player.inCar ? 'none' : 'block';
    }
  }
}
