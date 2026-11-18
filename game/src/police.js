// Solbay PD: wanted heat, stars, pursuit cars and foot cops, and the busted outcome
// when they finally catch Reno on foot.
import * as THREE from 'three';
import { TUNE } from './config.js';
import { clamp, turnToward, distSq } from './random.js';
import { buildCarMesh, Car } from './vehicles.js';
import { buildPedMesh } from './pedestrians.js';

export class Police {
  constructor(scene, world, traffic, peds) {
    this.scene = scene;
    this.world = world;
    this.traffic = traffic;
    this.peds = peds;
    this.heat = 0;
    this.stars = 0;
    this.cops = []; // pursuit cars
    this.footCops = []; // {mesh, x, z, heading, speed, shootTimer}
    this.spawnTimer = 0;
    this.unseenTimer = 0;
    this.bustedTimer = 0;
    this.sirenPhase = 0;
  }

  get wanted() {
    return this.stars;
  }

  addHeat(amount) {
    this.heat = clamp(this.heat + amount, 0, 500);
    this.recomputeStars();
  }

  recomputeStars() {
    let stars = 0;
    for (let i = TUNE.STAR_AT.length - 1; i >= 0; i--) {
      if (this.heat >= TUNE.STAR_AT[i]) {
        stars = i;
        break;
      }
    }
    this.stars = stars;
  }

  clearWanted() {
    this.heat = 0;
    this.stars = 0;
    this.removeAllCops();
  }

  removeAllCops() {
    for (const car of this.cops) {
      this.scene.remove(car.mesh);
      this.traffic.cars = this.traffic.cars.filter((x) => x !== car);
    }
    for (const cop of this.footCops) this.scene.remove(cop.mesh);
    this.cops = [];
    this.footCops = [];
  }

