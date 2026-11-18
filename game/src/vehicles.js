// Cars: build them from boxes and cylinders, drive them with arcade physics, and
// keep traffic circulating the grid. Every car in Solbay is a few meshes — no assets.
import * as THREE from 'three';
import { TUNE } from './config.js';
import { makeRng, pickFrom, between, clamp, turnToward, distSq } from './random.js';

export const PAINT = [0xc8322e, 0x2e6ac8, 0xe8c832, 0xeeeeee, 0x222222, 0x3a8a4a, 0xc86a2e, 0x7a3a8a];
export const MODELS = ['Vento', 'Cortez', 'Marlin', 'Puma', 'Solstice', 'Brava', 'Dune', 'Falco'];

export function buildCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.05, -0.2);
  cabin.castShadow = true;
  g.add(body, cabin);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xc8322e });
  for (const side of [-1, 1]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), headMat);
    headlight.position.set(side * 0.62, 0.62, 2.16);
    g.add(headlight);
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), tailMat);
    taillight.position.set(side * 0.62, 0.62, -2.16);
    g.add(taillight);
  }
  if (opts.sport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.35), bodyMat);
    spoiler.position.set(0, 1.0, -2.05);
    g.add(spoiler);
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }),
    );
    sign.position.set(0, 1.45, -0.2);
    g.add(sign);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  g.userData.wheels = [];
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    g.add(wheel);
    g.userData.wheels.push(wheel);
  }
  return g;
}

export class Car {
  constructor(mesh, x, z, heading, opts = {}) {
    this.mesh = mesh;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.color = opts.color ?? 0x888888;
    this.name = opts.name ?? 'car';
    this.isPolice = !!opts.isPolice;
    this.isTaxi = !!opts.isTaxi;
    this.health = 100;
    this.wrecked = false;
    this.driver = opts.driver ?? null; // 'traffic' | 'police' | 'player' | null (parked)
    this.maxSpeed = opts.maxSpeed ?? TUNE.TOP_SPEED;
    this.lightL = null;
    this.lightR = null;
    if (opts.policeLights) {
      const mk = (color, x) => {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.12, 0.3),
          new THREE.MeshBasicMaterial({ color }),
        );
        m.position.set(x, 1.42, -0.2);
        mesh.add(m);
        return m;
      };
      this.lightL = mk(0xff2222, -0.4);
      this.lightR = mk(0x2266ff, 0.4);
    }
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = (this.speed * 0.016) / 0.36;
    for (const wheel of this.mesh.userData.wheels) wheel.rotation.x += spin;
  }

  // Arcade driving: steer -1..1, throttle -1..1, handbrake kills speed.
  drive(dt, steer, throttle, handbrake, world) {
    if (this.wrecked) this.speed *= Math.exp(-2 * dt);
    const forward = throttle > 0 ? 1 : throttle < 0 ? -1 : 0;
    const accel = throttle !== 0 ? TUNE.ACCEL * Math.abs(throttle) : 0;
    this.speed += forward * accel * dt;
    if (handbrake) this.speed *= Math.exp(-3 * dt);
    else if (throttle === 0) this.speed *= Math.exp(-1.0 * dt);
    else this.speed *= Math.exp(-0.25 * dt);
    const top = throttle < 0 ? TUNE.REVERSE_MAX : this.maxSpeed;
    this.speed = clamp(this.speed, -top, top);
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    // Steering bites harder with speed, and reverses when backing up.
    const steerAmount = clamp(steer, -1, 1) * TUNE.TURN_RATE * clamp(Math.abs(this.speed) / 8, 0, 1);
    this.heading += steerAmount * Math.sign(this.speed || 1) * dt * (this.speed >= 0 ? 1 : -1);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const fixed = world.collideCircle(nx, nz, 1.6);
    if (fixed.x !== nx || fixed.z !== nz) this.speed *= 0.35; // bumped a wall
    this.x = fixed.x;
    this.z = fixed.z;
    this.syncMesh();
  }
}

export class Traffic {
  constructor(scene, world, seed = 7) {
    this.scene = scene;
    this.world = world;
    this.rng = makeRng(seed);
    this.cars = [];
    this.spawnTimer = 0;
  }

