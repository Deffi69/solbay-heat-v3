// Reno Vale on foot: WASD movement relative to the camera, jump, sprint, getting in
// and out of cars, and the third-person camera rig (mouse orbit, C cycles zoom).
import * as THREE from 'three';
import { TUNE } from './config.js';
import { clamp, turnToward } from './random.js';
import { buildPedMesh } from './pedestrians.js';

const CAM_DISTS = [7, 10, 14];

export class Player {
  constructor(scene, world, x = 0, z = 0) {
    this.world = world;
    this.x = x;
    this.z = z;
    this.y = 0; // height above the ground while jumping
    this.vy = 0;
    this.heading = 0;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.camDist = 8;
    this.camMode = 0; // 0 near, 1 mid, 2 far
    this.health = TUNE.MAX_HEALTH;
    this.inCar = null;
    this.speed = 0;
    this.walkPhase = 0;
    this.money = TUNE.START_CASH;
    this.ammo = TUNE.GUN_MAG;
    this.ammoReserve = 48;
    this.aiming = false;
    this.mesh = buildPedMesh(0x2a4a6a, 0x2a2a2a);
    // The hero's red cap, so he reads at a glance in a crowd.
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.1, 0.36),
      new THREE.MeshLambertMaterial({ color: 0xc8322e }),
    );
    cap.position.y = 1.86;
    this.mesh.add(cap);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.camera = null;
  }

  attachCamera(camera) {
    this.camera = camera;
  }

  reset(x, z, heading = 0) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.heading = heading;
    this.camYaw = heading;
    this.health = TUNE.MAX_HEALTH;
    this.inCar = null;
    this.mesh.visible = true;
    this.mesh.rotation.x = 0;
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  get speed01() {
    if (this.inCar) return Math.abs(this.inCar.speed) / TUNE.TOP_SPEED;
    return this.speed / TUNE.SPRINT;
  }

  update(dt, input) {
    if (this.inCar) {
      // Driving is the car's job; the player rides along, mesh hidden inside.
      this.x = this.inCar.x;
      this.z = this.inCar.z;
      this.mesh.visible = false;
      const mv = input.moveVec();
      this.inCar.drive(dt, -mv.x, mv.y, input.down('Space'), this.world);
      this.updateCamera(dt, input, this.inCar.heading);
      return;
    }
    this.mesh.visible = true;
    const mv = input.moveVec();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const target = mv.y !== 0 || mv.x !== 0 ? (sprint ? TUNE.SPRINT : TUNE.WALK) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 8);
    if (this.speed > 0.1) {
      const moveAngle = this.camYaw + Math.atan2(mv.x, mv.y);
      const nx = this.x + Math.sin(moveAngle) * this.speed * dt;
      const nz = this.z + Math.cos(moveAngle) * this.speed * dt;
      const fixed = this.world.collideCircle(nx, nz, TUNE.BODY_R);
      this.x = fixed.x;
      this.z = fixed.z;
      this.heading = turnToward(this.heading, moveAngle, Math.min(1, dt * 10));
      this.walkPhase += dt * this.speed * 1.4;
    }
    // Jump.
    if (input.hit('Space') && this.y === 0) this.vy = TUNE.JUMP;
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= TUNE.GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
    }
    this.mesh.position.set(this.x, this.y + Math.abs(Math.sin(this.walkPhase)) * 0.05, this.z);
    this.mesh.rotation.y = this.heading;
    this.updateCamera(dt, input, this.heading);
  }

  updateCamera(dt, input, followHeading) {
    if (!this.camera) return;
    const look = input.takeLook();
    this.camYaw -= look.dx * 0.0032;
    this.camPitch = clamp(this.camPitch + look.dy * 0.0022, 0.06, 1.1);
    if (input.hit('KeyC')) {
      this.camMode = (this.camMode + 1) % 3;
      this.camDist = CAM_DISTS[this.camMode];
    }
    void followHeading;
    void dt;
    const dist = this.camDist;
    const height = 2.6 + Math.sin(this.camPitch) * dist * 0.55;
    const back = Math.cos(this.camPitch) * dist;
    const cx = this.x - Math.sin(this.camYaw) * back;
    const cz = this.z - Math.cos(this.camYaw) * back;
    this.camera.position.set(cx, Math.max(height, 1.2), cz);
    this.camera.lookAt(new THREE.Vector3(this.x, this.y + 1.6, this.z));
  }

  // Climb into the driver's seat. Returns the car, or null when it cannot be taken.
  tryEnterCar(car) {
    if (!car || car.wrecked) return null;
    this.inCar = car;
    car.driver = 'player';
    this.mesh.visible = false;
    return car;
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    car.driver = null;
    this.inCar = null;
    // Step out on the car's left side.
    const side = car.heading + Math.PI / 2;
    this.x = car.x + Math.sin(side) * 2.2;
    this.z = car.z + Math.cos(side) * 2.2;
    const fixed = this.world.collideCircle(this.x, this.z, TUNE.BODY_R);
    this.x = fixed.x;
    this.z = fixed.z;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
  }

  hurt(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(TUNE.MAX_HEALTH, this.health + amount);
  }
}