  spawnPursuitCar(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const d = 55 + Math.random() * 30;
    let x = playerPos.x + Math.sin(angle) * d;
    let z = playerPos.z + Math.cos(angle) * d;
    // Snap onto the nearest street so the interceptor starts on a road.
    const road = this.world.nearestRoad(x, z);
    if (road.axis === 'z') z = road.coord + (Math.random() < 0.5 ? 3 : -3);
    else x = road.coord + (Math.random() < 0.5 ? 3 : -3);
    const mesh = buildCarMesh(0x1a1a1a, { policeLights: true });
    // White doors over the black body.
    const doors = new THREE.Mesh(
      new THREE.BoxGeometry(1.92, 0.3, 2.2),
      new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }),
    );
    doors.position.y = 0.72;
    mesh.add(doors);
    this.scene.add(mesh);
    const car = new Car(mesh, x, z, Math.atan2(playerPos.x - x, playerPos.z - z), {
      color: 0x1a1a1a,
      name: 'PD Interceptor',
      isPolice: true,
      driver: 'police',
      maxSpeed: TUNE.TOP_SPEED + 4,
    });
    this.traffic.cars.push(car);
    this.cops.push(car);
    return car;
  }

  spawnFootCop(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const d = 18 + Math.random() * 12;
    const x = playerPos.x + Math.sin(angle) * d;
    const z = playerPos.z + Math.cos(angle) * d;
    const mesh = buildPedMesh(0x1a2a4a, 0x1a1a1a);
    const hat = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.1, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x0a1a3a }),
    );
    hat.position.y = 1.82;
    mesh.add(hat);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const cop = { mesh, x, z, heading: 0, speed: 6.5, shootTimer: 1 + Math.random(), hp: 2 };
    this.footCops.push(cop);
    return cop;
  }

  crime(amount) {
    this.addHeat(amount);
  }

  update(dt, player, combat) {
    const px = player.x;
    const pz = player.z;
    // Heat cools off once no cop has seen the player for a while.
    const anyNear =
      this.cops.some((c) => distSq(c.x, c.z, px, pz) < 90 * 90) ||
      this.footCops.some((f) => distSq(f.x, f.z, px, pz) < 45 * 45);
    if (this.stars > 0 && !anyNear) {
      this.unseenTimer += dt;
      if (this.unseenTimer > 6) {
        this.heat = Math.max(0, this.heat - TUNE.HEAT_COOL * dt * 6);
        this.recomputeStars();
      }
    } else {
      this.unseenTimer = 0;
    }
    // Pressure scales with stars: cars at 1+, more cars at 3+, foot cops on foot.
    const wantCars = this.stars >= 3 ? Math.min(4, this.stars) : this.stars >= 1 ? 1 : 0;
    const wantFoot = this.stars >= 1 && !player.inCar ? Math.min(3, this.stars) : 0;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      if (this.cops.length < wantCars && this.stars > 0) this.spawnPursuitCar(player.pos);
      if (this.footCops.length < wantFoot && this.stars > 0) this.spawnFootCop(player.pos);
    }
    // Pursuit cars: chase, ram, flash their light bars.
    this.sirenPhase += dt;
    for (const car of [...this.cops]) {
      if (car.wrecked) continue;
      const dx = px - car.x;
      const dz = pz - car.z;
      const d = Math.hypot(dx, dz) || 1;
      car.heading = turnToward(car.heading, Math.atan2(dx, dz), Math.min(1, dt * 2.2));
      const targetSpeed = Math.min(car.maxSpeed, 12 + this.stars * 5);
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const fixed = this.world.collideCircle(nx, nz, 1.6);
      if (fixed.x !== nx || fixed.z !== nz) car.speed *= 0.4;
      car.x = fixed.x;
      car.z = fixed.z;
      car.syncMesh();
      const redOn = Math.floor(this.sirenPhase * 4) % 2 === 0;
      if (car.lightL) car.lightL.material.color.setHex(redOn ? 0xff2222 : 0x661111);
      if (car.lightR) car.lightR.material.color.setHex(redOn ? 0x2266ff : 0x112266);
      // Ram the player's car, or grab the player on foot.
      if (d < 3.2) {
        if (player.inCar) {
          player.inCar.speed *= 0.85;
          player.inCar.health -= 2;
          if (player.inCar.health <= 0) player.inCar.wrecked = true;
        } else {
          this.bustedTimer += dt;
          if (this.bustedTimer > 1.6) {
            this.bustedTimer = 0;
            combat?.onBusted?.();
          }
        }
      }
      if (d > 260) {
        this.scene.remove(car.mesh);
        this.traffic.cars = this.traffic.cars.filter((x) => x !== car);
        this.cops = this.cops.filter((x) => x !== car);
      }
    }
    // Foot cops: run the player down, shoot from range at 2+ stars, arrest up close.
    for (const cop of [...this.footCops]) {
      const dx = px - cop.x;
      const dz = pz - cop.z;
      const d = Math.hypot(dx, dz) || 1;
      cop.heading = Math.atan2(dx, dz);
      if (d > 2.2) {
        cop.x += Math.sin(cop.heading) * cop.speed * dt;
        cop.z += Math.cos(cop.heading) * cop.speed * dt;
        const fixed = this.world.collideCircle(cop.x, cop.z, 0.5);
        cop.x = fixed.x;
        cop.z = fixed.z;
      }
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      cop.shootTimer -= dt;
      if (d < 26 && d > 4 && cop.shootTimer <= 0 && this.stars >= 2) {
        cop.shootTimer = 1.4 + Math.random();
        combat?.copShot?.(cop);
      }
      if (d < 2.2 && !player.inCar) {
        this.bustedTimer += dt;
        if (this.bustedTimer > 1.6) {
          this.bustedTimer = 0;
          combat?.onBusted?.();
        }
      }
      if (d > 220) {
        this.scene.remove(cop.mesh);
        this.footCops = this.footCops.filter((x) => x !== cop);
      }
    }
    if (this.stars === 0) this.bustedTimer = 0;
  }
}