  spawnCar(x, z, heading, opts = {}) {
    const color = opts.color ?? pickFrom(this.rng, PAINT);
    const mesh = buildCarMesh(color, opts);
    this.scene.add(mesh);
    const car = new Car(mesh, x, z, heading, { ...opts, color });
    this.cars.push(car);
    return car;
  }

  // Parked cars on street edges, a few already rolling, plus the gold story coupe.
  populate(count = 12) {
    const rng = this.rng;
    const lines = this.world.roadLines;
    for (let i = 0; i < count; i++) {
      const along = pickFrom(rng, lines);
      const cross = pickFrom(rng, lines);
      const lane = between(rng, -3, 3);
      const horizontal = rng() < 0.5;
      const x = horizontal ? cross + between(rng, -200, 200) : along + lane;
      const z = horizontal ? along + lane : cross + between(rng, -200, 200);
      const heading = horizontal
        ? rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2
        : rng() < 0.5 ? 0 : Math.PI;
      const car = this.spawnCar(x, z, heading, {
        name: pickFrom(rng, MODELS),
        driver: rng() < 0.55 ? 'traffic' : null,
      });
      if (car.driver === 'traffic') {
        car.speed = between(rng, 6, TUNE.TRAFFIC_SPEED);
      }
    }
    const lot = this.world.markers.coupeLot;
    const coupe = this.spawnCar(lot.x, lot.z, Math.PI / 2, {
      color: 0xd8a820,
      name: 'Aurelia GT',
      sport: true,
      driver: null,
    });
    coupe.isStoryCoupe = true;
    return coupe;
  }

  nearestCar(x, z, maxD, exclude) {
    let best = null;
    let bd = maxD * maxD;
    for (const car of this.cars) {
      if (car === exclude || car.wrecked) continue;
      const d = distSq(x, z, car.x, car.z);
      if (d < bd) {
        bd = d;
        best = car;
      }
    }
    return best;
  }

  update(dt, playerPos) {
    for (const car of this.cars) {
      if (car.driver !== 'traffic' || car.wrecked) continue;
      // Follow the nearest street: steer toward the lane centre of the road we are on.
      const road = this.world.nearestRoad(car.x, car.z);
      let desired = car.heading;
      if (road.axis === 'z') {
        const laneZ = road.coord + (Math.sin(car.heading) > 0 ? 3 : -3);
        const dz = laneZ - car.z;
        desired = Math.sin(car.heading) >= 0
          ? Math.PI / 2 + clamp(-dz * 0.02, -0.5, 0.5)
          : -Math.PI / 2 + clamp(dz * 0.02, -0.5, 0.5);
      } else {
        const laneX = road.coord + (Math.cos(car.heading) > 0 ? 3 : -3);
        const dx = laneX - car.x;
        desired = Math.cos(car.heading) >= 0
          ? clamp(dx * 0.02, -0.5, 0.5)
          : Math.PI + clamp(-dx * 0.02, -0.5, 0.5);
      }
      car.heading = turnToward(car.heading, desired, Math.min(1, dt * 1.2));
      car.speed += (TUNE.TRAFFIC_SPEED - car.speed) * Math.min(1, dt);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const fixed = this.world.collideCircle(nx, nz, 1.6);
      car.x = fixed.x;
      car.z = fixed.z;
      car.syncMesh();
      // Far from the player: park it and let the spawner bring fresh traffic in.
      if (playerPos && distSq(car.x, car.z, playerPos.x, playerPos.z) > 320 * 320) {
        car.driver = null;
      }
    }
    // Keep the streets alive: top the moving count back up near the player.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 6;
      const moving = this.cars.filter((c) => c.driver === 'traffic').length;
      if (moving < 8 && playerPos) {
        const lines = this.world.roadLines;
        const along = pickFrom(this.rng, lines);
        const horizontal = this.rng() < 0.5;
        const near = 60 + this.rng() * 60;
        const dir = this.rng() < 0.5 ? 1 : -1;
        const x = horizontal ? playerPos.x + dir * near : along + between(this.rng, -3, 3);
        const z = horizontal ? along + between(this.rng, -3, 3) : playerPos.z + dir * near;
        const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
        const car = this.spawnCar(x, z, heading, {
          name: pickFrom(this.rng, MODELS),
          driver: 'traffic',
        });
        car.speed = TUNE.TRAFFIC_SPEED;
      }
    }
  }
}
